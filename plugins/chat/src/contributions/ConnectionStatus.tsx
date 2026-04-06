import { useChat } from '../hooks/use-chat';
import type { AgentHealthResponse } from '../types';

function labelForStatus(status: AgentHealthResponse['status']): string {
  if (status === 'connected') {
    return 'Connected';
  }

  if (status === 'reconnecting') {
    return 'Reconnecting...';
  }

  return 'Disconnected';
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

const dotStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: color,
  marginRight: 6,
  verticalAlign: 'middle',
});

function ConnectionStatus() {
  const { connectionStatus } = useChat();
  const color = colorForStatus(connectionStatus);
  return (
    <span style={{ color }}>
      <span aria-hidden="true" style={dotStyle(color)} />
      {labelForStatus(connectionStatus)}
    </span>
  );
}

export default ConnectionStatus;
