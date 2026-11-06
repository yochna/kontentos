import React, { useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button } from '@/components/ui';
import { Input } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { copyVoice, voiceTone } from '@/lib/brandKit';
import { copyModel } from '@/lib/prefs';

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
  'Say it in fewer words',
  'Give the step, not the moral',
  'Sharper claim',
  'Plainer language',
  'Use the number I gave you',
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
  const [instruction, setInstruction] = useState(QUICK_INSTRUCTIONS[0]);
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
        tone: voiceTone(),
        context: copyVoice(),
        model: copyModel(),
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
        setErrorMsg('The copy engine sent back nothing readable.');
      }
    } catch (err: any) {
      console.error('Failed to regenerate slide:', err);
      setErrorMsg(err?.message || 'The copy engine did not answer.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent size="md" hideClose className="gap-0 overflow-hidden p-0">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon name="refresh" size={17} className="shrink-0 text-ink-muted" />
            <div className="min-w-0">
              <DialogTitle className="text-[13px] font-semibold text-ink">
                Rewrite slide {slideIndex} of {totalSlides}
              </DialogTitle>
              <p className="truncate text-[11px] text-ink-muted">
                The engine sees this slide and its two neighbours, then writes a replacement.
              </p>
            </div>
          </div>
          <DialogClose
            aria-label="Close"
            className="text-ink-muted hover:text-ink p-1 rounded-btn hover:bg-surface-2 transition-colors kt-focus"
          >
            <Icon name="close" size={18} />
          </DialogClose>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Narrative Context Flow Previews */}
          <div className="space-y-2 rounded-btn border border-line bg-surface-2/60 p-3 text-xs">
            <span className="kt-eyebrow block text-ink-dim">
              What sits either side of it
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

          {/* What to change: a preset, or the creator's own words */}
          <div className="space-y-2">
            <label
              id="kt-slide-instruction-label"
              htmlFor="kt-slide-instruction"
              className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"
            >
              <Icon name="chat_bubble_outline" size={14} className="text-primary" />
              <span>Say what to change</span>
            </label>
            <ToggleGroup
              value={customText.trim() ? '' : instruction}
              onValueChange={(next) => next && handleSelectQuickChip(next)}
              aria-labelledby="kt-slide-instruction-label"
              variant="solid"
              className="flex-wrap"
            >
              {QUICK_INSTRUCTIONS.map((chip) => (
                <ToggleGroupItem
                  key={chip}
                  value={chip}
                  variant="solid"
                  className="rounded-full px-2.5 py-1 text-[12px] font-medium"
                >
                  <span>{chip}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Input
              id="kt-slide-instruction"
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Or write it: e.g. keep the number, cut the second sentence"
              className="text-xs"
            />
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-2.5 rounded-btn bg-danger/10 text-danger-ink text-xs flex items-center gap-2">
              <Icon name="error" size={14} />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2/40 p-3.5">
          <span className="text-[11px] text-ink-dim">
            The rewrite lands on the panel with an Undo next to it.
          </span>
          <div className="flex shrink-0 items-center gap-2">
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
              icon={isLoading ? 'progress_activity' : 'refresh'}
              iconSpin={isLoading}
              onClick={handleRegenerate}
              disabled={isLoading}
            >
              {isLoading ? 'Rewriting...' : 'Rewrite it'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
