// Per A013/ModelPicker: ConnectionStatus reads the selected model id from plugin storage
// and displays it beside the connection dot to reflect the active orchestrator model.
import { useEffect, useState } from 'react';
import { useChat, getPluginContext } from '../hooks/use-chat';
import { SELECTED_MODEL_STORAGE_KEY } from './ModelPicker/data';
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

const modelLabelStyle: React.CSSProperties = {
  marginLeft: 8,
  fontSize: 11,
  color: 'var(--text-tertiary)',
  maxWidth: 120,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
};

function useSelectedModel(): string | null {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const ctx = getPluginContext();
    if (!ctx) return;
    void ctx.storage.get<string>(SELECTED_MODEL_STORAGE_KEY).then((id) => {
      if (id) setSelectedId(id);
    });
  }, []);

  return selectedId;
}

function ConnectionStatus() {
  const { connectionStatus } = useChat();
  const color = colorForStatus(connectionStatus);
  const selectedModel = useSelectedModel();

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', color }}>
      <span aria-hidden="true" style={dotStyle(color)} />
      {labelForStatus(connectionStatus)}
      {selectedModel && (
        <span
          style={modelLabelStyle}
          title={selectedModel}
          aria-label={`Active model: ${selectedModel}`}
        >
          {selectedModel}
        </span>
      )}
    </span>
  );
}

export default ConnectionStatus;
