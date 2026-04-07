// Per A001/Performance + A008/BudgetRegistry: FPS counter reports against frame budget from preset.
// Actual enforcement is in Rust (SSE batch_rate_ms gates token delivery to the target frame rate).
import { useState, useEffect, useRef, type ReactNode } from 'react';

function FpsCounter() {
  const [fps, setFps] = useState(0);
  const [targetMs, setTargetMs] = useState(16);
  const framesRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const lastFrameRef = useRef(performance.now());

  useEffect(() => {
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<{ frameTargetMs?: number }>('budget-metrics', (event) => {
        if (event.payload?.frameTargetMs) {
          setTargetMs(event.payload.frameTargetMs);
        }
      }).catch(() => {});
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let rafId: number;
    const tick = (now: number) => {
      const elapsed = now - lastFrameRef.current;
      if (elapsed >= targetMs) {
        lastFrameRef.current = now - (elapsed % targetMs);
        framesRef.current++;
      }

      if (now - lastTimeRef.current >= 1000) {
        setFps(framesRef.current);
        framesRef.current = 0;
        lastTimeRef.current = now;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [targetMs]);

  const targetFps = Math.round(1000 / targetMs);
  const color = fps >= targetFps * 0.9 ? 'var(--color-success)'
    : fps >= targetFps * 0.5 ? 'var(--color-warning)'
    : 'var(--color-error)';

  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ color }}>{fps}</span>
      <span style={{ color: 'var(--text-muted)' }}>/{targetFps} fps</span>
    </span>
  );
}

interface StatusBarProps {
  children?: ReactNode;
}

export function StatusBar({ children }: StatusBarProps) {
  return (
    <footer className="h-8 flex items-center px-4 text-xs bg-[var(--bg-default)]">
      <div className="flex items-center gap-3">
        {children}
      </div>
      <div className="ml-auto flex items-center gap-4">
        <FpsCounter />
      </div>
    </footer>
  );
}
