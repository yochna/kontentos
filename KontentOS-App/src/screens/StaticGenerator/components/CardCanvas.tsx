import React from 'react';
import { StaticCardState } from '../../../types/staticCard';
import { getActiveTheme } from '../../../data/staticCardPresets';
import { InstagramOverlayCard } from './formats/InstagramOverlayCard';
import { LinkedInSplitCard } from './formats/LinkedInSplitCard';
import { TweetCardLayout } from './formats/TweetCardLayout';
import { CarouselSlideCard } from './formats/CarouselSlideCard';
import { EditorialQuoteCard } from './formats/EditorialQuoteCard';
import { SafeZoneOverlay } from './SafeZoneOverlay';
import { CanvasGridOverlay } from './CanvasGridOverlay';

interface CardCanvasProps {
  state: StaticCardState;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  showSafeZones?: boolean;
  showGrid?: boolean;
  isExporting?: boolean;
}

export const CardCanvas: React.FC<CardCanvasProps> = ({
  state,
  canvasRef,
  showSafeZones = false,
  showGrid = false,
  isExporting = false,
}) => {
  const theme = getActiveTheme(state);

  const renderCardContent = () => {
    switch (state.format) {
      case 'instagram-overlay':
        return <InstagramOverlayCard state={state} />;
      case 'linkedin-split':
        return <LinkedInSplitCard state={state} />;
      case 'tweet-card':
        return <TweetCardLayout state={state} />;
      case 'carousel-slide':
        return <CarouselSlideCard state={state} />;
      case 'editorial-quote':
        return <EditorialQuoteCard state={state} />;
      default:
        return <InstagramOverlayCard state={state} />;
    }
  };

  const getAspectRatioClasses = () => {
    switch (state.aspectRatio) {
      case '1:1':
        return 'aspect-square max-w-[520px]';
      case '4:5':
        return 'aspect-[4/5] max-w-[460px]';
      case '9:16':
        return 'aspect-[9/16] max-w-[380px]';
      case '16:9':
        return 'aspect-[16/9] max-w-[640px]';
      default:
        return 'aspect-square max-w-[520px]';
    }
  };

  return (
    <div className="relative w-full flex items-center justify-center p-2 sm:p-4">
      {/* Ambient Theme Studio Backlight */}
      <div
        className="absolute w-72 h-72 rounded-full blur-3xl opacity-20 pointer-events-none transition-all duration-500"
        style={{
          background: theme.accent,
        }}
      />

      {/* Dynamic Aspect Ratio Card Frame */}
      <div
        ref={canvasRef}
        id="kontentos-static-card-canvas"
        className={`w-full ${getAspectRatioClasses()} transition-all duration-300 rounded-3xl overflow-hidden shadow-[0_30px_70px_-15px_rgba(0,0,0,0.85)] border border-white/10 bg-slate-950 relative flex items-center justify-center`}
      >
        {renderCardContent()}

        {/* Platform Safe-Zone Guide Overlay (Excluded during high-res exports) */}
        {showSafeZones && !isExporting && (
          <SafeZoneOverlay aspectRatio={state.aspectRatio} format={state.format} />
        )}

        {/* 3x3 Rule-of-Thirds Grid Overlay (Excluded during high-res exports) */}
        {showGrid && !isExporting && (
          <CanvasGridOverlay isLight={theme.mode === 'light'} />
        )}
      </div>
    </div>
  );
};
