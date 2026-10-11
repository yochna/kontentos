/**
 * KontentOS — AI Smart Video Editor Tab Wrapper
 */

import { mountEditor } from '../../src/mountEditor.tsx';

export function renderSmartEditor(container) {
  if (!container) return;
  mountEditor(container);
}
