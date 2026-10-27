import React from 'react';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';

interface Props {
  disabled?: boolean;
}

export const SmartGuidesOverlay: React.FC<Props> = ({ disabled = false }) => {
  const guides = useCanvasInteraction((s) => s.activeGuides);
  const isDragging = useCanvasInteraction((s) => s.isDragging);
  const isResizing = useCanvasInteraction((s) => s.isResizing);

  if (disabled || (!isDragging && !isResizing) || guides.length === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-[55] overflow-hidden"
      data-canvas-ui="true"
    >
      {guides.map((guide, index) => {
        const color = guide.kind === 'center' ? '#06b6d4' : guide.kind === 'safe' ? '#ec4899' : '#a855f7';
        if (guide.orientation === 'vertical') {
          return (
            <div key={`${guide.orientation}-${index}`}>
              <div
                className="absolute top-0 bottom-0 w-px"
                style={{
                  left: `${guide.position}px`,
                  background: `repeating-linear-gradient(to bottom, ${color} 0 5px, transparent 5px 10px)`,
                  boxShadow: `0 0 8px ${color}aa`,
                }}
              />
              {guide.label && (
                <span
                  className="absolute top-2 px-1.5 py-0.5 rounded-full text-[8px] font-black tracking-widest text-slate-950"
                  style={{ left: guide.position + 6, background: color }}
                >
                  {guide.label}
                </span>
              )}
            </div>
          );
        }
        return (
          <div key={`${guide.orientation}-${index}`}>
            <div
              className="absolute left-0 right-0 h-px"
              style={{
                top: `${guide.position}px`,
                background: `repeating-linear-gradient(to right, ${color} 0 5px, transparent 5px 10px)`,
                boxShadow: `0 0 8px ${color}aa`,
              }}
            />
            {guide.label && (
              <span
                className="absolute left-2 px-1.5 py-0.5 rounded-full text-[8px] font-black tracking-widest text-slate-950"
                style={{ top: guide.position + 6, background: color }}
              >
                {guide.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default SmartGuidesOverlay;
