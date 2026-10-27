import React from 'react';
import { AspectRatio, CardFormat } from '../../../types/staticCard';

interface Props {
  aspectRatio: AspectRatio | string;
  format: CardFormat;
}

export const SafeZoneOverlay: React.FC<Props> = ({ aspectRatio }) => {
  return (
    <div className="absolute inset-0 z-30 pointer-events-none select-none overflow-hidden export-exclude">
      {/* 4:5 Portrait: Instagram Profile Grid Crop (1:1 Safe Area) */}
      {aspectRatio === '4:5' && (
        <div className="relative w-full h-full flex flex-col justify-between">
          {/* Top Profile Crop Hazard Zone (Top 10%) */}
          <div className="h-[10%] w-full bg-red-500/10 border-b border-dashed border-red-400/50 flex items-center justify-between px-3">
            <span className="text-[10px] font-mono font-bold tracking-wider text-red-300/90 uppercase bg-black/60 px-1.5 py-0.5 rounded">
              Crop Zone (Hidden in 1:1 Grid)
            </span>
            <span className="text-[10px] font-mono text-red-300/80">▲ Top 10%</span>
          </div>

          {/* Center 1:1 In-Feed Safe Area */}
          <div className="flex-1 w-full relative flex items-center justify-center border-y-2 border-primary/50">
            {/* Corner Brackets */}
            <div className="absolute top-2 left-2 w-3.5 h-3.5 border-t-2 border-l-2 border-primary" />
            <div className="absolute top-2 right-2 w-3.5 h-3.5 border-t-2 border-r-2 border-primary" />
            <div className="absolute bottom-2 left-2 w-3.5 h-3.5 border-b-2 border-l-2 border-primary" />
            <div className="absolute bottom-2 right-2 w-3.5 h-3.5 border-b-2 border-r-2 border-primary" />

            <div className="absolute top-2 right-3">
              <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-primary bg-black/70 px-2 py-0.5 rounded-full border border-primary/40 shadow-sm">
                ✓ IG Feed 1:1 Safe Zone
              </span>
            </div>
          </div>

          {/* Bottom Profile Crop Hazard Zone (Bottom 10%) */}
          <div className="h-[10%] w-full bg-red-500/10 border-t border-dashed border-red-400/50 flex items-center justify-between px-3">
            <span className="text-[10px] font-mono font-bold tracking-wider text-red-300/90 uppercase bg-black/60 px-1.5 py-0.5 rounded">
              Crop Zone (Hidden in 1:1 Grid)
            </span>
            <span className="text-[10px] font-mono text-red-300/80">▼ Bottom 10%</span>
          </div>
        </div>
      )}

      {/* 9:16 Vertical Story / Mobile format */}
      {aspectRatio === '9:16' && (
        <div className="relative w-full h-full flex flex-col justify-between">
          {/* Instagram Story Top Header Dead Zone (Top 14%) */}
          <div className="h-[14%] w-full bg-red-500/15 border-b-2 border-dashed border-red-400/60 flex flex-col justify-center px-3 gap-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold tracking-wider text-red-300 uppercase bg-black/60 px-1.5 py-0.5 rounded">
                Story Header Dead Zone
              </span>
              <span className="text-[9px] font-mono text-red-300/80">Top 14%</span>
            </div>
            <span className="text-[9px] text-red-200/70 font-sans">
              Covered by account avatar, handle, & close button
            </span>
          </div>

          {/* Center Story Safe Viewport */}
          <div className="flex-1 w-full relative flex items-center justify-center border-y border-primary/40">
            <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-primary" />
            <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-primary" />
            <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-primary" />
            <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-primary" />

            <span className="text-[10px] font-mono font-bold text-primary bg-black/70 px-2 py-0.5 rounded-full border border-primary/40">
              Primary Story Content Safe Zone
            </span>
          </div>

          {/* Instagram Story Bottom Interactive Dead Zone (Bottom 20%) */}
          <div className="h-[20%] w-full bg-red-500/15 border-t-2 border-dashed border-red-400/60 flex flex-col justify-center px-3 gap-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold tracking-wider text-red-300 uppercase bg-black/60 px-1.5 py-0.5 rounded">
                Story Reply & Interactive Dead Zone
              </span>
              <span className="text-[9px] font-mono text-red-300/80">Bottom 20%</span>
            </div>
            <span className="text-[9px] text-red-200/70 font-sans">
              Covered by DM reply input, heart, & share buttons
            </span>
          </div>
        </div>
      )}

      {/* 1:1 Square & 16:9 Landscape: Standard UI Margin Guidelines */}
      {aspectRatio !== '4:5' && aspectRatio !== '9:16' && (
        <div className="relative w-full h-full p-4 sm:p-6 flex items-center justify-center">
          <div className="w-full h-full border border-dashed border-primary/40 rounded-xl relative flex items-start justify-end p-2">
            {/* Corner Brackets */}
            <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-primary" />
            <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-primary" />
            <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-primary" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-primary" />

            <span className="text-[9px] font-mono font-bold tracking-wider uppercase text-primary bg-black/75 px-2 py-0.5 rounded-full border border-primary/30">
              Optimal Content Bounds
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
