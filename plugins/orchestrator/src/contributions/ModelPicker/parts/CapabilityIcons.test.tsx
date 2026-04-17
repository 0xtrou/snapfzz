// @vitest-environment jsdom
// Per A013/ModelPicker: CapabilityIcons leaf component tests.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@ant-design/icons', () => ({
  EyeOutlined: ({ 'aria-label': ariaLabel }: { 'aria-label'?: string }) => (
    <span data-testid="icon-eye" aria-label={ariaLabel} />
  ),
  ToolOutlined: ({ 'aria-label': ariaLabel }: { 'aria-label'?: string }) => (
    <span data-testid="icon-tool" aria-label={ariaLabel} />
  ),
  BulbOutlined: ({ 'aria-label': ariaLabel }: { 'aria-label'?: string }) => (
    <span data-testid="icon-bulb" aria-label={ariaLabel} />
  ),
}));

import { CapabilityIcons } from './CapabilityIcons';

describe('A013/ModelPicker/CapabilityIcons', () => {
  it('A013/CapabilityIcons: renders no icons when all false', () => {
    render(<CapabilityIcons capabilities={{ vision: false, tools: false, reasoning: false }} />);
    expect(screen.queryByTestId('icon-eye')).toBeNull();
    expect(screen.queryByTestId('icon-tool')).toBeNull();
    expect(screen.queryByTestId('icon-bulb')).toBeNull();
  });

  it('A013/CapabilityIcons: renders EyeOutlined when vision=true', () => {
    render(<CapabilityIcons capabilities={{ vision: true, tools: false, reasoning: false }} />);
    expect(screen.getByTestId('icon-eye')).toBeTruthy();
    expect(screen.queryByTestId('icon-tool')).toBeNull();
  });

  it('A013/CapabilityIcons: renders ToolOutlined when tools=true', () => {
    render(<CapabilityIcons capabilities={{ vision: false, tools: true, reasoning: false }} />);
    expect(screen.getByTestId('icon-tool')).toBeTruthy();
  });

  it('A013/CapabilityIcons: renders BulbOutlined when reasoning=true', () => {
    render(<CapabilityIcons capabilities={{ vision: false, tools: false, reasoning: true }} />);
    expect(screen.getByTestId('icon-bulb')).toBeTruthy();
  });

  it('A013/CapabilityIcons: renders all three icons when all=true', () => {
    render(<CapabilityIcons capabilities={{ vision: true, tools: true, reasoning: true }} />);
    expect(screen.getByTestId('icon-eye')).toBeTruthy();
    expect(screen.getByTestId('icon-tool')).toBeTruthy();
    expect(screen.getByTestId('icon-bulb')).toBeTruthy();
  });

  it('A013/CapabilityIcons: icons have accessible aria-labels', () => {
    render(<CapabilityIcons capabilities={{ vision: true, tools: true, reasoning: true }} />);
    expect(screen.getByLabelText('vision')).toBeTruthy();
    expect(screen.getByLabelText('tools')).toBeTruthy();
    expect(screen.getByLabelText('reasoning')).toBeTruthy();
  });
});
