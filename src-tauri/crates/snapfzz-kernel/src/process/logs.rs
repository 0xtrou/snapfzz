#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a014_process_logs_ring_buffer_keeps_last_n_lines() {
        let store = ProcessLogs::with_max_lines(std::env::temp_dir(), 3);
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
        let store = ProcessLogs::with_max_lines(std::env::temp_dir(), 10);
        store.push("agentscope", "line-1".into());
        store.clear("agentscope");
        assert!(store.tail("agentscope", 10).is_empty());
    }
}
