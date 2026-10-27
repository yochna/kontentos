import { useEffect } from 'react';
import { useCanvasInteraction } from './useCanvasInteraction';
import { useCanvasKeyboardNudge } from './useCanvasKeyboardNudge';
import { isTextEditingTarget } from '../utils/canvasMath';

interface Options {
  onToggleGrid?: () => void;
  enabled?: boolean;
}

/**
 * Global design-tool shortcuts for the canvas. All handlers are guarded
 * against form fields and contentEditable inline editors.
 */
export function useCanvasShortcuts(options: Options = {}) {
  const enabled = options.enabled ?? true;
  useCanvasKeyboardNudge(enabled);

  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) return;
      const store = useCanvasInteraction.getState();
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key;

      if (mod && key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        store.undo();
        return;
      }
      if ((mod && key.toLowerCase() === 'y') || (mod && event.shiftKey && key.toLowerCase() === 'z')) {
        event.preventDefault();
        store.redo();
        return;
      }
      if (mod && event.shiftKey && key.toLowerCase() === 'c') {
        event.preventDefault();
        store.copyAllElements();
        return;
      }
      if (mod && key.toLowerCase() === 'c') {
        event.preventDefault();
        store.copySelectedElement();
        return;
      }
      if (mod && key.toLowerCase() === 'v') {
        event.preventDefault();
        store.pasteClipboard();
        return;
      }
      if (mod && key.toLowerCase() === 'd') {
        event.preventDefault();
        if (store.selectedElementId) store.duplicateElement();
        return;
      }
      if (mod && key === ']') {
        event.preventDefault();
        if (!store.selectedElementId) return;
        if (event.shiftKey) store.bringToFront(store.selectedElementId);
        else store.bringForward(store.selectedElementId);
        return;
      }
      if (mod && key === '[') {
        event.preventDefault();
        if (!store.selectedElementId) return;
        if (event.shiftKey) store.sendToBack(store.selectedElementId);
        else store.sendBackward(store.selectedElementId);
        return;
      }
      if (event.altKey && key.toLowerCase() === 'h') {
        event.preventDefault();
        store.centerSelected('x');
        return;
      }
      if (event.altKey && key.toLowerCase() === 'v') {
        event.preventDefault();
        store.centerSelected('y');
        return;
      }
      if (event.altKey && key.toLowerCase() === 'c') {
        event.preventDefault();
        store.centerSelected('both');
        return;
      }
      if (key === 'Delete' || key === 'Backspace') {
        if (store.selectedElementId) {
          event.preventDefault();
          store.deleteElement(store.selectedElementId);
        }
        return;
      }
      if (key === 'Escape') {
        store.clearSelection();
        return;
      }
      if (key.toLowerCase() === 't') {
        event.preventDefault();
        store.addTextBox();
        return;
      }
      if (key.toLowerCase() === 's') {
        event.preventDefault();
        store.toggleSnap();
        const enabled = useCanvasInteraction.getState().snapEnabled;
        store.setToast(enabled ? 'Magnetic snapping on' : 'Magnetic snapping off');
        return;
      }
      if (key.toLowerCase() === 'g' && options.onToggleGrid) {
        event.preventDefault();
        options.onToggleGrid();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [options.onToggleGrid, enabled]);
}
