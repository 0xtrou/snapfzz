// @vitest-environment jsdom
// Spec: chat/SPEC.md — Spark Sender wrapping.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@agentscope-ai/chat', () => ({
  Sender: ({
    placeholder,
    loading,
    onSubmit,
    onCancel,
    prefix,
  }: {
    placeholder?: string;
    loading?: boolean;
    onSubmit?: (t: string) => void;
    onCancel?: () => void;
    prefix?: React.ReactNode;
  }) => (
    <div data-testid="sender" data-loading={String(Boolean(loading))} data-placeholder={placeholder}>
      {prefix && <div data-testid="sender-prefix">{prefix}</div>}
      <button type="button" onClick={() => onSubmit?.('typed')}>submit</button>
      <button type="button" onClick={onCancel}>cancel</button>
    </div>
  ),
}));

import { ChatComposer } from './ChatComposer';

describe('chat/ChatPanel/parts/ChatComposer', () => {
  it('forwards loading flag to Spark Sender', () => {
    render(<ChatComposer loading={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('sender').getAttribute('data-loading')).toBe('true');
  });

  it('uses the contract placeholder text', () => {
    render(<ChatComposer loading={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId('sender').getAttribute('data-placeholder')).toBe(
      'Ask the orchestrator anything...',
    );
  });

  it('forwards onSubmit and onCancel callbacks', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<ChatComposer loading={false} onSubmit={onSubmit} onCancel={onCancel} />);

    fireEvent.click(screen.getByText('submit'));
    fireEvent.click(screen.getByText('cancel'));

    expect(onSubmit).toHaveBeenCalledWith('typed');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('A013/ModelPicker: forwards prefix node to Spark Sender prefix slot', () => {
    const prefix = <span data-testid="test-prefix">chip</span>;
    render(<ChatComposer loading={false} onSubmit={vi.fn()} onCancel={vi.fn()} prefix={prefix} />);
    expect(screen.getByTestId('sender-prefix')).toBeTruthy();
    expect(screen.getByTestId('test-prefix')).toBeTruthy();
  });

  it('A013/ModelPicker: renders without prefix when prefix is undefined', () => {
    render(<ChatComposer loading={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByTestId('sender-prefix')).toBeNull();
  });
});
