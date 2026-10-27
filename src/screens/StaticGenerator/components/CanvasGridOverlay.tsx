import React from 'react';

interface Props {
  isLight?: boolean;
}

export const CanvasGridOverlay: React.FC<Props> = ({ isLight = false }) => {
  const lineClass = isLight ? 'border-black/15' : 'border-white/15';
  const centerLineClass = isLight ? 'border-primary/25' : 'border-primary/30';

  return (
    <div className="absolute inset-0 z-30 pointer-events-none select-none overflow-hidden export-exclude">
      {/* Rule of Thirds - Vertical Line 1 (33.33%) */}
      <div
        className={`absolute top-0 bottom-0 border-r border-dashed ${lineClass}`}
        style={{ left: '33.333%' }}
      />

      {/* Rule of Thirds - Vertical Line 2 (66.66%) */}
      <div
        className={`absolute top-0 bottom-0 border-r border-dashed ${lineClass}`}
        style={{ left: '66.666%' }}
      />

      {/* Rule of Thirds - Horizontal Line 1 (33.33%) */}
      <div
        className={`absolute left-0 right-0 border-b border-dashed ${lineClass}`}
        style={{ top: '33.333%' }}
      />

      {/* Rule of Thirds - Horizontal Line 2 (66.66%) */}
      <div
        className={`absolute left-0 right-0 border-b border-dashed ${lineClass}`}
        style={{ top: '66.666%' }}
      />

      {/* Center Optical Crosshair Lines (50% Center Alignment) */}
      <div
        className={`absolute top-0 bottom-0 border-r border-dotted ${centerLineClass}`}
        style={{ left: '50%' }}
      />
      <div
        className={`absolute left-0 right-0 border-b border-dotted ${centerLineClass}`}
        style={{ top: '50%' }}
      />

      {/* Center Reticle Point */}
      <div
        className="absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/50 flex items-center justify-center"
        style={{ left: '50%', top: '50%' }}
      >
        <div className="w-1 h-1 rounded-full bg-primary" />
      </div>

      {/* Grid Legend Badge */}
      <div className="absolute bottom-2.5 left-2.5 z-10">
        <span className="text-[9px] font-mono font-bold tracking-wider uppercase text-primary bg-black/75 px-2 py-0.5 rounded-full border border-primary/30 shadow-sm">
          3×3 Rule of Thirds (G)
        </span>
      </div>
    </div>
  );
};
