/**
 * Sentence splitting for spoken transcripts.
 *
 * A bare "split after . ! ?" cuts "2 a.m. You finally fixed the bug." into "2 a.m." and the rest,
 * which then becomes a one-word headline or a hook that says nothing. Spoken English is full of
 * abbreviations and times, so a period only ends a sentence here when it is not the tail of one.
 *
 * When in doubt the pieces stay together: a sentence that runs long is trimmed or spilled by the
 * caller, while a wrongly cut one leaves a fragment on a card.
 */

// "a.m.", "p.m.", "e.g.", "i.e.", "U.S." — letters each followed by a period.
const DOTTED = /(?:^|[\s("'“])(?:[A-Za-z]\.){2,}$/;
// Titles and common abbreviations that take a name or a list after them.
const TITLE = /(?:^|[\s("'“])(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|approx|Inc|Ltd|No)\.$/i;

function endsWithAbbreviation(chunk: string): boolean {
  const tail = chunk.trimEnd();
  return DOTTED.test(tail) || TITLE.test(tail);
}

/** Sentence ends in Latin and Devanagari script; a clause with no end mark is still one sentence. */
export function splitSentences(text: string): string[] {
  const pieces = text
    .split(/(?<=[.!?।॥]["'”’)]*)\s+/)
    .map((piece) => piece.trim())
    .filter(Boolean);

  const sentences: string[] = [];
  for (const piece of pieces) {
    const last = sentences.length - 1;
    if (last >= 0 && endsWithAbbreviation(sentences[last])) {
      sentences[last] = `${sentences[last]} ${piece}`;
    } else {
      sentences.push(piece);
    }
  }
  return sentences;
}
