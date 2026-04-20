// @vitest-environment jsdom
// Spec: A013/Composer — integration: upload action drives the hidden file input; selected
// files surface via onFilesSelected prop AND ctx.bus.emit when runtime is present.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── Runtime mock ─────────────────────────────────────────────────────────────
const mockBusEmit = vi.fn();
const usePluginRuntimeOptionalMock = vi.fn(() => ({
  ctx: { bus: { emit: mockBusEmit, on: vi.fn() } },
} as unknown as ReturnType<typeof import('../runtime').usePluginRuntimeOptional>));

vi.mock('../runtime', () => ({
  get usePluginRuntimeOptional() { return usePluginRuntimeOptionalMock; },
}));

// Layout stub — surfaces onSelect so we can trigger the upload path without Popover internals.
vi.mock('./layout', () => ({
  ComposerActionsLayout: ({
    onSelect,
    onToggleOpen,
  }: {
    onSelect: (id: 'upload') => void;
    onToggleOpen: (open: boolean) => void;
  }) => (
    <div>
      <button data-testid="trigger-upload" onClick={() => onSelect('upload')}>upload</button>
      <button data-testid="trigger-open" onClick={() => onToggleOpen(true)}>open</button>
    </div>
  ),
}));

import { ComposerActions } from './index';

function makeFileList(files: File[]): FileList {
  // jsdom lacks a DataTransfer constructor under test; fake a minimal FileList.
  const list = {
    ...files,
    length: files.length,
    item: (i: number) => files[i] ?? null,
    [Symbol.iterator]: function* () { for (const f of files) yield f; },
  };
  return list as unknown as FileList;
}

describe('A013/Composer/index: upload integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A013/index: Upload action calls the hidden file input click()', () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<ComposerActions />);
    fireEvent.click(screen.getByTestId('trigger-upload'));
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('A013/index: file input change invokes onFilesSelected prop', () => {
    const onFilesSelected = vi.fn();
    render(<ComposerActions onFilesSelected={onFilesSelected} />);

    const input = screen.getByTestId('composer-file-input') as HTMLInputElement;
    const files = [new File(['a'], 'a.png', { type: 'image/png' })];
    // Stub the readonly `files` property on the event target.
    Object.defineProperty(input, 'files', { value: makeFileList(files), configurable: true });
    fireEvent.change(input);

    expect(onFilesSelected).toHaveBeenCalledTimes(1);
    expect(onFilesSelected.mock.calls[0][0][0]).toBe(files[0]);
  });

  it('A013/index: file input change emits composer.files-selected on the plugin bus', () => {
    render(<ComposerActions />);

    const input = screen.getByTestId('composer-file-input') as HTMLInputElement;
    const files = [new File(['b'], 'b.txt', { type: 'text/plain' })];
    Object.defineProperty(input, 'files', { value: makeFileList(files), configurable: true });
    fireEvent.change(input);

    expect(mockBusEmit).toHaveBeenCalledWith('composer.files-selected', expect.any(Array));
  });

  it('A013/index: empty file selection does not emit', () => {
    const onFilesSelected = vi.fn();
    render(<ComposerActions onFilesSelected={onFilesSelected} />);

    const input = screen.getByTestId('composer-file-input') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: makeFileList([]), configurable: true });
    fireEvent.change(input);

    expect(onFilesSelected).not.toHaveBeenCalled();
    expect(mockBusEmit).not.toHaveBeenCalled();
  });
});
