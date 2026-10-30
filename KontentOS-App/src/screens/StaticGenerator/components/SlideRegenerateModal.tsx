import React, { useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, useDismiss } from '@/components/ui';
import { api } from '@/lib/api';

interface SlideContent {
  headline: string;
  supportingText: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  slideIndex: number;
  totalSlides: number;
  currentSlide: SlideContent;
  previousSlide?: SlideContent | null;
  nextSlide?: SlideContent | null;
  topic?: string;
  onApplyRegeneration: (
    newSlide: SlideContent,
    previousSlideSnapshot: SlideContent
  ) => void;
}

const QUICK_INSTRUCTIONS = [
  'Make more concise',
  'Add concrete example',
  'Strengthen hook',
  'Make more tactical',
  'Add metric or number',
  'Sharpen contrast',
];

export const SlideRegenerateModal: React.FC<Props> = ({
  isOpen,
  onClose,
  slideIndex,
  totalSlides,
  currentSlide,
  previousSlide,
  nextSlide,
  topic = '',
  onApplyRegeneration,
}) => {
  useDismiss(isOpen ? onClose : undefined);
  const [instruction, setInstruction] = useState('Make more concise');
  const [customText, setCustomText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const activeInstruction = customText.trim() || instruction;

  const handleSelectQuickChip = (chip: string) => {
    setInstruction(chip);
    setCustomText('');
    setErrorMsg(null);
  };

  const handleRegenerate = async () => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const result = await api.regenerateCarouselSlide({
        slideIndex,
        totalSlides,
        currentSlide: {
          headline: currentSlide.headline,
          supportingText: currentSlide.supportingText,
        },
        previousSlide: previousSlide
          ? {
              headline: previousSlide.headline,
              supportingText: previousSlide.supportingText,
            }
          : null,
        nextSlide: nextSlide
          ? {
              headline: nextSlide.headline,
              supportingText: nextSlide.supportingText,
            }
          : null,
        topic,
        instruction: activeInstruction,
      });

      if (result && (result.headline || result.supportingText)) {
        onApplyRegeneration(
          {
            headline: result.headline || currentSlide.headline,
            supportingText: result.supportingText || currentSlide.supportingText,
          },
          {
            headline: currentSlide.headline,
            supportingText: currentSlide.supportingText,
          }
        );
        onClose();
      } else {
        setErrorMsg('Could not regenerate slide. Please try again.');
      }
    } catch (err: any) {
      console.error('Failed to regenerate slide:', err);
      setErrorMsg(err?.message || 'Error communicating with Gemini AI.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)] backdrop-blur-sm transition-opacity animate-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg bg-surface border border-line rounded-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-line bg-surface-2/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-soft text-primary flex items-center justify-center">
              <Icon name="auto_awesome" size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-ink">
                Regenerate Slide {slideIndex} of {totalSlides}
              </h2>
              <p className="text-[11px] text-ink-muted">
                Rewrites with Gemini AI while preserving narrative flow and context continuity
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-muted hover:text-ink p-1 rounded-btn hover:bg-surface-2 transition-colors cursor-pointer"
            title="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Narrative Context Flow Previews */}
          <div className="p-3 bg-surface-2/60 rounded-btn border border-line/70 space-y-2 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-dim block">
              Carousel Story Arc Continuity
            </span>

            {/* Preceding slide context */}
            {previousSlide && (
              <div className="flex items-start gap-2 text-ink-muted text-[11px]">
                <span className="font-mono text-ink-dim shrink-0">Slide {slideIndex - 1}:</span>
                <span className="truncate italic">"{previousSlide.headline}"</span>
              </div>
            )}

            {/* Current slide to rewrite */}
            <div className="flex items-start gap-2 p-2 rounded bg-primary/10 border border-primary/20 text-ink font-medium text-xs">
              <span className="font-mono text-primary shrink-0 font-bold">Slide {slideIndex} (Active):</span>
              <span className="line-clamp-2">"{currentSlide.headline}"</span>
            </div>

            {/* Next slide context */}
            {nextSlide && (
              <div className="flex items-start gap-2 text-ink-muted text-[11px]">
                <span className="font-mono text-ink-dim shrink-0">Slide {slideIndex + 1}:</span>
                <span className="truncate italic">"{nextSlide.headline}"</span>
              </div>
            )}
          </div>

          {/* Quick Instruction Prompt Chips */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <Icon name="tips_and_updates" size={14} className="text-primary" />
              <span>Quick Revision Instruction:</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_INSTRUCTIONS.map((chip) => {
                const isSelected = !customText && instruction === chip;
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleSelectQuickChip(chip)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-primary text-on-primary font-semibold shadow-xs'
                        : 'bg-surface-2 text-ink-muted hover:text-ink hover:bg-surface-3 border border-line'
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Instruction Input */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-muted">
              Or specify custom directions:
            </label>
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="e.g. Turn into a 3-step checklist, strengthen counter-intuitive contrast..."
              className="w-full bg-surface-2 border border-line rounded-btn px-3 py-2 text-xs text-ink placeholder:text-ink-dim focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-2.5 rounded-btn bg-danger-soft text-danger text-xs flex items-center gap-2">
              <Icon name="error" size={14} />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-line bg-surface-2/40 flex items-center justify-between">
          <span className="text-[11px] text-ink-dim">
            Includes 1-click Undo safeguard
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={isLoading ? 'progress_activity' : 'auto_awesome'}
              onClick={handleRegenerate}
              disabled={isLoading}
              className={isLoading ? 'opacity-80' : ''}
            >
              {isLoading ? 'Rewriting with AI...' : 'Regenerate Slide'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
