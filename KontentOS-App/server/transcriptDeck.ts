/**
 * A carousel cut from what the creator actually said, for the press to fall back on when no copy
 * engine answers.
 *
 * It is not the engine's deck and it does not pretend to be: every word on a card is a word from
 * the span's own transcript, in the order it was spoken. Nothing is paraphrased, no steps are
 * invented and no hashtags are made up. What it adds is only layout — which sentence leads a card,
 * where a card ends — and one lit word in each headline. The press labels the result as built from
 * the transcript, and the creator can edit any card afterwards.
 */

import { splitSentences } from './sentences.js';

export interface TranscriptSlide {
  id: number;
  headline: string;
  supportingText: string;
}

export interface TranscriptDeck {
  slides: TranscriptSlide[];
  socialCaption: string;
  modelUsed: 'transcript';
}

const HEADLINE_WORDS = 16;
const SUPPORT_WORDS = 36;
const MIN_SLIDES = 2;

const words = (value: string): string[] => value.split(/\s+/).filter(Boolean);

/** Contiguous groups of sentences, each close to an equal share of the spoken words. */
function groupSentences(sentences: string[], count: number): string[][] {
  const weights = sentences.map((sentence) => words(sentence).length);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const groups: string[][] = [];
  let seen = 0;
  let current: string[] = [];

  sentences.forEach((sentence, i) => {
    current.push(sentence);
    seen += weights[i];
    const groupsLeft = count - groups.length - 1;
    const sentencesLeft = sentences.length - i - 1;
    const reachedShare = seen >= (total * (groups.length + 1)) / count;
    // Close the group once it holds its share, but never starve the groups still to come.
    if (groupsLeft > 0 && (reachedShare || sentencesLeft === groupsLeft) && sentencesLeft >= groupsLeft) {
      groups.push(current);
      current = [];
    }
  });
  if (current.length) groups.push(current);
  return groups;
}

/** Light a number if the headline has one, otherwise its longest word: a stand-in for "the key word". */
function lightOneWord(headline: string): string {
  const tokens = headline.split(/(\s+)/);
  const core = (token: string) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

  let pick = -1;
  let best = 0;
  tokens.forEach((token, i) => {
    const bare = core(token);
    if (!bare) return;
    if (pick < 0 || best < 100) {
      const score = /\d/.test(bare) ? 100 + bare.length : bare.length >= 6 ? bare.length : 0;
      if (score > best) {
        best = score;
        pick = i;
      }
    }
  });
  if (pick < 0) return headline;

  const token = tokens[pick];
  const bare = core(token);
  const at = token.indexOf(bare);
  tokens[pick] = `${token.slice(0, at)}[${bare}]${token.slice(at + bare.length)}`;
  return tokens.join('');
}

export function deckFromTranscript(excerpt: string, slideCount: number): TranscriptDeck | null {
  // Square brackets in speech ("[music]") would read as highlight markers on the card.
  const clean = excerpt.replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim();
  const sentences = splitSentences(clean);
  if (sentences.length < MIN_SLIDES) return null;

  const wanted = Math.min(Math.max(Math.round(Number(slideCount) || 4), MIN_SLIDES), 8, sentences.length);
  const slides = groupSentences(sentences, wanted).map((group, i): TranscriptSlide => {
    const [first, ...rest] = group;
    const firstWords = words(first);
    // A long opening sentence spills its tail into the supporting text instead of being cut off.
    const headline = firstWords.slice(0, HEADLINE_WORDS).join(' ');
    const spill = firstWords.slice(HEADLINE_WORDS);
    const body = [...spill, ...words(rest.join(' '))];
    const supporting = body.slice(0, SUPPORT_WORDS).join(' ');
    return {
      id: i + 1,
      headline: lightOneWord(headline),
      supportingText: body.length > SUPPORT_WORDS ? `${supporting}…` : supporting,
    };
  });

  return { slides, socialCaption: '', modelUsed: 'transcript' };
}
