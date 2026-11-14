import { describe, expect, it } from 'vitest';
import { deckFromTranscript } from './transcriptDeck.js';

const SPEECH =
  'Why does most content flop? Stop publishing first drafts. ' +
  'I shipped forty posts and got three replies back. The problem was the hook, never the idea. ' +
  'So we rewrote only the first line for a month. The reach doubled without changing anything else. ' +
  'The first seven seconds are the bottleneck. Fix the opening and the rest of the film gets to breathe.';

const plain = (value: string) => value.replace(/[\[\]]/g, '');

describe('deckFromTranscript', () => {
  it('uses only words that were spoken, in the order they were spoken', () => {
    const deck = deckFromTranscript(SPEECH, 4)!;
    expect(deck.slides).toHaveLength(4);
    const rebuilt = deck.slides.map((s) => `${plain(s.headline)} ${s.supportingText}`.trim()).join(' ');
    expect(rebuilt.replace(/\s+/g, ' ')).toBe(SPEECH);
    expect(deck.modelUsed).toBe('transcript');
    // Nothing is invented on the creator's behalf, hashtags included.
    expect(deck.socialCaption).toBe('');
  });

  it('numbers the cards and lights exactly one word in each headline', () => {
    const deck = deckFromTranscript(SPEECH, 4)!;
    deck.slides.forEach((slide, i) => {
      expect(slide.id).toBe(i + 1);
      expect(slide.headline.match(/\[[^\]]+\]/g)).toHaveLength(1);
    });
  });

  it('prefers a number over a long word', () => {
    const deck = deckFromTranscript('I shipped forty posts in 2024 and learned. Then it changed everything.', 2)!;
    expect(deck.slides[0].headline).toContain('[2024]');
  });

  it('never makes more cards than there are sentences, and refuses a span with almost nothing in it', () => {
    expect(deckFromTranscript('One thing. Another thing. A third thing.', 8)!.slides).toHaveLength(3);
    expect(deckFromTranscript('Only one sentence here, said slowly.', 4)).toBeNull();
    expect(deckFromTranscript('', 4)).toBeNull();
  });

  it('spills a long opening sentence into the supporting text rather than cutting it', () => {
    const long = Array.from({ length: 24 }, (_, i) => `word${i}`).join(' ') + '.';
    const deck = deckFromTranscript(`${long} Short close.`, 2)!;
    const first = deck.slides[0];
    expect(plain(first.headline).split(' ')).toHaveLength(16);
    expect(first.supportingText.startsWith('word16')).toBe(true);
    expect(first.supportingText).toContain('word23.');
  });

  it('keeps speech brackets from being read as highlights, and splits on the Devanagari danda', () => {
    const deck = deckFromTranscript('[music] नमस्ते दोस्तों। आज हम सीखेंगे। यह बहुत आसान है।', 3)!;
    expect(deck.slides).toHaveLength(3);
    expect(deck.slides.map((s) => plain(s.headline)).join(' ')).not.toContain('music]');
  });

  it('does not cut a time like “2 a.m.” off as a one-word card', () => {
    const deck = deckFromTranscript('2 a.m. You finally fixed the bug. Three days of grit went into it. Nobody saw any of it.', 3)!;
    expect(plain(deck.slides[0].headline)).toBe('2 a.m. You finally fixed the bug.');
  });
});
