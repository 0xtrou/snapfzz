import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

interface ComposerProps {
  disabled: boolean;
  isStreaming: boolean;
  onSend: (value: string) => Promise<void>;
  onStop: () => Promise<void>;
}

const MAX_ROWS = 6;
const LINE_HEIGHT = 22;
const BASE_HEIGHT = 44;

export function Composer({ disabled, isStreaming, onSend, onStop }: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const maxHeight = useMemo(() => BASE_HEIGHT + LINE_HEIGHT * (MAX_ROWS - 1), []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [maxHeight, value]);

  const submit = async () => {
    const next = value.trim();
    if (next.length === 0 || disabled || isStreaming) {
      return;
    }

    setValue('');
    await onSend(next);
  };

  const handleKeyDown = async (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      await submit();
      return;
    }

    if (event.key === 'Escape' && isStreaming) {
      event.preventDefault();
      await onStop();
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 12,
        borderTop: '1px solid var(--border-default)',
        padding: 12,
        background: 'var(--bg-default)',
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => void handleKeyDown(event)}
        disabled={disabled && !isStreaming}
        placeholder="Ask the orchestrator anything..."
        rows={1}
        style={{
          resize: 'none',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          background: 'var(--bg-input)',
          color: 'var(--text-primary)',
          padding: '10px 12px',
          fontSize: 14,
          lineHeight: `${LINE_HEIGHT}px`,
          minHeight: BASE_HEIGHT,
          maxHeight,
          outline: 'none',
        }}
      />
      <button
        type="button"
        onClick={() => {
          if (isStreaming) {
            void onStop();
            return;
          }
          void submit();
        }}
        style={{
          minWidth: 88,
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          background: isStreaming ? 'var(--bg-subtle)' : 'var(--accent)',
          color: isStreaming ? 'var(--text-primary)' : 'var(--bg-default)',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'opacity 140ms ease, transform 140ms ease',
          transform: 'translateZ(0)',
          padding: '0 14px',
        }}
      >
        {isStreaming ? 'Stop' : 'Send ⌘↵'}
      </button>
    </div>
  );
}
