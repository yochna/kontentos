import React, { useState } from 'react';
import { AI_EXAMPLE_PROMPTS } from '../../../data/staticCardPresets';
import { CardFormat, CarouselSlide } from '../../../types/staticCard';
import { Button } from '@/components/ui';
import { Field, Textarea } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { notify } from '@/components/ui/toast';
import { Icon } from '@/lib/icons';
import { api } from '@/lib/api';
import { copyVoice, voiceTone } from '@/lib/brandKit';
import { copyModel, copyModelLabel } from '@/lib/prefs';

interface Props {
  format: CardFormat;
  onGenerated: (data: { headline: string; supportingText: string; socialCaption?: string }) => void;
  onDeckGenerated?: (data: { slides: CarouselSlide[]; socialCaption?: string }) => void;
}

const DECK_LENGTHS = ['3', '5', '7'];

export const AICopyGenerator: React.FC<Props> = ({ format, onGenerated, onDeckGenerated }) => {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState<'card' | 'deck' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slideCount, setSlideCount] = useState('5');

  const isCarousel = format === 'carousel-slide';
  // Read once per render, not per click: the line under the box has to describe the engine this
  // panel is about to call, and the Room and Kit stations can change both between visits.
  const voice = copyVoice();
  const engine = `${copyModelLabel()} · ${voice ? 'the voice in Kit' : 'a default voice'}`;

  /** What the engine sends back is dropped onto the canvas, so the wording has to say who wrote it. */
  const writtenNotice = (modelUsed?: string, what = 'The card') =>
    `${what} written by ${modelUsed ?? 'the copy engine'} — it is a draft until you read it.`;

  const writeCard = async (seed?: string) => {
    const textToUse = (seed ?? prompt).trim();
    if (!textToUse) {
      setError('Give it a topic first. One line is enough.');
      return;
    }

    setError(null);
    setBusy('card');

    try {
      const result = await api.generateStaticCardCopy({
        prompt: textToUse,
        format,
        tone: voiceTone(),
        context: voice,
        model: copyModel(),
      });

      if (!result?.headline) throw new Error('The copy engine sent back nothing readable.');

      onGenerated({
        headline: result.headline,
        supportingText: result.supportingText,
        socialCaption: result.socialCaption || '',
      });
      notify.ok(
        result.fallback
          ? 'No engine answered, so this is the scaffold. Every bracket is yours to fill.'
          : writtenNotice(result.modelUsed)
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'The copy engine did not answer. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const writeDeck = async (seed?: string) => {
    const textToUse = (seed ?? prompt).trim();
    if (!textToUse) {
      setError('Give it a topic first. One line is enough.');
      return;
    }

    if (!onDeckGenerated) return;

    setError(null);
    setBusy('deck');

    try {
      const result = await api.generateStaticCarouselDeck({
        prompt: textToUse,
        slideCount: Number(slideCount),
        tone: voiceTone(),
        context: voice,
        model: copyModel(),
      });

      if (!Array.isArray(result.slides) || result.slides.length === 0) {
        throw new Error('The copy engine sent back nothing readable.');
      }

      onDeckGenerated({ slides: result.slides, socialCaption: result.socialCaption || '' });
      notify.ok(writtenNotice(result.modelUsed, `${result.slides.length} slides`));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'The copy engine did not answer. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Field
        label={isCarousel ? 'What is the deck about?' : 'What is the card about?'}
        hint={`Written by ${engine}. Nothing reaches the card until you accept it.`}
        error={error ?? undefined}
      >
        {({ id, describedBy }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              isCarousel
                ? 'e.g. the three things you do between a raw voice note and a shipped post — name each one and what it costs'
                : 'e.g. why posting every day stopped being the point, or the one number that changed your mind this month'
            }
            className="text-xs"
          />
        )}
      </Field>

      {isCarousel && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] font-semibold text-ink-muted">Slides in the deck</span>
          <ToggleGroup
            value={slideCount}
            onValueChange={(next) => next && setSlideCount(next)}
            aria-label="Slides in the deck"
            variant="segment"
          >
            {DECK_LENGTHS.map((num) => (
              <ToggleGroupItem key={num} value={num} variant="segment" className="px-2.5 py-0.5 text-[12px]">
                <span>{num}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}

      <div className="space-y-2">
        <span className="kt-eyebrow block text-ink-dim">Start from one of these</span>
        <div className="flex flex-wrap gap-1.5">
          {AI_EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => {
                setPrompt(ex.prompt);
                if (isCarousel) void writeDeck(ex.prompt);
                else void writeCard(ex.prompt);
              }}
              className="kt-focus inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-ink"
            >
              <Icon name={ex.icon} size={13} className="text-primary" />
              <span>{ex.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {isCarousel && onDeckGenerated ? (
          <>
            <Button
              variant="primary"
              size="md"
              icon={busy === 'deck' ? 'progress_activity' : 'draw'}
              iconSpin={busy === 'deck'}
              disabled={busy !== null}
              onClick={() => void writeDeck()}
              className="w-full justify-center"
            >
              <span>{busy === 'deck' ? 'Writing the deck...' : `Write the deck (${slideCount} slides)`}</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={busy === 'card' ? 'progress_activity' : 'refresh'}
              iconSpin={busy === 'card'}
              disabled={busy !== null}
              onClick={() => void writeCard()}
              className="w-full justify-center"
            >
              <span>{busy === 'card' ? 'Rewriting this slide...' : 'Rewrite this slide only'}</span>
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            size="md"
            icon={busy === 'card' ? 'progress_activity' : 'draw'}
            iconSpin={busy === 'card'}
            disabled={busy === 'card'}
            onClick={() => void writeCard()}
            className="w-full justify-center"
          >
            <span>{busy === 'card' ? 'Writing...' : 'Write the headline and body'}</span>
          </Button>
        )}
      </div>
    </div>
  );
};
