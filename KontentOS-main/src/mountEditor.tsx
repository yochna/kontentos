/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import App from './App';
import './index.css';

const rootsMap = new WeakMap<HTMLElement, Root>();

export function mountEditor(container: HTMLElement): void {
  if (!container) return;

  let root = rootsMap.get(container);
  if (!root) {
    root = createRoot(container);
    rootsMap.set(container, root);
  }

  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

export function unmountEditor(container: HTMLElement): void {
  const root = rootsMap.get(container);
  if (root) {
    root.unmount();
    rootsMap.delete(container);
  }
}
