use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use futures::StreamExt;
use sha1::{Digest, Sha1};

use crate::core::component::{ComponentError, DownloadProgress, DownloadStatus};

pub fn pct(downloaded: u64, total: u64) -> f32 {
    if total == 0 {
        0.0
    } else {
        ((downloaded as f32 / total as f32) * 100.0).min(100.0)
    }
}

pub fn sha1_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

pub fn verify_sha1(path: &Path, expected: &str) -> Result<(), ComponentError> {
    let bytes = std::fs::read(path)?;
    let actual = sha1_hex(&bytes);
    if actual != expected {
        let _ = std::fs::remove_file(path);
        return Err(ComponentError::ChecksumMismatch {
            expected: expected.to_string(),
            actual,
        });
    }
    Ok(())
}

pub fn extract_tar_bz2(archive_path: &Path, dest_dir: &Path) -> Result<(), ComponentError> {
    let file = std::fs::File::open(archive_path)?;
    let decompressor = bzip2::read::BzDecoder::new(file);
    let mut archive = tar::Archive::new(decompressor);
    archive
        .unpack(dest_dir)
        .map_err(|e| ComponentError::internal(format!("Extract failed: {e}")))?;
    Ok(())
}

pub fn extract_tar_gz(archive_path: &Path, dest_dir: &Path) -> Result<(), ComponentError> {
    let file = std::fs::File::open(archive_path)?;
    let decompressor = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(decompressor);
    archive
        .unpack(dest_dir)
        .map_err(|e| ComponentError::internal(format!("Extract failed: {e}")))?;
    Ok(())
}

