import { useState, useEffect, useRef, type ReactNode } from 'react';

function FpsCounter() {
  const [fps, setFps] = useState(0);
  const framesRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      framesRef.current++;
      const now = performance.now();
      if (now - lastTimeRef.current >= 1000) {
        setFps(framesRef.current);
        framesRef.current = 0;
        lastTimeRef.current = now;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const color = fps >= 55 ? 'var(--color-success)' : fps >= 30 ? 'var(--color-warning)' : 'var(--color-error)';
  return <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>{fps} fps</span>;
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
