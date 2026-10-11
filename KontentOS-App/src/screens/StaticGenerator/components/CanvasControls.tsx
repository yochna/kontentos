import React from 'react';
import { Button } from '@/components/ui';

interface Props {
  isExporting: boolean;
  isCarouselFormat?: boolean;
  slideCount?: number;
  showSafeZones?: boolean;
  onToggleSafeZones?: () => void;
  showGrid?: boolean;
  onToggleGrid?: () => void;
  onExportPNG: () => void;
  onExportEntireDeck?: () => void;
  onExportLinkedInPDF?: () => void;
  onRandomizePhoto: () => void;
  onCopyImageAndText: () => void;
  copiedStatus: string | null;
  onOpenPublishPack?: () => void;
  onOpenPublishToCalendar?: () => void;
}

export const CanvasControls: React.FC<Props> = ({
  isExporting,
  isCarouselFormat = false,
  slideCount = 5,
  showSafeZones = false,
  onToggleSafeZones,
  showGrid = false,
  onToggleGrid,
  onExportPNG,
  onExportEntireDeck,
  onExportLinkedInPDF,
  onRandomizePhoto,
  onCopyImageAndText,
  copiedStatus,
  onOpenPublishPack,
  onOpenPublishToCalendar,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
      {/* Export High-Res PNG Button */}
      <Button
        variant="primary"
        size="md"
        icon={isExporting ? undefined : 'download'}
        disabled={isExporting}
        onClick={onExportPNG}
        className="shadow-[var(--shadow-2)]"
      >
        {isExporting ? (
          <>
            <svg className="animate-spin h-4 w-4 text-on-primary" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Rendering 300 DPI...</span>
          </>
        ) : (
          <span>{isCarouselFormat ? 'Export Slide PNG (300 DPI)' : 'Export High-Res PNG (300 DPI)'}</span>
        )}
      </Button>

      {/* Export LinkedIn PDF Carousel Button (Multi-page PDF for native LinkedIn uploads) */}
      {isCarouselFormat && onExportLinkedInPDF && (
        <Button
          variant="secondary"
          size="md"
          icon={isExporting ? undefined : 'picture_as_pdf'}
          disabled={isExporting}
          onClick={onExportLinkedInPDF}
          className="shadow-[var(--shadow-1)] border border-primary/40 text-primary font-semibold hover:bg-primary-soft"
          title="Export as a multi-page PDF document ready for direct upload to LinkedIn Carousels"
        >
          <span>LinkedIn PDF Carousel</span>
        </Button>
      )}

      {/* Export Entire Carousel Deck Button (when format is carousel) */}
      {isCarouselFormat && onExportEntireDeck && (
        <Button
          variant="soft"
          size="md"
          icon={isExporting ? undefined : 'layers'}
          disabled={isExporting}
          onClick={onExportEntireDeck}
          className="shadow-[var(--shadow-1)] border border-primary/30"
          title="Export all slides as separate high-resolution PNGs"
        >
          <span>Full Deck PNGs ({slideCount})</span>
        </Button>
      )}

      {/* Randomize Photo Button */}
      <Button
        variant="secondary"
        size="md"
        icon="shuffle"
        onClick={onRandomizePhoto}
      >
        Randomize Atmosphere
      </Button>

      {/* Copy Image & Text Button */}
      <Button
        variant="secondary"
        size="md"
        icon="content_copy"
        onClick={onCopyImageAndText}
      >
        {copiedStatus || 'Copy Image & Caption'}
      </Button>

      {/* Calendar Export Button */}
      {onOpenPublishToCalendar && (
        <Button
          variant="secondary"
          size="md"
          icon="calendar_month"
          onClick={onOpenPublishToCalendar}
          className="border-primary/50 text-primary font-semibold hover:bg-primary-soft shadow-[var(--shadow-1)] bg-primary-soft/20"
          title="Export and schedule static posts directly to your publishing calendar with date, time, and platforms"
        >
          <span>Export to Calendar</span>
        </Button>
      )}

      {/* One-Click Publish Pack Drawer Button */}
      {onOpenPublishPack && (
        <Button
          variant="secondary"
          size="md"
          icon="inventory_2"
          onClick={onOpenPublishPack}
          className="border-primary/40 text-ink font-semibold hover:border-primary hover:text-primary shadow-[var(--shadow-1)]"
          title="Open One-Click Publish Pack (Hooks, caption, hashtags, and complete post copying)"
        >
          Publish Pack
        </Button>
      )}

      {/* Platform Safe Zones Overlay Toggle Button */}
      {onToggleSafeZones && (
        <Button
          variant={showSafeZones ? 'soft' : 'secondary'}
          size="md"
          icon="crop_free"
          onClick={onToggleSafeZones}
          className={showSafeZones ? 'border border-primary/50 text-primary font-bold shadow-sm' : ''}
          title="Toggle Instagram and LinkedIn crop boundaries & safe zones"
        >
          <span>{showSafeZones ? 'Safe Zones: On' : 'Safe Zones'}</span>
        </Button>
      )}

      {/* 3x3 Rule-of-Thirds Grid Toggle Button */}
      {onToggleGrid && (
        <Button
          variant={showGrid ? 'soft' : 'secondary'}
          size="md"
          icon="grid_on"
          onClick={onToggleGrid}
          className={showGrid ? 'border border-primary/50 text-primary font-bold shadow-sm' : ''}
          title="Toggle 3×3 Rule-of-Thirds alignment grid (Press G)"
        >
          <span>{showGrid ? 'Grid: On' : 'Grid'}</span>
        </Button>
      )}
    </div>
  );
};
