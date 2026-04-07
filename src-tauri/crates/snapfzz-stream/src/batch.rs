use std::collections::VecDeque;
use std::time::{Duration, Instant};

use crate::types::{ContentBlock, ContentBlockBatch};

#[derive(Debug)]
pub struct BatchAccumulator {
    session_id: String,
    pending_blocks: Vec<ContentBlock>,
    batch_id: u32,
    batch_token_count: usize,
    next_flush_at: Instant,
}

impl BatchAccumulator {
    pub fn new(session_id: impl Into<String>, now: Instant) -> Self {
        Self {
            session_id: session_id.into(),
            pending_blocks: Vec::new(),
            batch_id: 0,
            batch_token_count: 0,
            next_flush_at: now,
        }
    }

    pub fn push_blocks<I>(&mut self, blocks: I)
    where
        I: IntoIterator<Item = ContentBlock>,
    {
        let blocks: Vec<ContentBlock> = blocks.into_iter().collect();
        self.batch_token_count += blocks.len();
        self.pending_blocks.extend(blocks);
    }

    pub fn flush_due(&mut self, now: Instant, batch_interval_ms: u64) -> Option<ContentBlockBatch> {
        if now < self.next_flush_at + Duration::from_millis(batch_interval_ms) {
            return None;
        }

        self.next_flush_at = now;
        self.take_batch(false)
    }

    pub fn finish(&mut self) -> VecDeque<ContentBlockBatch> {
        let mut batches = VecDeque::new();

        if let Some(batch) = self.take_batch(false) {
            batches.push_back(batch);
        }

        if let Some(done_batch) = self.take_done_batch() {
            batches.push_back(done_batch);
        }

        batches
    }

    fn take_batch(&mut self, done: bool) -> Option<ContentBlockBatch> {
        if self.pending_blocks.is_empty() && !done {
            return None;
        }

        let batch = ContentBlockBatch {
            session_id: self.session_id.clone(),
            batch_id: self.batch_id,
            token_count: self.batch_token_count,
            blocks: std::mem::take(&mut self.pending_blocks),
            done,
        };

        self.batch_id += 1;
        self.batch_token_count = 0;
        Some(batch)
    }

    fn take_done_batch(&mut self) -> Option<ContentBlockBatch> {
        self.take_batch(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a001_stream_batching_flushes_when_interval_elapses() {
        let start = Instant::now();
        let mut accumulator = BatchAccumulator::new("session-1", start);
        accumulator.push_blocks([ContentBlock::text("hello")]);

        let batch = accumulator
            .flush_due(start + Duration::from_millis(17), 16)
            .expect("expected batch flush after interval");

        assert_eq!(batch.session_id, "session-1");
        assert_eq!(batch.batch_id, 0);
        assert_eq!(batch.token_count, 1);
        assert_eq!(batch.blocks, vec![ContentBlock::text("hello")]);
        assert!(!batch.done);
    }

    #[test]
    fn a001_stream_batching_does_not_flush_before_interval() {
        let start = Instant::now();
        let mut accumulator = BatchAccumulator::new("session-1", start);
        accumulator.push_blocks([ContentBlock::text("hello")]);

        let batch = accumulator.flush_due(start + Duration::from_millis(15), 16);

        assert!(batch.is_none());
    }

    #[test]
    fn a001_stream_batching_finish_flushes_pending_and_done_batches() {
        let start = Instant::now();
        let mut accumulator = BatchAccumulator::new("session-1", start);
        accumulator.push_blocks([ContentBlock::text("hello"), ContentBlock::text("world")]);

        let batches = accumulator.finish();
        let batches: Vec<_> = batches.into_iter().collect();

        assert_eq!(batches.len(), 2);
        assert_eq!(batches[0].batch_id, 0);
        assert_eq!(batches[0].token_count, 2);
        assert_eq!(
            batches[0].blocks,
            vec![ContentBlock::text("hello"), ContentBlock::text("world")]
        );
        assert!(!batches[0].done);
        assert_eq!(batches[1].batch_id, 1);
        assert_eq!(batches[1].token_count, 0);
        assert!(batches[1].blocks.is_empty());
        assert!(batches[1].done);
    }

    #[test]
    fn a001_stream_batching_finish_sends_only_done_batch_without_pending_blocks() {
        let start = Instant::now();
        let mut accumulator = BatchAccumulator::new("session-1", start);

        let batches = accumulator.finish();
        let batches: Vec<_> = batches.into_iter().collect();

        assert_eq!(batches.len(), 1);
        assert_eq!(batches[0].batch_id, 0);
        assert_eq!(batches[0].token_count, 0);
        assert!(batches[0].blocks.is_empty());
        assert!(batches[0].done);
    }
}
