// Token-usage contribution. Spark's `AgentScopeRuntimeWebUI` tracks streaming
// state internally and exposes per-turn usage inside each message object rather
// than as a global counter, so this status-bar item is a static placeholder
// until we wire a Spark-provided reactive source. Kept as a contribution so
// the plugin manifest stays stable.

function TokenCounter() {
  return <span style={{ color: 'var(--text-secondary)' }}>— tokens</span>;
}

export default TokenCounter;
