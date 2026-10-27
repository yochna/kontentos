import React, { useState } from 'react';
import { AI_EXAMPLE_PROMPTS } from '../../../data/staticCardPresets';
import { CardFormat, CarouselSlide } from '../../../types/staticCard';
import { Badge, Button } from '@/components/ui';
import { Icon } from '@/lib/icons';
import { api } from '@/lib/api';

interface Props {
  format: CardFormat;
  onGenerated: (data: { headline: string; supportingText: string; socialCaption?: string }) => void;
  onDeckGenerated?: (data: { slides: CarouselSlide[]; socialCaption?: string }) => void;
}

export const AICopyGenerator: React.FC<Props> = ({ format, onGenerated, onDeckGenerated }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingDeck, setIsGeneratingDeck] = useState(false);
  const [slideCount, setSlideCount] = useState<number>(5);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const isCarousel = format === 'carousel-slide';

  const handleGenerateSingle = async (customSeedPrompt?: string) => {
    const textToUse = customSeedPrompt || prompt;
    if (!textToUse.trim()) {
      setError('Please type a topic or click an example prompt below.');
      return;
    }

    setError(null);
    setSuccessNotice(null);
    setIsGenerating(true);

    try {
      const result = await api.generateStaticCardCopy({
        prompt: textToUse.trim(),
        format,
      });

      if (result && result.headline) {
        onGenerated({
          headline: result.headline,
          supportingText: result.supportingText,
          socialCaption: result.socialCaption || '',
        });
        setSuccessNotice('✓ Fresh copy synthesized with Gemini AI!');
        setTimeout(() => setSuccessNotice(null), 3500);
      } else {
        throw new Error('Failed to generate copy from AI engine.');
      }
    } catch (err: any) {
      console.error('Error generating AI copy:', err);
      setError(err?.message || 'Error generating copy with Gemini AI. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateDeck = async (customSeedPrompt?: string) => {
    const textToUse = customSeedPrompt || prompt;
    if (!textToUse.trim()) {
      setError('Please type a topic or click an example prompt below.');
      return;
    }

    if (!onDeckGenerated) return;

    setError(null);
    setSuccessNotice(null);
    setIsGeneratingDeck(true);

    try {
      const result = await api.generateStaticCarouselDeck({
        prompt: textToUse.trim(),
        slideCount,
      });

      if (result && Array.isArray(result.slides) && result.slides.length > 0) {
        onDeckGenerated({
          slides: result.slides,
          socialCaption: result.socialCaption || '',
        });
        setSuccessNotice(`✓ Full ${result.slides.length}-slide carousel synthesized & loaded into Stepper!`);
        setTimeout(() => setSuccessNotice(null), 4000);
      } else {
        throw new Error('Failed to generate carousel deck from AI engine.');
      }
    } catch (err: any) {
      console.error('Error generating AI deck:', err);
      setError(err?.message || 'Error generating carousel deck. Please try again.');
    } finally {
      setIsGeneratingDeck(false);
    }
  };

  return (
    <div className="rounded-card bg-surface-2/70 border border-line p-4 space-y-3 relative shadow-[var(--shadow-1)]">
      {/* Header with GEMINI AI Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="auto_awesome" size={17} className="text-primary" />
          <span className="text-[13px] font-semibold text-ink">
            {isCarousel ? 'AI Carousel Story Arc Generator' : 'AI Headline & Description Generator'}
          </span>
        </div>
        <Badge tone="primary">GEMINI AI</Badge>
      </div>

      <p className="text-xs text-ink-muted leading-relaxed">
        {isCarousel
          ? 'Enter any prompt or topic. Gemini AI will newly generate a structured 5-slide presentation arc (Hook, Step 1, Step 2, Step 3, The Playbook & CTA) strictly adhering to your prompt with zero placeholders.'
          : 'Describe what kind of post you want. Gemini AI will craft an authoritative headline & punchy tactical takeaway formatted specifically for this card.'}
      </p>

      {/* Prompt Input */}
      <div className="relative">
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            isCarousel
              ? 'e.g. 5 steps to turn 1 raw insight into 6 high-converting assets, or Why top creators decouple ideation from editing...'
              : 'e.g. Why consistency beats high-budget production for creators in 2026, or a 3-step framework to repurpose video into carousels...'
          }
          className="w-full bg-surface border border-line rounded-btn p-3 text-xs text-ink placeholder-ink-dim focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 resize-none transition-all leading-relaxed shadow-[var(--shadow-1)]"
        />
      </div>

      {/* Slide Count Selector (when Carousel format is active) */}
      {isCarousel && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] font-medium text-ink-muted flex items-center gap-1">
            <Icon name="view_carousel" size={13} className="text-primary" />
            <span>Deck Length:</span>
          </span>
          <div className="inline-flex items-center gap-1 bg-surface p-0.5 rounded-btn border border-line">
            {[3, 5, 7].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setSlideCount(num)}
                className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                  slideCount === num
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <span>{num} Slides</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="p-2 rounded-btn bg-danger/10 border border-danger/20 text-danger text-[11px] font-medium flex items-start gap-1.5">
          <Icon name="error_outline" size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successNotice && (
        <div className="p-2 rounded-btn bg-success/10 border border-success/20 text-success text-[11px] font-medium flex items-center gap-1.5">
          <Icon name="check_circle" size={14} />
          <span>{successNotice}</span>
        </div>
      )}

      {/* Quick Example Chips */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-semibold text-ink-dim block">Quick Inspiration Archetypes:</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {AI_EXAMPLE_PROMPTS.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setPrompt(ex.prompt);
                if (isCarousel) {
                  handleGenerateDeck(ex.prompt);
                } else {
                  handleGenerateSingle(ex.prompt);
                }
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface hover:bg-surface-2 border border-line text-[11px] font-semibold text-ink-muted hover:text-ink hover:border-line-strong transition-all cursor-pointer shadow-sm"
            >
              <Icon name={ex.icon} size={13} className="text-primary" />
              <span>{ex.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 pt-1">
        {isCarousel && onDeckGenerated ? (
          <>
            <Button
              variant="primary"
              size="md"
              icon={isGeneratingDeck ? undefined : 'auto_awesome'}
              disabled={isGeneratingDeck || isGenerating}
              onClick={() => handleGenerateDeck()}
              className="w-full justify-center shadow-md font-bold"
            >
              {isGeneratingDeck ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-on-primary" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Synthesizing {slideCount}-Slide Narrative Arc...</span>
                </>
              ) : (
                <span>✨ Generate Full Carousel Story Deck ({slideCount} Slides)</span>
              )}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={isGenerating ? undefined : 'tune'}
              disabled={isGenerating || isGeneratingDeck}
              onClick={() => handleGenerateSingle()}
              className="w-full justify-center text-xs"
            >
              {isGenerating ? 'Synthesizing Current Slide...' : 'Regenerate Current Slide Only'}
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            size="md"
            icon={isGenerating ? undefined : 'auto_awesome'}
            disabled={isGenerating}
            onClick={() => handleGenerateSingle()}
            className="w-full justify-center"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin h-4 w-4 text-on-primary" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Synthesizing Copy with Gemini AI...</span>
              </>
            ) : (
              <span>Generate Headline & Supporting Text</span>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};
