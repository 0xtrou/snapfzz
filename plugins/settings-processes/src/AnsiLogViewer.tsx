// A001/LogTailing: Renders process logs with ANSI color code support.
// Uses ansi_up for lightweight ANSI-to-HTML conversion (~12KB vs xterm.js ~500KB).
import { useEffect, useRef, useMemo } from 'react';
import { AnsiUp } from 'ansi_up';

interface AnsiLogViewerProps {
  logs: string[];
  maxLines?: number;
  'data-testid'?: string;
}

let ansiUpInstance: AnsiUp | null = null;

function getAnsiUp(): AnsiUp {
  if (!ansiUpInstance) {
    ansiUpInstance = new AnsiUp();
  }
  return ansiUpInstance;
}

function ansiToHtml(line: string): string {
  const ansiUp = getAnsiUp();
  return ansiUp.ansi_to_html(line);
}

export default function AnsiLogViewer({
  logs,
  maxLines = 100,
  'data-testid': testId,
}: AnsiLogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const displayLogs = useMemo(() => {
    const start = Math.max(0, logs.length - maxLines);
    return logs.slice(start);
  }, [logs, maxLines]);

  useEffect(() => {
    if (containerRef.current && displayLogs.length > 0) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayLogs]);

  return (
    <div
      ref={containerRef}
      data-testid={testId}
      style={{
        maxHeight: 200,
        overflowY: 'auto',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-default)',
        borderRadius: 6,
        padding: '8px 12px',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
      }}
    >
      {displayLogs.length === 0 ? (
        <div style={{ color: 'var(--text-muted)' }}>No logs</div>
      ) : (
        displayLogs.map((line, idx) => (
          <div
            key={`log-${idx}-${line.slice(0, 20)}`}
            dangerouslySetInnerHTML={{ __html: ansiToHtml(line) }}
          />
        ))
      )}
    </div>
  );
}

export { ansiToHtml };