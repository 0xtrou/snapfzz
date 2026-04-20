// Per feedback/five-layer: presentational shell. Receives all state + callbacks via props.
// No useContext, no fetching, no event handlers with logic — calls prop callbacks only.
// Per project/SparkDesignFirst: Popover + Empty + Input from @agentscope-ai/design.

import { useRef } from 'react';
// Per project/SparkDesignFirst: Spark components first.
import { Popover, Empty, Input, Button } from '@agentscope-ai/design';
import { ReloadOutlined } from '@ant-design/icons';
import { ModelChip } from './parts/ModelChip';
import { ModelRow } from './parts/ModelRow';
import type { ModelPickerObservation, ModelPickerEventHandlers } from './contracts';

interface ModelPickerLayoutProps {
  readonly observation: ModelPickerObservation;
  readonly events: ModelPickerEventHandlers;
}

// Per A013/ModelPicker: fixed width + fixed height — every state renders into the same box.
// The model list scrolls inside via listStyle; short states centre inside the fill.
const popoverContentStyle: React.CSSProperties = {
  width: 400,
  height: 360,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxSizing: 'border-box',
};

// Per U009/DesignSystem: chrome lives on antd's `.ant-popover-inner` (the OUTER panel)
// instead of our inner wrapper, so there is exactly one visible border+background — not
// a doubled inner+outer pair. padding:0 also removes antd's default inset so our rows
// can sit flush against the panel edge.
const popoverInnerStyle: React.CSSProperties = {
  background: 'var(--bg-default)',
  border: '1px solid var(--border-default)',
  borderRadius: 8,
  padding: 0,
};

const searchStyle: React.CSSProperties = {
  marginBottom: 8,
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
};

// Per A013/ModelPicker: loading/error/empty fill the panel's remaining vertical space so the
// popover keeps a stable height — Spark's Empty centres its own content inside.
const fillStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  color: 'var(--text-muted)',
  fontSize: 13,
};

function PopoverContent({
  observation,
  events,
}: {
  observation: ModelPickerObservation;
  events: ModelPickerEventHandlers;
}) {
  const { loading, error, models, selectedId, pinnedIds, searchQuery } = observation;
  const { onSelect, onPin, onRefresh, onSearch } = events;

  if (loading) {
    return (
      <div style={fillStyle} data-testid="model-picker-loading">
        Loading models...
      </div>
    );
  }

  if (error) {
    return (
      <div style={fillStyle}>
        <Empty
          description={`Gateway unreachable: ${error}`}
          data-testid="model-picker-error"
        >
          <Button
            type="default"
            size="small"
            icon={<ReloadOutlined />}
            onClick={onRefresh}
            data-testid="model-picker-retry"
          >
            Retry
          </Button>
        </Empty>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div style={fillStyle}>
        <Empty
          description="No models configured"
          data-testid="model-picker-empty"
        >
          <Button
            type="default"
            size="small"
            icon={<ReloadOutlined />}
            onClick={onRefresh}
            data-testid="model-picker-retry"
          >
            Retry
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <>
      <Input
        placeholder="Search models..."
        size="small"
        value={searchQuery}
        onChange={(e) => onSearch(e.target.value)}
        style={searchStyle}
        data-testid="model-picker-search"
        allowClear
      />
      <div style={listStyle} role="listbox" aria-label="Available models">
        {/* Per A013/ModelPicker: flat list — pinned first (via sortForDisplay), then alphabetical. */}
        {models.map((model) => (
          <ModelRow
            key={model.id}
            model={model}
            selected={model.id === selectedId}
            pinned={pinnedIds.includes(model.id)}
            onSelect={onSelect}
            onPin={onPin}
          />
        ))}
      </div>
    </>
  );
}

export function ModelPickerLayout({ observation, events }: ModelPickerLayoutProps) {
  const { isOpen, selectedId } = observation;
  const { onToggleOpen } = events;
  const chipRef = useRef<HTMLDivElement>(null);

  const label = selectedId ?? 'Select model';

  const chipTrigger = (
    <div ref={chipRef}>
      <ModelChip
        label={label}
        onClick={() => onToggleOpen(!isOpen)}
      />
    </div>
  );

  return (
    // Per project/SparkDesignFirst: Spark Popover — no Ant Design Popover.
    <Popover
      open={isOpen}
      onOpenChange={onToggleOpen}
      placement="topLeft"
      trigger="click"
      overlayInnerStyle={popoverInnerStyle}
      content={
        <div style={popoverContentStyle} data-testid="model-picker-popover">
          <PopoverContent observation={observation} events={events} />
        </div>
      }
    >
      {chipTrigger}
    </Popover>
  );
}

export default ModelPickerLayout;
