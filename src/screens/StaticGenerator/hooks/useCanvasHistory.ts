import { useCanvasInteraction } from './useCanvasInteraction';

export function useCanvasHistory() {
  const canUndo = useCanvasInteraction((state) => state.past.length > 0);
  const canRedo = useCanvasInteraction((state) => state.future.length > 0);
  const undo = useCanvasInteraction((state) => state.undo);
  const redo = useCanvasInteraction((state) => state.redo);
  return { canUndo, canRedo, undo, redo };
}
