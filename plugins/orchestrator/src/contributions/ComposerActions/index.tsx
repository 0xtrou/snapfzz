// Per A005/PluginArchitecture + feedback/five-layer: thin composition.
// Local UI state (isOpen) + the hidden file input live here; layout is purely presentational.

import { useCallback, useRef, useState } from 'react';
import { usePluginRuntimeOptional } from '../runtime';
import { COMPOSER_ACTIONS, UPLOAD_ACCEPT } from './data';
import { ComposerActionsLayout } from './layout';
import type { ComposerActionId, ComposerFilesSelected } from './contracts';

interface ComposerActionsProps {
  /**
   * Optional callback invoked with selected files after the user picks them through
   * "Upload files or images". When unset, the component still emits a
   * `composer.files-selected` bus event via the plugin runtime (when available) so the
   * chat pipeline can subscribe without prop drilling.
   */
  readonly onFilesSelected?: ComposerFilesSelected;
}

export function ComposerActions({ onFilesSelected }: ComposerActionsProps = {}) {
  const runtime = usePluginRuntimeOptional();
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onToggleOpen = useCallback((next: boolean) => setIsOpen(next), []);

  const emitFiles = useCallback(
    (files: readonly File[]) => {
      if (files.length === 0) return;
      onFilesSelected?.(files);
      runtime?.ctx.bus.emit('composer.files-selected', files);
    },
    [onFilesSelected, runtime],
  );

  const onSelect = useCallback(
    (id: ComposerActionId) => {
      setIsOpen(false);
      if (id === 'upload') {
        fileInputRef.current?.click();
      }
    },
    [],
  );

  const onFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files ? Array.from(event.target.files) : [];
      emitFiles(files);
      // Reset so the same file can be picked again consecutively.
      event.target.value = '';
    },
    [emitFiles],
  );

  return (
    <>
      <ComposerActionsLayout
        isOpen={isOpen}
        onToggleOpen={onToggleOpen}
        onSelect={onSelect}
      />
      {/* Hidden native file picker — driven by the Upload action above. */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        onChange={onFileInputChange}
        style={{ display: 'none' }}
        data-testid="composer-file-input"
        aria-hidden="true"
      />
    </>
  );
}

// Re-export actions so consumers can enumerate them (e.g. for tests or docs).
export { COMPOSER_ACTIONS };

export default ComposerActions;
