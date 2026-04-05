import { type CSSProperties } from 'react';
import { usePreparedText, usePretextLayout } from '../../lib/pretext';
import { useContainerWidth } from './use-container-width';

interface PretextTextProps {
  text: string;
  font?: string;
  lineHeight?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_FONT = '14px Inter';
const DEFAULT_LINE_HEIGHT = 22;

export function PretextText({
  text,
  font = DEFAULT_FONT,
  lineHeight = DEFAULT_LINE_HEIGHT,
  className,
  style,
}: PretextTextProps) {
  const [ref, width] = useContainerWidth();
  const prepared = usePreparedText(text, font);
  const { height } = usePretextLayout(prepared, width, lineHeight);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        height: height || undefined,
        lineHeight: `${lineHeight}px`,
        font,
        overflowWrap: 'break-word',
        ...style,
      }}
    >
      {text}
    </div>
  );
}