pub async fn download_file(
    url: &str,
    dest: &Path,
    expected_size: u64,
    cancelled: &AtomicBool,
    component_id: &str,
) -> Result<Vec<DownloadProgress>, ComponentError> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }

    if cancelled.load(Ordering::SeqCst) {
        return Ok(vec![DownloadProgress {
            component_id: component_id.into(),
            bytes_downloaded: 0,
            bytes_total: expected_size,
            percent: 0.0,
            status: DownloadStatus::Cancelled,
        }]);
    }

    let existing_bytes = std::fs::metadata(dest).map(|m| m.len()).unwrap_or(0);
    let client = reqwest::Client::new();
    let mut request = client.get(url);

    if existing_bytes > 0 && existing_bytes < expected_size {
        request = request.header("Range", format!("bytes={existing_bytes}-"));
    }

    let response = request
        .send()
        .await
        .map_err(|e| ComponentError::network(format!("Download request failed: {e}")))?;

    if !response.status().is_success() && response.status().as_u16() != 206 {
        return Err(ComponentError::network(format!(
            "HTTP {}",
            response.status()
        )));
    }

    let is_resume = response.status().as_u16() == 206;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(is_resume)
        .write(true)
        .truncate(!is_resume)
        .open(dest)?;

    let mut bytes_downloaded = if is_resume { existing_bytes } else { 0 };
    let bytes_total = if expected_size > 0 {
        expected_size
    } else {
        response
            .content_length()
            .map(|cl| cl + bytes_downloaded)
            .unwrap_or(0)
    };

    let mut progress_events = Vec::new();
    let mut stream = response.bytes_stream();
    let mut last_reported_pct: i32 = -1;

    while let Some(chunk_result) = stream.next().await {
        if cancelled.load(Ordering::SeqCst) {
            progress_events.push(DownloadProgress {
                component_id: component_id.into(),
                bytes_downloaded,
                bytes_total,
                percent: pct(bytes_downloaded, bytes_total),
                status: DownloadStatus::Cancelled,
            });
            return Ok(progress_events);
        }

        let chunk =
            chunk_result.map_err(|e| ComponentError::network(format!("Stream error: {e}")))?;

        file.write_all(&chunk)?;
        bytes_downloaded += chunk.len() as u64;

        let current_pct = pct(bytes_downloaded, bytes_total) as i32;
        if current_pct > last_reported_pct {
            last_reported_pct = current_pct;
            progress_events.push(DownloadProgress {
                component_id: component_id.into(),
                bytes_downloaded,
                bytes_total,
                percent: pct(bytes_downloaded, bytes_total),
                status: DownloadStatus::Downloading,
            });
        }
    }

    drop(file);

    progress_events.push(DownloadProgress {
        component_id: component_id.into(),
        bytes_downloaded,
        bytes_total,
        percent: 100.0,
        status: DownloadStatus::Ready,
    });

    Ok(progress_events)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::Path;

    #[test]
    fn a014_components_pct_zero_total_returns_zero() {
        assert_eq!(pct(0, 0), 0.0);
    }

    #[test]
    fn a014_components_pct_half_returns_50() {
        assert_eq!(pct(50, 100), 50.0);
    }

    #[test]
    fn a014_components_pct_overflow_capped_at_100() {
        assert_eq!(pct(200, 100), 100.0);
    }

    #[test]
    fn a014_components_sha1_hex_produces_40_char_hash() {
        let hash = sha1_hex(b"hello world");
        assert_eq!(hash.len(), 40);
        assert_eq!(hash, "2aae6c35c94fcfb415dbe95f408b9ce91ee846ed");
    }

    #[test]
    fn a014_components_verify_sha1_accepts_matching_digest() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("test.bin");
        let data = b"expected-bytes";
        std::fs::write(&path, data).unwrap();
        let expected = sha1_hex(data);
        verify_sha1(&path, &expected).unwrap();
        assert!(path.exists());
    }

    #[test]
    fn a014_components_verify_sha1_rejects_mismatch_and_deletes_file() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("test.bin");
        std::fs::write(&path, b"actual-bytes").unwrap();
        let err = verify_sha1(&path, "deadbeef").unwrap_err();
        assert!(matches!(err, ComponentError::ChecksumMismatch { .. }));
        assert!(!path.exists());
    }

    #[test]
    fn a014_components_verify_sha1_returns_io_error_when_file_missing() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("nonexistent.bin");
        let err = verify_sha1(&path, "abc").unwrap_err();
        assert!(matches!(err, ComponentError::Io(_)));
    }

    #[test]
    fn a014_components_extract_tar_bz2_decompresses_files() {
        let temp = tempfile::tempdir().unwrap();
        let archive_path = temp.path().join("test.tar.bz2");
        let dest_dir = temp.path().join("out-bz2");
        create_test_tar_bz2(
            &archive_path,
            &[("cef_binary/test.txt", b"hello world"), ("cef_binary/nested/config.json", br#"{"ok":true}"#)],
        );

        let result = extract_tar_bz2(&archive_path, &dest_dir);

        assert!(result.is_ok());
        assert_eq!(
            std::fs::read_to_string(dest_dir.join("cef_binary/test.txt")).unwrap(),
            "hello world"
        );
        assert_eq!(
            std::fs::read_to_string(dest_dir.join("cef_binary/nested/config.json")).unwrap(),
            "{\"ok\":true}"
        );
    }

    #[test]
    fn a014_components_extract_tar_gz_decompresses_files() {
        let temp = tempfile::tempdir().unwrap();
        let archive_path = temp.path().join("test.tar.gz");
        let dest_dir = temp.path().join("out-gz");
        create_test_tar_gz(&archive_path, &[("payload/file.txt", b"gzip payload")]);

        let result = extract_tar_gz(&archive_path, &dest_dir);

        assert!(result.is_ok());
        assert_eq!(
            std::fs::read_to_string(dest_dir.join("payload/file.txt")).unwrap(),
            "gzip payload"
        );
    }

    #[test]
    fn a014_components_extract_tar_bz2_returns_error_for_missing_file() {
        let temp = tempfile::tempdir().unwrap();
        let archive_path = temp.path().join("missing.tar.bz2");
        let dest_dir = temp.path().join("out");

        let err = extract_tar_bz2(&archive_path, &dest_dir).unwrap_err();

        assert!(matches!(err, ComponentError::Io(_)));
    }

    fn create_test_tar_bz2(path: &Path, files: &[(&str, &[u8])]) {
        let file = std::fs::File::create(path).unwrap();
        let compressor = bzip2::write::BzEncoder::new(file, bzip2::Compression::fast());
        let mut archive = tar::Builder::new(compressor);
        for (name, data) in files {
            let mut header = tar::Header::new_gnu();
            header.set_size(data.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            archive.append_data(&mut header, name, &data[..]).unwrap();
        }
        archive.finish().unwrap();
    }

    fn create_test_tar_gz(path: &Path, files: &[(&str, &[u8])]) {
        let file = std::fs::File::create(path).unwrap();
        let compressor = flate2::write::GzEncoder::new(file, flate2::Compression::default());
        let mut archive = tar::Builder::new(compressor);
        for (name, data) in files {
            let mut header = tar::Header::new_gnu();
            header.set_size(data.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            archive.append_data(&mut header, name, &data[..]).unwrap();
        }
        archive.into_inner().unwrap().flush().unwrap();
    }

    #[tokio::test]
    async fn a014_components_download_file_returns_cancelled_when_flag_set() {
        let temp = tempfile::tempdir().unwrap();
        let dest = temp.path().join("download.bin");
        let cancelled = AtomicBool::new(true);
        let events = download_file(
            "https://example.com/nonexistent",
            &dest,
            1000,
            &cancelled,
            "test",
        )
        .await
        .unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].status, DownloadStatus::Cancelled);
        assert_eq!(events[0].component_id, "test");
    }

    // ── extract_tar_gz: missing archive ──────────────────────────────────────

    #[test]
    fn a014_components_extract_tar_gz_returns_error_for_missing_file() {
        let temp = tempfile::tempdir().unwrap();
        let archive_path = temp.path().join("missing.tar.gz");
        let dest_dir = temp.path().join("out");

        let err = extract_tar_gz(&archive_path, &dest_dir).unwrap_err();

        assert!(matches!(err, ComponentError::Io(_)));
    }

    // ── pct: boundary at 1 byte ──────────────────────────────────────────────

    #[test]
    fn a014_components_pct_one_of_one_is_100() {
        assert_eq!(pct(1, 1), 100.0);
    }

    #[test]
    fn a014_components_pct_zero_downloaded_is_zero() {
        assert_eq!(pct(0, 1000), 0.0);
    }

    // ── download_file: mock HTTP server tests ───────────────────────────────

    #[tokio::test]
    async fn t32_download_file_success_writes_file_and_returns_progress() {
        let mut server = mockito::Server::new_async().await;
        let body = b"hello-download-world-payload";
        let mock = server
            .mock("GET", "/artifact.bin")
            .with_status(200)
            .with_header("content-length", &body.len().to_string())
            .with_body(body)
            .create_async()
            .await;

        let temp = tempfile::tempdir().unwrap();
        let dest = temp.path().join("artifact.bin");
        let cancelled = AtomicBool::new(false);

        let events = download_file(
            &format!("{}/artifact.bin", server.url()),
            &dest,
            body.len() as u64,
            &cancelled,
            "test-comp",
        )
        .await
        .unwrap();

        mock.assert_async().await;
        assert!(dest.exists());
        assert_eq!(std::fs::read(&dest).unwrap(), body);
        assert!(!events.is_empty());
        let last = events.last().unwrap();
        assert_eq!(last.status, DownloadStatus::Ready);
        assert_eq!(last.percent, 100.0);
        assert_eq!(last.component_id, "test-comp");
        assert_eq!(last.bytes_downloaded, body.len() as u64);
    }

    #[tokio::test]
    async fn t32_download_file_404_returns_network_error() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/missing.bin")
            .with_status(404)
            .with_body("not found")
            .create_async()
            .await;

        let temp = tempfile::tempdir().unwrap();
        let dest = temp.path().join("missing.bin");
        let cancelled = AtomicBool::new(false);

        let err = download_file(
            &format!("{}/missing.bin", server.url()),
            &dest,
            100,
            &cancelled,
            "test-404",
        )
        .await
        .unwrap_err();

        mock.assert_async().await;
        assert!(matches!(err, ComponentError::Network(_)));
        assert!(err.to_string().contains("HTTP 404"));
    }

    #[tokio::test]
    async fn t32_download_file_500_returns_network_error() {
        let mut server = mockito::Server::new_async().await;
        let mock = server
            .mock("GET", "/error.bin")
            .with_status(500)
            .with_body("internal server error")
            .create_async()
            .await;

        let temp = tempfile::tempdir().unwrap();
        let dest = temp.path().join("error.bin");
        let cancelled = AtomicBool::new(false);

        let err = download_file(
            &format!("{}/error.bin", server.url()),
            &dest,
            0,
            &cancelled,
            "test-500",
        )
        .await
        .unwrap_err();

        mock.assert_async().await;
        assert!(matches!(err, ComponentError::Network(_)));
        assert!(err.to_string().contains("HTTP 500"));
    }

    #[tokio::test]
    async fn t32_download_file_progress_events_increase_monotonically() {
        let mut server = mockito::Server::new_async().await;
        // Use a larger body to generate multiple progress events
        let body = vec![0xABu8; 2048];
        let mock = server
            .mock("GET", "/large.bin")
            .with_status(200)
            .with_header("content-length", &body.len().to_string())
            .with_body(&body)
            .create_async()
            .await;

        let temp = tempfile::tempdir().unwrap();
        let dest = temp.path().join("large.bin");
        let cancelled = AtomicBool::new(false);

        let events = download_file(
            &format!("{}/large.bin", server.url()),
            &dest,
            body.len() as u64,
            &cancelled,
            "progress-test",
        )
        .await
        .unwrap();

        mock.assert_async().await;
        assert!(events.len() >= 2); // at least one Downloading + final Ready
        for window in events.windows(2) {
            assert!(window[1].bytes_downloaded >= window[0].bytes_downloaded);
        }
        assert_eq!(events.last().unwrap().status, DownloadStatus::Ready);
    }

    #[tokio::test]
    async fn t32_download_file_creates_parent_directories() {
        let mut server = mockito::Server::new_async().await;
        let body = b"nested-file";
        let mock = server
            .mock("GET", "/nested.bin")
            .with_status(200)
            .with_header("content-length", &body.len().to_string())
            .with_body(body)
            .create_async()
            .await;

        let temp = tempfile::tempdir().unwrap();
        let dest = temp.path().join("a").join("b").join("c").join("nested.bin");
        let cancelled = AtomicBool::new(false);

        let events = download_file(
            &format!("{}/nested.bin", server.url()),
            &dest,
            body.len() as u64,
            &cancelled,
            "nested",
        )
        .await
        .unwrap();

        mock.assert_async().await;
        assert!(dest.exists());
        assert_eq!(std::fs::read(&dest).unwrap(), body);
        assert_eq!(events.last().unwrap().status, DownloadStatus::Ready);
    }

    #[tokio::test]
    async fn t32_download_file_zero_expected_size_uses_content_length() {
        let mut server = mockito::Server::new_async().await;
        let body = b"auto-size-content";
        let mock = server
            .mock("GET", "/auto.bin")
            .with_status(200)
            .with_header("content-length", &body.len().to_string())
            .with_body(body)
            .create_async()
            .await;

        let temp = tempfile::tempdir().unwrap();
        let dest = temp.path().join("auto.bin");
        let cancelled = AtomicBool::new(false);

        let events = download_file(
            &format!("{}/auto.bin", server.url()),
            &dest,
            0, // zero expected_size → should use content-length
            &cancelled,
            "auto-size",
        )
        .await
        .unwrap();

        mock.assert_async().await;
        let last = events.last().unwrap();
        assert_eq!(last.status, DownloadStatus::Ready);
        assert_eq!(last.bytes_downloaded, body.len() as u64);
        assert_eq!(last.bytes_total, body.len() as u64);
    }

    #[tokio::test]
    async fn t32_download_file_206_resume_appends_to_existing() {
        let mut server = mockito::Server::new_async().await;
        // Server returns 206 with the remaining bytes
        let remaining = b"remaining-data";
        let mock = server
            .mock("GET", "/resume.bin")
            .match_header("Range", "bytes=5-")
            .with_status(206)
            .with_body(remaining)
            .create_async()
            .await;

        let temp = tempfile::tempdir().unwrap();
        let dest = temp.path().join("resume.bin");
        // Pre-write 5 bytes to simulate partial download
        std::fs::write(&dest, b"HELLO").unwrap();
        let cancelled = AtomicBool::new(false);

        let events = download_file(
            &format!("{}/resume.bin", server.url()),
            &dest,
            5 + remaining.len() as u64,
            &cancelled,
            "resume-test",
        )
        .await
        .unwrap();

        mock.assert_async().await;
        let content = std::fs::read(&dest).unwrap();
        // Append mode: original bytes + remaining
        assert_eq!(&content[..5], b"HELLO");
        assert_eq!(&content[5..], remaining);
        let last = events.last().unwrap();
        assert_eq!(last.status, DownloadStatus::Ready);
    }

    // ── sha1_hex: deterministic for empty bytes ───────────────────────────────

    #[test]
    fn a014_components_sha1_hex_empty_bytes_is_known_digest() {
        // SHA1("") = da39a3ee5e6b4b0d3255bfef95601890afd80709
        let hash = sha1_hex(b"");
        assert_eq!(hash, "da39a3ee5e6b4b0d3255bfef95601890afd80709");
    }

    // ── verify_sha1: directory path returns Io error ──────────────────────────

    #[test]
    fn a014_components_verify_sha1_returns_io_error_for_directory() {
        let temp = tempfile::tempdir().unwrap();
        // Passing a directory (not a file) to std::fs::read should return an error
        let err = verify_sha1(temp.path(), "abc").unwrap_err();
        assert!(matches!(err, ComponentError::Io(_)));
    }

    // ── download_file: HTTP error path ───────────────────────────────────────

    #[tokio::test]
    async fn a014_components_download_file_returns_network_error_on_bad_url() {
        let temp = tempfile::tempdir().unwrap();
        let dest = temp.path().join("out.bin");
        let cancelled = AtomicBool::new(false);
        // Use a non-routable IP to get a connection-refused or timeout error
        let err = download_file(
            "http://127.0.0.1:19999/nonexistent",
            &dest,
            0,
            &cancelled,
            "test-dl",
        )
        .await
        .unwrap_err();
        assert!(matches!(err, ComponentError::Network(_)));
    }

    // ── download_file: creates parent directories ─────────────────────────────

    #[tokio::test]
    async fn a014_components_download_file_cancelled_creates_no_file() {
        let temp = tempfile::tempdir().unwrap();
        let dest = temp.path().join("subdir").join("deep").join("out.bin");
        let cancelled = AtomicBool::new(true);
        let events = download_file(
            "https://example.com/notreal",
            &dest,
            500,
            &cancelled,
            "cmp",
        )
        .await
        .unwrap();
        // Cancelled before any network call → no file written
        assert_eq!(events[0].status, DownloadStatus::Cancelled);
        assert_eq!(events[0].bytes_downloaded, 0);
        assert_eq!(events[0].bytes_total, 500);
        assert_eq!(events[0].component_id, "cmp");
        assert!(events[0].percent == 0.0);
    }
}
