import { useChat } from '../hooks/use-chat';

function formatTokenCount(tokenCount: number): string {
  return `${tokenCount.toLocaleString()} tokens`;
}

function TokenCounter() {
  const { tokenCount } = useChat();
  return <span style={{ color: 'var(--text-secondary)' }}>{formatTokenCount(tokenCount)}</span>;
}

export default TokenCounter;
