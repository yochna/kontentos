import { describe, expect, it } from 'vitest';
import { splitSentences } from './sentences.js';

describe('splitSentences', () => {
  it('splits ordinary sentences, including questions and exclamations', () => {
    expect(splitSentences('Why does it flop? Stop posting first drafts! Fix the hook.')).toEqual([
      'Why does it flop?',
      'Stop posting first drafts!',
      'Fix the hook.',
    ]);
  });

  it('keeps a time of day with the sentence it opens', () => {
    expect(splitSentences('2 a.m. You finally fixed the bug. Then you slept.')).toEqual([
      '2 a.m. You finally fixed the bug.',
      'Then you slept.',
    ]);
    expect(splitSentences('We shipped at 9 p.m. Everyone cheered.')).toEqual(['We shipped at 9 p.m. Everyone cheered.']);
  });

  it('keeps titles, e.g. and i.e. attached to what follows', () => {
    expect(splitSentences('Dr. Rao explained it. It was short.')).toEqual(['Dr. Rao explained it.', 'It was short.']);
    expect(splitSentences('Use a hook, e.g. a question. Keep it short.')).toEqual(['Use a hook, e.g. a question.', 'Keep it short.']);
  });

  it('does not split inside decimals or after a closing quote that ends the sentence', () => {
    expect(splitSentences('It took 3.5 hours. Worth it.')).toEqual(['It took 3.5 hours.', 'Worth it.']);
    expect(splitSentences('She said “stop.” Then she left.')).toEqual(['She said “stop.”', 'Then she left.']);
  });

  it('splits on the Devanagari danda and returns nothing for blank text', () => {
    expect(splitSentences('नमस्ते दोस्तों। आज हम सीखेंगे।')).toEqual(['नमस्ते दोस्तों।', 'आज हम सीखेंगे।']);
    expect(splitSentences('   ')).toEqual([]);
  });
});
