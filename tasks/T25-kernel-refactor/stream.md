# T25 — snapfzz-stream extraction report

## Scope
Extracted SSE streaming pipeline from `src-tauri/src/main.rs` into existing `src-tauri/crates/snapfzz-stream/src/` files without touching `main.rs`, frontend, or kernel files.

## Spec Trace
- `A014/KernelArchitecture`: stream crate owns SSE consumer + batching pipeline.
- `A001/Performance`: interval-gated batching behavior preserved.
- `A002/StateManagement`: streaming/parsing/batching stays in Rust (Zone 1).

## Files updated
- `src-tauri/crates/snapfzz-stream/src/types.rs`
  - Added `ContentBlock`, `ContentBlockBatch`, `MessageResult`, `Delta`, `StopReason`, and related serde payload structs (`MessageMetadata`, `ChoiceDelta`, `Choice`, `SsePayload`).
  - Implemented `StopReason::as_str()` for final result mapping.
- `src-tauri/crates/snapfzz-stream/src/sse.rs`
  - Added request builder + SSE open helpers: `build_sse_request`, `open_event_source`.
  - Added SSE decode/parser flow: `decode_sse_events`, `parse_event`, `extract_content_blocks`.
  - Added `StreamState` accumulator for `message_id`, `total_tokens`, and `finish_reason`.
  - Added `SseError` for request clone / stream errors.
- `src-tauri/crates/snapfzz-stream/src/batch.rs`
  - Added `BatchAccumulator` with interval-gated flush and final done-batch handling.
- `src-tauri/crates/snapfzz-stream/src/lib.rs`
  - Added crate modules/re-exports.
  - Added `StreamError` and callback-based `send_and_consume` (no `tauri` dependency).
  - `send_and_consume` now:
    1. Builds request body,
    2. Opens SSE stream,
    3. Parses events into content blocks,
    4. Batches by `batch_interval_ms`,
    5. Emits via `FnMut(ContentBlockBatch)`,
    6. Returns final `MessageResult`.
- `src-tauri/crates/snapfzz-stream/Cargo.toml`
  - Set `reqwest-eventsource = "0.6"` (compatible version on crates.io).
  - Added `futures = "0.3"` for stream extension trait.
- `src-tauri/Cargo.toml`
  - Added workspace member: `crates/snapfzz-stream` so required package verification commands run.

## Tests added
- `batch.rs`
  - `a001_stream_batching_flushes_when_interval_elapses`
  - `a001_stream_batching_does_not_flush_before_interval`
  - `a001_stream_batching_finish_flushes_pending_and_done_batches`
  - `a001_stream_batching_finish_sends_only_done_batch_without_pending_blocks`
- `sse.rs`
  - `a001_stream_parsing_extracts_content_blocks_array`
  - `a001_stream_parsing_extracts_delta_content_block_array`
  - `a001_stream_parsing_extracts_delta_content_string`
  - `a001_stream_parsing_extracts_openai_choices_delta_content`
  - `a001_stream_parsing_decodes_done_event`
  - `a001_stream_parsing_decodes_payload_event_and_metadata_finish_reason`
  - `a001_stream_parsing_stream_state_accumulates_tokens_and_reason`

## Verification
Executed from `src-tauri/`:

1. `cargo check -p snapfzz-stream`
   - ✅ pass
2. `cargo test -p snapfzz-stream --lib`
   - ✅ pass (11 tests)
3. LSP diagnostics on changed stream files
   - ✅ no diagnostics found

## Notes
- Stream crate remains fully decoupled from Tauri; batch delivery uses callback contract only.
- Main.rs wiring intentionally untouched per assignment constraints.
