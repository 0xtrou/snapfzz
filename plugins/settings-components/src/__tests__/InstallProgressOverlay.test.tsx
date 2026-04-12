import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InstallProgressOverlay from '../InstallProgressOverlay';

describe('A007/settings-components: InstallProgressOverlay', () => {
  it('renders the overlay container with data-testid', () => {
    render(<InstallProgressOverlay steps={[]} />);
    expect(screen.getByTestId('install-progress-overlay')).toBeInTheDocument();
  });

  it('renders the header label', () => {
    render(<InstallProgressOverlay steps={[]} />);
    expect(screen.getByText('Installing Python Packs')).toBeInTheDocument();
  });

  it('renders step labels', () => {
    render(
      <InstallProgressOverlay
        steps={[
          { id: 'uv', label: 'Install uv', status: 'pending' },
          { id: 'python', label: 'Install Python', status: 'running' },
          { id: 'agentscope', label: 'Install AgentScope', status: 'done' },
        ]}
      />,
    );
    expect(screen.getByText('Install uv')).toBeInTheDocument();
    expect(screen.getByText('Install Python')).toBeInTheDocument();
    expect(screen.getByText('Install AgentScope')).toBeInTheDocument();
  });

  it('renders done step icon (✅) for done status', () => {
    render(
      <InstallProgressOverlay
        steps={[{ id: 'uv', label: 'Install uv', status: 'done' }]}
      />,
    );
    expect(screen.getByText('✅')).toBeInTheDocument();
  });

  it('renders pending step icon (○) for pending status', () => {
    render(
      <InstallProgressOverlay
        steps={[{ id: 'uv', label: 'Install uv', status: 'pending' }]}
      />,
    );
    expect(screen.getByText('○')).toBeInTheDocument();
  });

  it('renders LoadingOutlined icon for running status', () => {
    const { container } = render(
      <InstallProgressOverlay
        steps={[{ id: 'uv', label: 'Install uv', status: 'running' }]}
      />,
    );
    // LoadingOutlined renders as an SVG with role="img" or antd-specific class
    // We verify no ✅ or ○ is shown and the step label is present
    expect(screen.queryByText('✅')).not.toBeInTheDocument();
    expect(screen.queryByText('○')).not.toBeInTheDocument();
    expect(screen.getByText('Install uv')).toBeInTheDocument();
    // antd LoadingOutlined renders an svg spinner
    expect(container.querySelector('.anticon-loading')).toBeInTheDocument();
  });

  it('renders multiple steps all with correct icons', () => {
    render(
      <InstallProgressOverlay
        steps={[
          { id: 's1', label: 'Step Done', status: 'done' },
          { id: 's2', label: 'Step Running', status: 'running' },
          { id: 's3', label: 'Step Pending', status: 'pending' },
        ]}
      />,
    );
    expect(screen.getByText('✅')).toBeInTheDocument();
    expect(screen.getByText('○')).toBeInTheDocument();
  });

  it('renders empty steps list without crashing', () => {
    const { getByTestId } = render(<InstallProgressOverlay steps={[]} />);
    expect(getByTestId('install-progress-overlay')).toBeInTheDocument();
  });
});
