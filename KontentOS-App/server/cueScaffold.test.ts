import { describe, expect, it } from 'vitest';
import { generateCueScaffold } from './cueScaffold';

// Things this app used to put into a creator's caption track as if the creator had said them.
const INVENTED = /top creators|most creators|\b2026\b|\d+ hours|save this reel|stop scrolling|strategy exact|exact strategy|viral/i;

describe('the cue scaffold for an untranscribed clip', () => {
  it('holds the timing without writing a single sentence for the creator', () => {
    const cues = generateCueScaffold('Editing a 30s reel in one take', 30, 'English');
    expect(JSON.stringify(cues)).not.toMatch(INVENTED);
    expect(cues.segments.length).toBeGreaterThan(1);
    expect(cues.segments.every((s) => s.text.startsWith('[') && s.text.endsWith(']'))).toBe(true);
    // The creator's own topic is the only thing it is allowed to mention.
    expect(cues.segments[0].text).toContain('Editing a 30s reel in one take');
  });

  it('never lets a cue run past the length of the clip', () => {
    const cues = generateCueScaffold('Any topic', 6, 'English');
    const last = cues.segments[cues.segments.length - 1];
    const endSec = last.end
      .replace(/,\d+$/, '')
      .split(':')
      .reduce((acc, part) => acc * 60 + Number(part), 0);
    expect(endSec).toBeLessThanOrEqual(6);
    expect(cues.srt).toContain('-->');
  });

  it('keeps the blanks in the language it was asked for', () => {
    const spanish = generateCueScaffold('tema', 10, 'Spanish');
    expect(spanish.segments[0].text).toMatch(/^\[/);
    expect(spanish.segments[0].text).toContain('tema');
    // An unknown language falls back to the English scaffold rather than inventing a translation.
    expect(generateCueScaffold('tema', 10, 'Klingon').segments[0].text).toContain('[');
  });
});
