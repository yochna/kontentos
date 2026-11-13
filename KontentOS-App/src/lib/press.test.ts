import { describe, expect, it } from 'vitest';
import { deckByline, plainHighlights, splitHighlights } from './press';

describe('splitHighlights', () => {
  it('lights the bracketed words and drops the brackets', () => {
    expect(splitHighlights('Cut [3 minutes] of dead air')).toEqual([
      { text: 'Cut ', hot: false },
      { text: '3 minutes', hot: true },
      { text: ' of dead air', hot: false },
    ]);
  });

  it('handles several markers, one at the very start and one at the very end', () => {
    expect(splitHighlights('[One] thing, [two]')).toEqual([
      { text: 'One', hot: true },
      { text: ' thing, ', hot: false },
      { text: 'two', hot: true },
    ]);
  });

  it('leaves unbalanced or empty brackets as the creator’s own text', () => {
    expect(plainHighlights('a [b and c')).toBe('a [b and c');
    expect(plainHighlights('empty [] stays')).toBe('empty [] stays');
    expect(splitHighlights('')).toEqual([]);
  });

  it('plainHighlights never leaves a marker behind on a well-formed line', () => {
    expect(plainHighlights('Step 1: record [one take], then [press it]')).toBe('Step 1: record one take, then press it');
  });
});

describe('deckByline', () => {
  const deck = { slides: [], socialCaption: '', modelUsed: 'gemini-test' };

  it('names the engine that wrote the deck', () => {
    expect(deckByline(deck)).toBe('Written by gemini-test.');
  });

  it('says plainly when the cards were cut from the transcript, and when the creator edited them', () => {
    expect(deckByline({ ...deck, modelUsed: 'transcript' })).toMatch(/no engine answered/);
    expect(deckByline({ ...deck, edited: true })).toBe('Written by gemini-test, then edited by you.');
  });
});
