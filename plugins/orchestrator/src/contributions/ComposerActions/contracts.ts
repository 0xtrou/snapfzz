// Per A013/Composer + feedback/contract-driven: types shared between data / layout / index.
// Pure TypeScript — icons are component references, not elements, so data.ts stays JSX-free.

import type { ComponentType } from 'react';

export type ComposerActionId = 'upload';

export interface ComposerAction {
  readonly id: ComposerActionId;
  readonly label: string;
  readonly Icon: ComponentType;
  readonly description?: string;
  readonly disabled?: boolean;
}

/** Fired when the user picks files from the native picker. */
export type ComposerFilesSelected = (files: readonly File[]) => void;
