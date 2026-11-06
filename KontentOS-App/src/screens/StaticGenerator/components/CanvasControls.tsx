import React from 'react';
import { Button } from '@/components/ui';
import { Icon } from '@/lib/icons';
import { Tooltip } from '@/components/ui/tooltip';

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
  progress?: string | null;
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
  progress = null,
  onOpenPublishPack,
  onOpenPublishToCalendar,
}) => {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="primary"
          size="md"
          icon={isExporting ? 'progress_activity' : 'download'}
          iconSpin={isExporting}
          disabled={isExporting}
          onClick={onExportPNG}
          className="shadow-[var(--shadow-2)]"
        >
          <span>{isExporting ? 'Rendering…' : isCarouselFormat ? 'Export this slide (3×)' : 'Export PNG (3×)'}</span>
        </Button>

        {isCarouselFormat && onExportLinkedInPDF && (
          <Button
            variant="secondary"
            size="md"
            icon={isExporting ? undefined : 'picture_as_pdf'}
            disabled={isExporting}
            onClick={onExportLinkedInPDF}
            className="border border-line hover:border-primary/50"
            title="Save every slide as one multi-page PDF, the format LinkedIn accepts for a document post"
          >
            <span>Deck as PDF</span>
          </Button>
        )}

        {isCarouselFormat && onExportEntireDeck && (
          <Button
            variant="secondary"
            size="md"
            icon={isExporting ? undefined : 'layers'}
            disabled={isExporting}
            onClick={onExportEntireDeck}
            className="border border-line hover:border-primary/50"
            title="Save every slide as its own PNG"
          >
            <span>All slides as PNG ({slideCount})</span>
          </Button>
        )}

        <Button
          variant="secondary"
          size="md"
          icon="content_copy"
          disabled={isExporting}
          onClick={onCopyImageAndText}
        >
          Copy image & caption
        </Button>

        {onOpenPublishToCalendar && (
          <Button
            variant="secondary"
            size="md"
            icon="calendar_month"
            onClick={onOpenPublishToCalendar}
            className="border border-primary/40 text-primary hover:bg-primary-soft"
            title="Send the exported cards to the Calendar, which queues them for the date you set"
          >
            <span>Send to Calendar</span>
          </Button>
        )}

        {onOpenPublishPack && (
          <Button
            variant="secondary"
            size="md"
            icon="notes"
            onClick={onOpenPublishPack}
            className="border border-line hover:border-primary/50"
            title="The words from this card, split into the blocks a scheduler asks for"
          >
            Publish pack
          </Button>
        )}
      </div>

      {progress ? (
        <p role="status" className="text-center text-[12px] text-ink-muted">
          {progress}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-1 p-1 rounded-card bg-surface-2/70 border border-line sm:flex-nowrap">
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
  <Tooltip content={title || label}>
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-btn text-[11px] font-semibold whitespace-nowrap transition-colors ${
        disabled
          ? 'text-ink-dim/40 cursor-not-allowed'
          : tone === 'warning'
          ? 'border border-danger/30 bg-danger/10 text-danger-ink hover:bg-danger/20'
          : active
          ? 'border border-primary/30 bg-primary/15 text-primary'
          : 'text-ink-muted hover:bg-surface hover:text-ink'
      }`}
    >
      <Icon name={icon} size={14} />
      <span>{label}</span>
    </button>
  </Tooltip>
);

const DockIcon: React.FC<{
  icon: string;
  title: string;
  disabled?: boolean;
  onClick?: () => void;
}> = ({ icon, title, disabled = false, onClick }) => (
  <Tooltip content={title}>
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={title}
      className={`w-7 h-7 rounded-btn flex items-center justify-center transition-colors ${
        disabled
          ? 'text-ink-dim/40 cursor-not-allowed'
          : 'text-ink-muted hover:bg-surface hover:text-ink'
      }`}
    >
      <Icon name={icon} size={15} />
    </button>
  </Tooltip>
);

const DockDivider: React.FC = () => <span className="w-px h-5 bg-line mx-0.5" />;
