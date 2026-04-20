// Per A013/Composer + feedback/five-layer: pure-TS data layer. No React, no DOM, no JSX.

import { PaperClipOutlined } from '@ant-design/icons';
import type { ComposerAction } from './contracts';

// Keep the action list frozen so references stay stable across renders.
// Extend this array as new composer actions land; each entry is self-describing.
export const COMPOSER_ACTIONS: readonly ComposerAction[] = Object.freeze([
  {
    id: 'upload',
    label: 'Upload files or images',
    description: 'Attach documents, images, or audio to the conversation',
    Icon: PaperClipOutlined,
  },
] as const);

/** Accepted file types for the hidden file input triggered by the upload action. */
export const UPLOAD_ACCEPT =
  'image/*,audio/*,video/*,.pdf,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.rs';
