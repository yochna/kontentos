import React from 'react';
import { Icon } from '@/lib/icons';
import { Textarea } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface Props {
  headline: string;
  supportingText: string;
  textSizeAdjust?: number;
  onHeadlineChange: (val: string) => void;
  onSupportingTextChange: (val: string) => void;
  onTextSizeAdjustChange?: (val: number) => void;
  onOpenRegenerate?: () => void;
  onInsertHeadlineLayer?: () => void;
  onInsertBodyLayer?: () => void;
  hasUndo?: boolean;
  onUndo?: () => void;
  onDismissUndo?: () => void;
}

const SIZE_OPTIONS = [
  { label: 'Compact', val: -1 },
  { label: 'Auto', val: 0 },
  { label: 'Prominent', val: 1 },
];

const layerButtonClass =
  'kt-focus inline-flex cursor-pointer items-center gap-1 rounded-btn border border-line bg-surface-2 px-2 py-0.5 ' +
  'text-[11px] font-semibold text-ink-muted transition-colors hover:border-line-strong hover:bg-surface-3 hover:text-ink';

export const CopyEditor: React.FC<Props> = ({
  headline,
  supportingText,
  textSizeAdjust = 0,
  onHeadlineChange,
  onSupportingTextChange,
  onTextSizeAdjustChange,
  onOpenRegenerate,
  onInsertHeadlineLayer,
  onInsertBodyLayer,
  hasUndo,
  onUndo,
  onDismissUndo,
}) => {
  return (
    <div className="space-y-4">
      {hasUndo && onUndo && (
        <div className="flex items-center justify-between gap-3 rounded-btn border border-line bg-surface-2 px-3 py-2 text-xs">
          <span className="flex items-center gap-2 text-ink-muted">
            <Icon name="undo" size={15} className="shrink-0 text-ink-dim" />
            <span>The engine rewrote this slide</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onUndo}
              className="kt-focus cursor-pointer rounded-btn bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink shadow-[var(--shadow-1)] transition-colors hover:border-line-strong"
              title="Put the words back the way they were"
            >
              Undo
            </button>
            {onDismissUndo && (
              <button
                type="button"
                onClick={onDismissUndo}
                className="kt-focus cursor-pointer rounded-btn px-2 py-1 text-[11px] text-ink-muted transition-colors hover:text-ink"
                title="Keep the rewrite and clear this banner"
              >
                Keep it
              </button>
            )}
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="kt-card-headline"
            className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"
          >
            <Icon name="title" size={16} className="text-primary" />
            <span>Headline</span>
          </label>
          <div className="flex items-center gap-2">
            {onInsertHeadlineLayer && (
              <button
                type="button"
                onClick={onInsertHeadlineLayer}
                className={layerButtonClass}
                title="Copy this headline onto the canvas as its own layer"
              >
                <Icon name="add_box" size={12} />
                <span>Add layer</span>
              </button>
            )}
            {onOpenRegenerate && (
              <button
                type="button"
                onClick={onOpenRegenerate}
                className="kt-focus inline-flex cursor-pointer items-center gap-1 rounded-btn px-2 py-0.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
                title="Ask the engine to rewrite this slide"
              >
                <Icon name="refresh" size={12} />
                <span>Rewrite</span>
              </button>
            )}
            <span className="font-mono text-[11px] text-ink-dim">{headline.length}</span>
          </div>
        </div>
        <Textarea
          id="kt-card-headline"
          rows={3}
          value={headline}
          onChange={(e) => onHeadlineChange(e.target.value)}
          placeholder="[the claim this deck makes]"
          className="p-3 text-xs font-medium"
        />
        <p className="flex items-center gap-1 pt-0.5 text-[11px] text-ink-dim">
          <Icon name="info" size={12} />
          <span>
            Words in <code className="font-mono text-primary">[brackets]</code> light up in the accent colour.
          </span>
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="kt-card-body"
            className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"
          >
            <Icon name="notes" size={16} className="text-primary" />
            <span>Body</span>
          </label>
          <div className="flex items-center gap-2">
            {onInsertBodyLayer && (
              <button
                type="button"
                onClick={onInsertBodyLayer}
                className={layerButtonClass}
                title="Copy this body text onto the canvas as its own layer"
              >
                <Icon name="add_box" size={12} />
                <span>Add layer</span>
              </button>
            )}
            <span className="font-mono text-[11px] text-ink-dim">{supportingText.length}</span>
          </div>
        </div>
        <Textarea
          id="kt-card-body"
          rows={3}
          value={supportingText}
          onChange={(e) => onSupportingTextChange(e.target.value)}
          placeholder="[why you are making it — one sentence, in your own words]"
          className="p-3 text-xs font-medium"
        />
      </div>

      {onTextSizeAdjustChange && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted">
            <Icon name="format_size" size={15} className="text-primary" />
            <span>Type size</span>
          </span>
          <ToggleGroup
            value={String(textSizeAdjust)}
            onValueChange={(next) => next && onTextSizeAdjustChange(Number(next))}
            aria-label="Type size on the card"
            variant="segment"
          >
            {SIZE_OPTIONS.map((opt) => (
              <ToggleGroupItem
                key={opt.val}
                value={String(opt.val)}
                variant="segment"
                className="px-2.5 py-0.5 text-[12px]"
              >
                <span>{opt.label}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
    </div>
  );
};
