import React from 'react';
import { Icon } from '@/lib/icons';

interface Props {
  headline: string;
  supportingText: string;
  textSizeAdjust?: number;
  onHeadlineChange: (val: string) => void;
  onSupportingTextChange: (val: string) => void;
  onTextSizeAdjustChange?: (val: number) => void;
  onOpenRegenerate?: () => void;
  hasUndo?: boolean;
  onUndo?: () => void;
  onDismissUndo?: () => void;
}

export const CopyEditor: React.FC<Props> = ({
  headline,
  supportingText,
  textSizeAdjust = 0,
  onHeadlineChange,
  onSupportingTextChange,
  onTextSizeAdjustChange,
  onOpenRegenerate,
  hasUndo,
  onUndo,
  onDismissUndo,
}) => {
  return (
    <div className="space-y-3.5">
      {/* Undo Safeguard Banner (Task 2.4.2) */}
      {hasUndo && onUndo && (
        <div className="flex items-center justify-between p-2.5 rounded-btn bg-primary-soft/90 border border-primary/30 text-xs shadow-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <Icon name="auto_awesome" size={15} className="text-primary shrink-0" />
            <span className="text-ink font-medium">Slide copy regenerated with Gemini AI</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onUndo}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-primary text-on-primary text-[11px] font-semibold hover:bg-primary-hover shadow-xs transition-colors cursor-pointer"
              title="Restore previous slide copy"
            >
              <Icon name="undo" size={12} />
              <span>Undo Revision</span>
            </button>
            {onDismissUndo && (
              <button
                type="button"
                onClick={onDismissUndo}
                className="text-[11px] text-ink-muted hover:text-ink cursor-pointer px-1 py-0.5"
                title="Dismiss undo banner"
              >
                Keep
              </button>
            )}
          </div>
        </div>
      )}

      {/* Headline / Main Hook Statement */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
            <Icon name="title" size={16} className="text-primary" />
            <span>Headline / Main Hook Statement</span>
          </label>
          <div className="flex items-center gap-2">
            {onOpenRegenerate && (
              <button
                type="button"
                onClick={onOpenRegenerate}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-hover transition-colors cursor-pointer bg-primary/10 hover:bg-primary/15 px-2 py-0.5 rounded-md"
                title="Rewrite this slide with Gemini AI"
              >
                <Icon name="auto_awesome" size={12} />
                <span>Regenerate Slide</span>
              </button>
            )}
            <span className="text-[11px] text-ink-dim font-mono">
              {headline.length} chars
            </span>
          </div>
        </div>
        <textarea
          rows={3}
          value={headline}
          onChange={(e) => onHeadlineChange(e.target.value)}
          placeholder="Most creators spend [80% of their time] on repetitive edits instead of high-leverage ideas."
          className="w-full bg-surface border border-line rounded-btn p-3 text-xs font-medium text-ink placeholder-ink-dim focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 resize-none transition-all leading-relaxed shadow-[var(--shadow-1)]"
        />
        <div className="flex items-center justify-between text-[11px] text-ink-muted pt-0.5">
          <span className="flex items-center gap-1">
            <Icon name="auto_awesome" size={12} className="text-primary" />
            <span>Pro-Tip: Wrap words in <code className="text-primary font-mono font-bold bg-primary/10 px-1 py-0.5 rounded">[brackets]</code> to glow in accent color.</span>
          </span>
        </div>
      </div>

      {/* Supporting Text / Tactical Takeaway */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
            <Icon name="notes" size={16} className="text-primary" />
            <span>Supporting Text / Tactical Takeaway</span>
          </label>
          <span className="text-[11px] text-ink-dim font-mono">
            {supportingText.length} chars
          </span>
        </div>
        <textarea
          rows={3}
          value={supportingText}
          onChange={(e) => onSupportingTextChange(e.target.value)}
          placeholder="Here is the exact 3-step system to turn 1 raw thought into 6 high-converting assets in under 5 minutes."
          className="w-full bg-surface border border-line rounded-btn p-3 text-xs font-medium text-ink placeholder-ink-dim focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 resize-none transition-all leading-relaxed shadow-[var(--shadow-1)]"
        />
      </div>

      {/* Dynamic Font-Size Scaling Fine-Tuner */}
      {onTextSizeAdjustChange && (
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Icon name="format_size" size={15} className="text-primary" />
            <span>Typography Auto-Fit:</span>
          </div>
          <div className="inline-flex items-center gap-1 bg-surface-2 p-0.5 rounded-btn border border-line">
            {[
              { label: 'Compact', val: -1 },
              { label: 'Auto (Default)', val: 0 },
              { label: 'Prominent', val: 1 },
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => onTextSizeAdjustChange(opt.val)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                  textSizeAdjust === opt.val
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
