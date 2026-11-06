import React from 'react';
import { AspectRatio, CardFormat } from '../../../types/staticCard';

interface Props {
  aspectRatio: AspectRatio | string;
  format: CardFormat;
}

const chip = 'bg-app/85 text-ink px-1.5 py-0.5 rounded-btn text-[11px] font-semibold';
const measure = 'text-[11px] font-mono text-danger';
const note = 'text-[11px] text-ink-muted';
const bracket = 'absolute w-3 h-3 border-primary';
const label = 'bg-app/85 text-ink px-2 py-0.5 rounded-btn text-[11px] font-semibold border border-line';

export const SafeZoneOverlay: React.FC<Props> = ({ aspectRatio }) => {
  return (
    <div className="absolute inset-0 z-30 pointer-events-none select-none overflow-hidden export-exclude">
      {/* 4:5 Portrait: Instagram Profile Grid Crop (1:1 Safe Area) */}
      {aspectRatio === '4:5' && (
        <div className="relative w-full h-full flex flex-col justify-between">
          <div className="h-[10%] w-full bg-danger/10 border-b border-dashed border-danger/50 flex items-center justify-between px-3">
            <span className={chip}>Crop zone — hidden in the profile grid</span>
            <span className={measure}>top 10%</span>
          </div>

          <div className="flex-1 w-full relative flex items-center justify-center border-y-2 border-primary/50">
            <div className={`${bracket} top-2 left-2 border-t-2 border-l-2`} />
            <div className={`${bracket} top-2 right-2 border-t-2 border-r-2`} />
            <div className={`${bracket} bottom-2 left-2 border-b-2 border-l-2`} />
            <div className={`${bracket} bottom-2 right-2 border-b-2 border-r-2`} />

            <div className="absolute top-2 right-3">
              <span className={label}>Stays inside the 1:1 feed crop</span>
            </div>
          </div>

          <div className="h-[10%] w-full bg-danger/10 border-t border-dashed border-danger/50 flex items-center justify-between px-3">
            <span className={chip}>Crop zone — hidden in the profile grid</span>
            <span className={measure}>bottom 10%</span>
          </div>
        </div>
      )}

      {/* 9:16 Vertical Story / Mobile format */}
      {aspectRatio === '9:16' && (
        <div className="relative w-full h-full flex flex-col justify-between">
          <div className="h-[14%] w-full bg-danger/10 border-b-2 border-dashed border-danger/50 flex flex-col justify-center px-3 gap-0.5">
            <div className="flex items-center justify-between">
              <span className={chip}>Story header dead zone</span>
              <span className={measure}>top 14%</span>
            </div>
            <span className={note}>Covered by the account avatar, handle and close button.</span>
          </div>

          <div className="flex-1 w-full relative flex items-center justify-center border-y border-primary/40">
            <div className={`${bracket} top-2 left-2 border-t-2 border-l-2`} />
            <div className={`${bracket} top-2 right-2 border-t-2 border-r-2`} />
            <div className={`${bracket} bottom-2 left-2 border-b-2 border-l-2`} />
            <div className={`${bracket} bottom-2 right-2 border-b-2 border-r-2`} />

            <span className={label}>Where the story actually gets seen</span>
          </div>

          <div className="h-[20%] w-full bg-danger/10 border-t-2 border-dashed border-danger/50 flex flex-col justify-center px-3 gap-0.5">
            <div className="flex items-center justify-between">
              <span className={chip}>Story reply dead zone</span>
              <span className={measure}>bottom 20%</span>
            </div>
            <span className={note}>Covered by the reply input, heart and share buttons.</span>
          </div>
        </div>
      )}

      {/* 1:1 Square & 16:9 Landscape: Standard UI Margin Guidelines */}
      {aspectRatio !== '4:5' && aspectRatio !== '9:16' && (
        <div className="relative w-full h-full p-4 sm:p-6 flex items-center justify-center">
          <div className="w-full h-full border border-dashed border-primary/40 rounded-card relative flex items-start justify-end p-2">
            <div className={`${bracket} top-0 left-0 border-t-2 border-l-2`} />
            <div className={`${bracket} top-0 right-0 border-t-2 border-r-2`} />
            <div className={`${bracket} bottom-0 left-0 border-b-2 border-l-2`} />
            <div className={`${bracket} bottom-0 right-0 border-b-2 border-r-2`} />

            <span className={label}>Keep text inside these bounds</span>
          </div>
        </div>
      )}
    </div>
  );
};
