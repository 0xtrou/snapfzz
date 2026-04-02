// Per A005/Isolation: plugin UI contributions wrapped in ErrorBoundary — crash shows fallback, does not crash the shell.
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface PluginErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent?: (props: { error: Error }) => ReactNode;
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

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    console.error('[PluginErrorBoundary] Plugin render error', error);
  }

  render() {
    const { error } = this.state;
    const { children, FallbackComponent } = this.props;

    if (error) {
      if (FallbackComponent) {
        return FallbackComponent({ error });
      }
      return <div>Plugin failed to render.</div>;
    }

    return children;
  }
}
