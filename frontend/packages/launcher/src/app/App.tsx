import { ConfigProvider } from 'antd';
import { useTheme, darkTheme, lightTheme } from '@snapfzz/shared';

export function App() {
  const { theme } = useTheme();
  const antdTheme = theme === 'dark' ? darkTheme : lightTheme;

  return (
    <ConfigProvider theme={antdTheme}>
      <div className="flex flex-col min-h-screen">
        <header className="h-12 flex items-center px-4 border-b border-[var(--border-default)]">
          <img src="/logo.svg" alt="Snapfzz" className="w-6 h-6 mr-2" />
          <span className="text-sm font-semibold">Snapfzz</span>
        </header>

        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Snapfzz Startup Launcher</h1>
            <p className="text-[var(--text-secondary)]">Core shell ready. Plugins will load here.</p>
          </div>
        </main>

        <footer className="h-8 flex items-center px-4 text-xs text-[var(--text-muted)] border-t border-[var(--border-default)]">
          <span>● Ready</span>
        </footer>
      </div>
    </ConfigProvider>
  );
}
