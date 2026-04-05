import { useCallback, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { usePreparedText, usePretextLayout } from '../../lib/pretext';
import { useContainerWidth } from './use-container-width';

interface PretextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  maxLines?: number;
  font?: string;
  lineHeight?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_FONT = '14px Inter';
const DEFAULT_LINE_HEIGHT = 22;
const DEFAULT_MAX_LINES = 6;
const PADDING_Y = 10;
const PADDING_X = 12;

export function PretextInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled = false,
  maxLines = DEFAULT_MAX_LINES,
  font = DEFAULT_FONT,
  lineHeight = DEFAULT_LINE_HEIGHT,
  className,
  style,
}: PretextInputProps) {
  const [containerRef, containerWidth] = useContainerWidth();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const textWidth = Math.max(0, containerWidth - PADDING_X * 2);
  const prepared = usePreparedText(value || ' ', font, { whiteSpace: 'pre-wrap' });
  const { lineCount } = usePretextLayout(prepared, textWidth, lineHeight);

  const clampedLines = Math.min(lineCount || 1, maxLines);
  const computedHeight = clampedLines * lineHeight + PADDING_Y * 2;
  const needsScroll = lineCount > maxLines;

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit?.();
    }
  }, [onSubmit]);

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative', ...style }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: '100%',
          height: computedHeight,
          padding: `${PADDING_Y}px ${PADDING_X}px`,
          font,
          lineHeight: `${lineHeight}px`,
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          background: 'var(--bg-default)',
          color: 'var(--text-primary)',
          resize: 'none',
          overflowY: needsScroll ? 'auto' : 'hidden',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
