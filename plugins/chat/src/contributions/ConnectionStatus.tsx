import { useChat } from '../hooks/use-chat';
import type { AgentHealthResponse } from '../types';

function labelForStatus(status: AgentHealthResponse['status']): string {
  if (status === 'connected') {
    return '● Connected';
  }

  if (status === 'reconnecting') {
    return '○ Reconnecting...';
  }

  return '○ Disconnected';
}

function colorForStatus(status: AgentHealthResponse['status']): string {
  if (status === 'connected') {
    return 'var(--color-success)';
  }

  if (status === 'reconnecting') {
    return 'var(--color-warning)';
  }

  return 'var(--color-error)';
}

function ConnectionStatus() {
  const { connectionStatus } = useChat();
  return <span style={{ color: colorForStatus(connectionStatus) }}>{labelForStatus(connectionStatus)}</span>;
}

export default ConnectionStatus;
