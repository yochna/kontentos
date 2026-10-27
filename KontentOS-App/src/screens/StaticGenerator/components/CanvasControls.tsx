import React from 'react';
import { Button } from '@/components/ui';
import { Icon } from '@/lib/icons';

interface Props {
  isExporting: boolean;
  isCarouselFormat?: boolean;
  slideCount?: number;
  snapEnabled?: boolean;
  onToggleSnap?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  canPaste?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onResetLayout?: () => void;
  onAddText?: () => void;
  onAddImage?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onExportPNG: () => void;
  onExportEntireDeck?: () => void;
  onExportLinkedInPDF?: () => void;
  onCopyImageAndText: () => void;
  copiedStatus: string | null;
  onOpenPublishPack?: () => void;
  onOpenPublishToCalendar?: () => void;
}

export const CanvasControls: React.FC<Props> = ({
  isExporting,
  isCarouselFormat = false,
  slideCount = 5,
  snapEnabled = true,
  onToggleSnap,
  canUndo = false,
  canRedo = false,
  canPaste = false,
  onUndo,
  onRedo,
  onResetLayout,
  onAddText,
  onAddImage,
  onCopy,
  onPaste,
  onExportPNG,
  onExportEntireDeck,
  onExportLinkedInPDF,
  onCopyImageAndText,
  copiedStatus,
  onOpenPublishPack,
  onOpenPublishToCalendar,
}) => {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-center gap-2">
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

        <Button
          variant="secondary"
          size="md"
          icon="content_copy"
          onClick={onCopyImageAndText}
        >
          {copiedStatus || 'Copy Image & Caption'}
        </Button>

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
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1 p-1 rounded-xl bg-surface-2/70 border border-line sm:flex-nowrap">
        <DockButton icon="title" label="Text" title="Add text box (T)" onClick={onAddText} />
        <DockButton icon="image" label="Image" title="Add image from storage" onClick={onAddImage} />

        <DockDivider />

        <DockButton
          icon="undo"
          label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!canUndo}
          onClick={onUndo}
        />
        <DockButton
          icon="redo"
          label="Redo"
          title="Redo (Ctrl+Y)"
          disabled={!canRedo}
          onClick={onRedo}
        />
        <DockButton
          icon="restart_alt"
          label="Reset"
          title="Reset slide layout (Ctrl+Shift+R)"
          tone="warning"
          onClick={onResetLayout}
        />

        <DockDivider />

        <DockIcon
          icon="content_copy"
          title="Copy selected element, or all layers when nothing is selected"
          onClick={onCopy}
        />
        <DockIcon
          icon="content_paste"
          title="Paste"
          disabled={!canPaste}
          onClick={onPaste}
        />

        <DockDivider />

        <DockButton
          icon="grid_4x4"
          label={snapEnabled ? 'Snap On' : 'Snap'}
          title={snapEnabled ? 'Magnetic snapping: On (S)' : 'Magnetic snapping: Off (S)'}
          active={snapEnabled}
          onClick={onToggleSnap}
        />
      </div>
    </div>
  );
};

const DockButton: React.FC<{
  icon: string;
  label: string;
  title?: string;
  active?: boolean;
  disabled?: boolean;
  tone?: 'default' | 'warning';
  onClick?: () => void;
}> = ({ icon, label, title, active = false, disabled = false, tone = 'default', onClick }) => (
  <button
    type="button"
    title={title || label}
    disabled={disabled}
    onClick={onClick}
    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
      disabled
        ? 'text-ink-dim/40 cursor-not-allowed'
        : tone === 'warning'
        ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
        : active
        ? 'bg-primary/15 border border-primary/30 text-primary'
        : 'text-ink-muted hover:bg-surface hover:text-ink'
    }`}
  >
    <Icon name={icon} size={14} />
    <span>{label}</span>
  </button>
);

const DockIcon: React.FC<{
  icon: string;
  title: string;
  disabled?: boolean;
  onClick?: () => void;
}> = ({ icon, title, disabled = false, onClick }) => (
  <button
    type="button"
    title={title}
    disabled={disabled}
    onClick={onClick}
    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
      disabled
        ? 'text-ink-dim/40 cursor-not-allowed'
        : 'text-ink-muted hover:bg-surface hover:text-ink'
    }`}
  >
    <Icon name={icon} size={15} />
  </button>
);

const DockDivider: React.FC = () => <span className="w-px h-5 bg-line mx-0.5" />;
