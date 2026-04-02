import { ConfigProvider } from 'antd';
import { useTheme, darkTheme, lightTheme } from '@snapfzz/shared';
import { useState, useEffect } from 'react';

export function App() {
  const { theme } = useTheme();
  const antdTheme = theme === 'dark' ? darkTheme : lightTheme;
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return <Splash />;
  }

  return (
    <ConfigProvider theme={antdTheme}>
      <div className="flex flex-col min-h-screen" style={{ background: 'var(--bg-primary)' }}>
        <header className="h-12 flex items-center px-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
          <img src="/logo.svg" alt="Snapfzz" className="w-6 h-6 mr-2" />
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Snapfzz</span>
        </header>

        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Core shell ready. Plugins will load here.</p>
          </div>
        </main>

        <footer className="h-8 flex items-center px-4 text-xs border-t" style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}>
          <span>● Ready</span>
        </footer>
      </div>
    </ConfigProvider>
  );
}

function Splash() {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#09090b',
    }}>
      <img src="/logo.svg" alt="Snapfzz" style={{ width: 128, height: 128 }} />
      <p style={{
        marginTop: 32,
        color: '#a1a1aa',
        fontSize: 14,
        fontFamily: "'Inter', sans-serif",
        fontWeight: 500,
      }}>
        Snapfzz
      </p>
      <p style={{
        marginTop: 6,
        color: '#52525b',
        fontSize: 12,
        fontFamily: "'Inter', sans-serif",
      }}>
        Your startup bootstrapping intelligence
      </p>
    </div>
  );
}
