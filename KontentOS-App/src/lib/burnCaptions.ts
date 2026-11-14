/**
 * Captions drawn into the reel's own frames.
 *
 * The .srt and .vtt files stay the honest record of what was said, but most people watch a short
 * with the sound off, and a caption file does nothing there. This turns the span's cues into an
 * ffmpeg `drawtext` chain that the browser cut appends to its filter, so the words are in the video.
 *
 * Two constraints shape it:
 *  - The font the worker loads (/fonts/font.ttf) draws Latin script only. A cue it cannot draw would
 *    come out as empty boxes, so `canBurn` refuses the whole track and the Press says so instead.
 *  - `drawtext` does not wrap. Each cue is broken into short lines here, and a cue too long for the
 *    safe area is split into timed pages rather than cut off, so no spoken word is dropped.
 */

import type { TimedCue } from './captionFiles';

export interface BurnFile {
  /** Name inside the worker's virtual filesystem. */
  name: string;
  /** One line of one page: lines are drawn separately so each can be centered on its own. */
  text: string;
}

export interface BurnPlan {
  /** Appended after the crop chain, comma-separated. */
  filter: string;
  /** Written next to the source before ffmpeg runs; the filter reads each by name. One per line. */
  files: BurnFile[];
  /** How many pages of text the track became (a long cue can be several). */
  pages: number;
}

export const CAPTION_FONT_FILE = 'font.ttf';

const LINE_CHARS = 20; // at 76px in a 1080-wide frame this stays inside the title-safe width
const MAX_LINES = 3;
const MAX_PAGES = 60; // a filtergraph with hundreds of drawtext nodes slows the encode more than it helps

const FONT_SIZE = 76;
const LINE_HEIGHT = 94; // px between baselines at FONT_SIZE in the 1080 × 1920 frame
const TOP = 1306; // 68% down the frame
const MIN_PAGE_SECONDS = 0.7; // a page shorter than this flashes by faster than it can be read

/**
 * Latin letters (with accents), digits and ordinary punctuation, symbols and the typographic
 * quotes and dashes a transcript uses. Anything else — Devanagari, Arabic, CJK, emoji — is outside
 * what the bundled font draws.
 */
const DRAWABLE = /^[\u0020-\u007E\u00A0-\u024F\u2010-\u2027\u2030-\u205E\u20A0-\u20BF\u2122\u2190-\u2193\s]*$/;

export function canBurn(cues: TimedCue[]): boolean {
  return cues.length > 0 && cues.every((cue) => DRAWABLE.test(cue.text));
}

function greedyWrap(words: string[], lineChars: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + 1 + word.length > lineChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Line breaks at word boundaries, balanced: the text is first wrapped the ordinary way, then
 * re-wrapped to the narrowest width that still fits in the same number of lines. That keeps
 * "wrestling with code, and you" from ending on a line holding the single word "you". A word longer
 * than a line is left whole.
 */
export function wrapWords(words: string[], lineChars = LINE_CHARS): string[] {
  const first = greedyWrap(words, lineChars);
  if (first.length <= 1) return first;
  let width = lineChars;
  while (width > 1 && greedyWrap(words, width - 1).length <= first.length) width -= 1;
  return greedyWrap(words, width);
}

interface Page {
  start: number;
  end: number;
  text: string;
}

/** One cue as one or more pages of at most MAX_LINES lines, timed in proportion to their length. */
function paginate(cue: TimedCue): Page[] {
  const words = cue.text.split(/\s+/).filter(Boolean);
  const lines = wrapWords(words);
  const groups: string[][] = [];
  for (let i = 0; i < lines.length; i += MAX_LINES) groups.push(lines.slice(i, i + MAX_LINES));
  if (groups.length === 0) return [];

  const span = cue.end - cue.start;
  const weights = groups.map((group) => group.join(' ').length);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;

  let at = cue.start;
  return groups.map((group, i) => {
    const length = i === groups.length - 1 ? cue.end - at : (span * weights[i]) / total;
    const page = { start: at, end: at + length, text: group.join('\n') };
    at += length;
    return page;
  });
}

const seconds = (value: number) => Math.max(0, value).toFixed(3);

/**
 * Null when there is nothing to draw or it cannot be drawn honestly (see `canBurn`). A page that
 * would be on screen for under a fraction of a second is merged into the one before it, so a burst
 * of tiny cues does not strobe.
 */
export function buildCaptionBurn(cues: TimedCue[]): BurnPlan | null {
  if (!canBurn(cues)) return null;

  const pages: Page[] = [];
  for (const cue of cues) {
    for (const page of paginate(cue)) {
      const last = pages[pages.length - 1];
      const merged = last ? `${last.text}\n${page.text}` : '';
      // Merged only when every line still fits on screen: a flash that cannot join is shown as it
      // is, because dropping a line to make room would take a spoken word out of the video.
      if (last && page.end - page.start < MIN_PAGE_SECONDS && page.start - last.end < 0.25 && merged.split('\n').length <= MAX_LINES) {
        last.text = merged;
        last.end = page.end;
      } else {
        pages.push({ ...page });
      }
    }
  }
  if (pages.length === 0 || pages.length > MAX_PAGES) return null;

  // `drawtext` can only align a block to the left, so every line is its own node: centered on its
  // own width, stacked by a fixed line height. All of a page's lines share its on-screen window.
  const files: BurnFile[] = [];
  const nodes: string[] = [];
  pages.forEach((page, p) => {
    page.text.split('\n').forEach((line, l) => {
      const name = `cap_${String(p).padStart(3, '0')}_${l}.txt`;
      files.push({ name, text: line });
      nodes.push(
        [
          `drawtext=fontfile=${CAPTION_FONT_FILE}`,
          `textfile=${name}`,
          'expansion=none',
          'fontcolor=white',
          `fontsize=${FONT_SIZE}`,
          'borderw=7',
          'bordercolor=black@0.9',
          'x=(w-text_w)/2',
          `y=${TOP + l * LINE_HEIGHT}`,
          `enable='between(t,${seconds(page.start)},${seconds(page.end)})'`,
        ].join(':')
      );
    });
  });
  const filter = nodes.join(',');

  return { filter, files, pages: pages.length };
}
