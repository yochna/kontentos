import { createContext, useContext } from 'react';

export const CanvasExportContext = createContext(false);

export function useCanvasExporting() {
  return useContext(CanvasExportContext);
}
