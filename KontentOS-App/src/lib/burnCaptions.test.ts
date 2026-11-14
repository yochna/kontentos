import { describe, expect, it } from 'vitest';
import { buildCaptionBurn, canBurn, wrapWords } from './burnCaptions';

const cue = (start: number, end: number, text: string) => ({ start, end, text });

describe('canBurn', () => {
  it('accepts Latin text with accents and typographic punctuation', () => {
    expect(canBurn([cue(0, 2, 'Café “quotes” — it’s 3.5 hours, ok?')])).toBe(true);
  });

  it('refuses a track holding a script the bundled font cannot draw, and an empty track', () => {
    expect(canBurn([cue(0, 2, 'Hello'), cue(2, 4, 'नमस्ते दोस्तों')])).toBe(false);
    expect(canBurn([cue(0, 2, 'Hello 🎬')])).toBe(false);
    expect(canBurn([])).toBe(false);
  });
});

describe('wrapWords', () => {
  it('breaks at word boundaries inside the line width', () => {
    const lines = wrapWords('Stop hiding your work behind one boring line of text'.split(' '));
    expect(lines.every((line) => line.length <= 20)).toBe(true);
    expect(lines.join(' ')).toBe('Stop hiding your work behind one boring line of text');
  });

  it('leaves an over-long word whole rather than cutting it', () => {
    expect(wrapWords(['supercalifragilisticexpialidocious', 'ok'])).toEqual(['supercalifragilisticexpialidocious', 'ok']);
  });
});

describe('buildCaptionBurn', () => {
  it('draws each cue between its own times, reading its text from a file', () => {
    const plan = buildCaptionBurn([cue(0, 2.5, 'First line.'), cue(2.5, 5, 'Second line.')])!;
    expect(plan.files.map((f) => f.text)).toEqual(['First line.', 'Second line.']);
    expect(plan.filter).toContain("enable='between(t,0.000,2.500)'");
    expect(plan.filter).toContain("enable='between(t,2.500,5.000)'");
    expect(plan.filter).toContain('textfile=cap_000_0.txt');
    expect(plan.filter).toContain('textfile=cap_001_0.txt');
    // Text is never inlined into the filter, so a quote or colon in speech cannot break the graph.
    expect(plan.filter).not.toContain('First line');
    expect(plan.filter).toContain('expansion=none');
  });

  it('splits a long cue into timed pages without dropping a word', () => {
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`);
    const plan = buildCaptionBurn([cue(0, 12, words.join(' '))])!;
    expect(plan.pages).toBeGreaterThan(1);
    const spoken = plan.files.map((f) => f.text).join(' ');
    expect(spoken).toBe(words.join(' '));
    // No page stacks more than three lines.
    const perPage = new Map<string, number>();
    plan.files.forEach((f) => perPage.set(f.name.slice(0, 7), (perPage.get(f.name.slice(0, 7)) ?? 0) + 1));
    [...perPage.values()].forEach((n) => expect(n).toBeLessThanOrEqual(3));
  });

  it('keeps the pages inside the cue and in order', () => {
    const plan = buildCaptionBurn([cue(1, 9, Array.from({ length: 24 }, (_, i) => `w${i}`).join(' '))])!;
    // Each page's lines share one window, so a window repeats once per line: take each once.
    const windows = [...plan.filter.matchAll(/between\(t,([\d.]+),([\d.]+)\)/g)].map((m) => `${m[1]},${m[2]}`);
    const times = [...new Set(windows)].map((w) => w.split(',').map(Number));
    expect(times[0][0]).toBeCloseTo(1, 3);
    expect(times[times.length - 1][1]).toBeCloseTo(9, 3);
    times.forEach(([from, to], i) => {
      expect(to).toBeGreaterThan(from);
      if (i > 0) expect(from).toBeCloseTo(times[i - 1][1], 3);
    });
  });

  it('merges a flash of a cue into the page before it so a burst does not strobe', () => {
    const plan = buildCaptionBurn([cue(0, 2, 'Hold on'), cue(2, 2.3, 'now')])!;
    expect(plan.pages).toBe(1);
    expect(plan.files.map((f) => f.text)).toEqual(['Hold on', 'now']);
  });

  it('returns null when there is nothing honest to draw', () => {
    expect(buildCaptionBurn([])).toBeNull();
    expect(buildCaptionBurn([cue(0, 2, 'नमस्ते')])).toBeNull();
  });
});

describe('buildCaptionBurn merging', () => {
  it('never drops a spoken line to make a short page fit', () => {
    const long = Array.from({ length: 18 }, (_, i) => `longword${i}`).join(' ');
    const plan = buildCaptionBurn([cue(0, 6, long), cue(6.05, 6.4, 'tail end')])!;
    const spoken = plan.files.map((f) => f.text).join(' ');
    expect(spoken).toBe(`${long} tail end`);
  });
});

describe('wrapWords balance', () => {
  it('does not leave a lone word on the last line when the text can be split evenly', () => {
    expect(wrapWords('wrestling with code, and you'.split(' '))).toEqual(['wrestling with', 'code, and you']);
  });

  it('keeps the same number of lines as the plain wrap would use', () => {
    const words = 'Stop hiding your work behind one boring line of text'.split(' ');
    const lines = wrapWords(words);
    expect(lines.join(' ')).toBe(words.join(' '));
    const longest = Math.max(...lines.map((l) => l.length));
    const shortest = Math.min(...lines.map((l) => l.length));
    expect(longest - shortest).toBeLessThanOrEqual(8);
  });
});

describe('buildCaptionBurn centering', () => {
  it('draws each line on its own, centered on its own width, one line height below the last', () => {
    const plan = buildCaptionBurn([cue(0, 3, 'one two three four five six seven')])!;
    const nodes = plan.filter.split(',drawtext=').length;
    expect(nodes).toBe(plan.files.length);
    expect(plan.files.length).toBeGreaterThan(1);
    expect(plan.filter.match(/x=\(w-text_w\)\/2/g)).toHaveLength(plan.files.length);
    const ys = [...plan.filter.matchAll(/:y=(\d+):/g)].map((m) => Number(m[1]));
    ys.forEach((y, i) => i > 0 && expect(y - ys[i - 1]).toBe(94));
  });
});
