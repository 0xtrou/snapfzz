// Status-bar contribution: shows a simple "Orchestrator" label plus the currently
// selected ModelPicker target. Streaming / live connection state is owned by
// Spark's `AgentScopeRuntimeWebUI` internally now — this contribution is
// intentionally minimal, just surfacing the active model id.
import { useEffect, useState } from 'react';
import { getPluginContext } from './runtime';
import { SELECTED_MODEL_STORAGE_KEY } from './ModelPicker/data';

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
  const selectedModel = useSelectedModel();
  const color = 'var(--color-success)';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', color }}>
      <span aria-hidden="true" style={dotStyle(color)} />
      Orchestrator
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
