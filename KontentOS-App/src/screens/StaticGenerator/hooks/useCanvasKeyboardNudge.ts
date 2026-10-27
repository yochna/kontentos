import { useEffect } from 'react';
import { useCanvasInteraction } from './useCanvasInteraction';
import { isTextEditingTarget } from '../utils/canvasMath';

/**
 * Arrow-key nudging for the selected element. 1px normally, 10px with Shift.
 * Completely isolated from sidebar inputs and inline text editors.
 */
export function useCanvasKeyboardNudge(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) return;
      const key = event.key;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return;

      const store = useCanvasInteraction.getState();
      if (!store.selectedElementId || store.editingElementId) return;

      const step = event.shiftKey ? 10 : 1;
      const id = store.selectedElementId;
      const scene = store.scenes[store.activeSlide] || {};
      const existing = scene[id] || { id, x: 0, y: 0, zIndex: 20 };
      const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
      const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;

      event.preventDefault();
      store.updateElementTransform(id, { x: existing.x + dx, y: existing.y + dy }, true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
