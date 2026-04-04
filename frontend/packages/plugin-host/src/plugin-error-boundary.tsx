// Per A005/Isolation: plugin UI contributions wrapped in ErrorBoundary — crash shows fallback, does not crash the shell.
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface PluginErrorBoundaryProps {
  children?: ReactNode;
  FallbackComponent?: (props: { error: Error; onRetry: () => void }) => ReactNode;
  pluginId?: string;
  onCrash?: (pluginId: string, error: Error) => void;
}

interface PluginErrorBoundaryState {
  error: Error | null;
}

export class PluginErrorBoundary extends Component<PluginErrorBoundaryProps, PluginErrorBoundaryState> {
  constructor(props: PluginErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): PluginErrorBoundaryState {
    return { error };
  }

  // Per A005/Isolation: crash notification feeds into host crash supervision (3-strike auto-disable).
  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    const { pluginId, onCrash } = this.props;
    if (pluginId && onCrash) {
      onCrash(pluginId, error);
    }
    console.error('[PluginErrorBoundary] Plugin render error', error);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children, FallbackComponent } = this.props;

    if (error) {
      if (FallbackComponent) {
        return FallbackComponent({ error, onRetry: this.handleRetry });
      }
      // Per A005/Isolation: default fallback includes retry so users can attempt recovery.
      return (
        <div style={{ padding: 16, color: 'var(--text-muted)' }}>
          <p>Plugin failed to render.</p>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{ marginTop: 8, cursor: 'pointer', textDecoration: 'underline', color: 'var(--color-accent)' }}
          >
            Retry
          </button>
        </div>
      );
    }

    return children;
  }
}
