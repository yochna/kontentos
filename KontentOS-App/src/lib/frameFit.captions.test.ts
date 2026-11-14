import { describe, expect, it } from 'vitest';
import { buildCaptionBurn } from './burnCaptions';
import { captionedCutFilter, cutFilter } from './frameFit';

describe('captionedCutFilter', () => {
  it('always runs the full vertical chain for a 9:16 target, even from a source that is already vertical', () => {
    // The plain cut skips the chain for a source that already fills the frame...
    expect(cutFilter('9:16', '9:16')).toBeNull();
    // ...but burned-in text is sized for 1080 × 1920, so the captioned cut never does.
    expect(captionedCutFilter('9:16')).toContain('scale=1080:1920');
    expect(captionedCutFilter('9:16')).toContain('crop=1080:1920');
  });

  it('has no captioned layout for any other shape', () => {
    expect(captionedCutFilter('1:1')).toBeNull();
    expect(captionedCutFilter(undefined)).toBeNull();
  });

  it('joins with the drawtext chain into one comma-separated -vf string that stays inside the frame', () => {
    const burn = buildCaptionBurn([{ start: 0, end: 3, text: 'Film once. Publish everywhere.' }])!;
    const vf = `${captionedCutFilter('9:16')},${burn.filter}`;
    expect(vf.startsWith('scale=iw*sar:ih')).toBe(true);
    expect(vf).toContain(',drawtext=fontfile=font.ttf:');
    // Every y sits in the lower part of the 1920-px frame, with room under the last line.
    const ys = [...vf.matchAll(/:y=(\d+):/g)].map((m) => Number(m[1]));
    expect(ys.length).toBeGreaterThan(0);
    ys.forEach((y) => {
      expect(y).toBeGreaterThan(1920 * 0.6);
      expect(y + 94).toBeLessThan(1920 * 0.9);
    });
  });
});
