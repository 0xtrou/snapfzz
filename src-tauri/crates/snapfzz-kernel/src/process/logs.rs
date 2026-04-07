use std::path::PathBuf;

use dashmap::DashMap;

const PROCESS_LOG_MAX_LINES: usize = 1000;

pub struct ProcessLogs {
    lines: DashMap<String, Vec<String>>,
    data_dir: PathBuf,
    max_lines: usize,
}

impl ProcessLogs {
    pub fn new() -> Self {
        let data_dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".snapfzz");
        Self::with_max_lines(data_dir, PROCESS_LOG_MAX_LINES)
    }

    pub fn with_max_lines(data_dir: PathBuf, max_lines: usize) -> Self {
        Self {
            lines: DashMap::new(),
            data_dir,
            max_lines,
        }
    }

    pub fn data_dir(&self) -> &PathBuf {
        &self.data_dir
    }

    fn runtime_dir(&self, name: &str) -> PathBuf {
        self.data_dir.join("runtime").join(name)
    }

    fn log_path(&self, name: &str) -> PathBuf {
        self.runtime_dir(name).join(format!("{name}.log"))
    }

    fn error_log_path(&self, name: &str) -> PathBuf {
        self.runtime_dir(name).join(format!("{name}_error.log"))
    }

    pub fn pid_path(&self, name: &str) -> PathBuf {
        self.runtime_dir(name).join(format!("{name}.pid"))
    }

    fn ensure_dir(&self, name: &str) {
        let _ = std::fs::create_dir_all(self.runtime_dir(name));
    }

    pub fn push(&self, name: &str, line: String) {
        let mut entry = self.lines.entry(name.to_string()).or_default();
        if entry.len() >= self.max_lines {
            let excess = entry.len() - self.max_lines + 1;
            entry.drain(..excess);
        }

        self.ensure_dir(name);
        let log_file = if line.starts_with("[stderr]") {
            self.error_log_path(name)
        } else {
            self.log_path(name)
        };
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_file)
        {
            use std::io::Write;
            let _ = writeln!(file, "{}", line);
        }

        entry.push(line);
    }

    pub fn tail(&self, name: &str, n: usize) -> Vec<String> {
        let entry = match self.lines.get(name) {
            Some(entry) => entry,
            None => return Vec::new(),
        };
        let start = entry.len().saturating_sub(n);
        entry[start..].to_vec()
    }

    pub fn clear(&self, name: &str) {
        if let Some(mut entry) = self.lines.get_mut(name) {
            entry.clear();
        }
        let _ = std::fs::remove_file(self.log_path(name));
        let _ = std::fs::remove_file(self.error_log_path(name));
    }
}

impl Default for ProcessLogs {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a014_process_logs_ring_buffer_keeps_last_n_lines() {
        let temp = tempfile::tempdir().expect("tempdir");
        let store = ProcessLogs::with_max_lines(temp.path().to_path_buf(), 3);
        store.push("agentscope", "line-1".into());
        store.push("agentscope", "line-2".into());
        store.push("agentscope", "line-3".into());
        store.push("agentscope", "line-4".into());

        assert_eq!(
            store.tail("agentscope", 10),
            vec!["line-2", "line-3", "line-4"]
        );
    }

    #[test]
    fn a014_process_logs_clear_removes_process_lines() {
        let temp = tempfile::tempdir().expect("tempdir");
        let store = ProcessLogs::with_max_lines(temp.path().to_path_buf(), 10);
        store.push("agentscope", "line-1".into());
        store.clear("agentscope");
        assert!(store.tail("agentscope", 10).is_empty());
    }
}
