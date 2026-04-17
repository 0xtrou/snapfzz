// Per feedback/small-components + project/SparkDesignFirst: composer wrapping Spark Sender.
// Pure presentational — receives loading + callbacks, emits onSubmit/onCancel.
// Per A013/ModelPicker: accepts optional `prefix` ReactNode that threads into Spark Sender's
// prefix slot — used to mount the ModelChip without Sender needing to know about it.

import type { ReactNode } from 'react';
import { Sender } from '@agentscope-ai/chat';
import { PLACEHOLDER_TEXT } from '../data';

interface ChatComposerProps {
  readonly loading: boolean;
  readonly onSubmit: (text: string) => void;
  readonly onCancel: () => void;
  /** Optional prefix node forwarded to Spark Sender's prefix slot (e.g. ModelChip). */
  readonly prefix?: ReactNode;
}

export function ChatComposer({ loading, onSubmit, onCancel, prefix }: ChatComposerProps) {
  // Per A013/ModelPicker: wrap the prefix so composer controls sit vertically centred
  // relative to Spark's Sender action row, with consistent spacing between each child
  // (PlusButton, ModelChip, …).
  const centeredPrefix = prefix ? (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: '100%',
      }}
    >
      {prefix}
    </span>
  ) : undefined;

  return (
    <div style={{ padding: 12, borderTop: '1px solid var(--border-default)', background: 'var(--bg-default)' }}>
      <Sender
        placeholder={PLACEHOLDER_TEXT}
        loading={loading}
        onSubmit={onSubmit}
        onCancel={onCancel}
        submitType="enter"
        allowSpeech
        prefix={centeredPrefix}
      />
    </div>
  );
}

export default ChatComposer;
