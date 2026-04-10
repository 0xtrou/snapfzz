import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AnsiLogViewer, { ansiToHtml } from '../AnsiLogViewer';

describe('AnsiLogViewer', () => {
  it('renders empty state when no logs', () => {
    render(<AnsiLogViewer logs={[]} />);
    expect(screen.getByText('No logs')).toBeInTheDocument();
  });

  it('renders plain text logs', () => {
    render(<AnsiLogViewer logs={['Line 1', 'Line 2']} />);
    expect(screen.getByText('Line 1')).toBeInTheDocument();
    expect(screen.getByText('Line 2')).toBeInTheDocument();
  });

  it('respects maxLines prop', () => {
    const logs = Array.from({ length: 150 }, (_, i) => `Line ${i + 1}`);
    render(<AnsiLogViewer logs={logs} maxLines={100} />);
    expect(screen.queryByText('Line 1')).not.toBeInTheDocument();
    expect(screen.getByText('Line 51')).toBeInTheDocument();
    expect(screen.getByText('Line 150')).toBeInTheDocument();
  });

  it('applies data-testid', () => {
    render(<AnsiLogViewer logs={['test']} data-testid="custom-logs" />);
    expect(screen.getByTestId('custom-logs')).toBeInTheDocument();
  });

  it('escapes HTML in logs', () => {
    render(<AnsiLogViewer logs={['<script>alert("xss")</script>']} />);
    expect(screen.queryByText('alert("xss")')).not.toBeInTheDocument();
    expect(screen.getByText('<script>alert("xss")</script>')).toBeInTheDocument();
  });
});

describe('ansiToHtml', () => {
  it('converts plain text unchanged', () => {
    expect(ansiToHtml('plain text')).toBe('plain text');
  });

  it('escapes HTML entities', () => {
    expect(ansiToHtml('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;/b&gt;');
    expect(ansiToHtml('a & b')).toBe('a &amp; b');
  });

  it('converts ANSI red color to span with style', () => {
    const result = ansiToHtml('\x1b[31mError\x1b[0m');
    expect(result).toContain('color:');
    expect(result).toContain('Error');
  });

  it('converts ANSI green color to span with style', () => {
    const result = ansiToHtml('\x1b[32mSuccess\x1b[0m');
    expect(result).toContain('color:');
    expect(result).toContain('Success');
  });

  it('converts ANSI yellow color to span with style', () => {
    const result = ansiToHtml('\x1b[33mWarning\x1b[0m');
    expect(result).toContain('color:');
    expect(result).toContain('Warning');
  });

  it('converts ANSI bold to span with font-weight', () => {
    const result = ansiToHtml('\x1b[1mBold text\x1b[0m');
    expect(result).toContain('font-weight');
    expect(result).toContain('Bold text');
  });

  it('handles multiple colors in one line', () => {
    const result = ansiToHtml('\x1b[31mError:\x1b[0m \x1b[32mFixed\x1b[0m');
    expect(result).toContain('Error:');
    expect(result).toContain('Fixed');
  });

  it('handles bright colors', () => {
    const result = ansiToHtml('\x1b[91mBright red\x1b[0m');
    expect(result).toContain('color:');
    expect(result).toContain('Bright red');
  });
});