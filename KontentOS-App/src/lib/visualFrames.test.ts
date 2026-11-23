import { describe, expect, it } from 'vitest';
import {
  brightnessOf,
  changeBetween,
  lumaFingerprint,
  salientVisualBeats,
  visualSampleTimes,
  type VisualFrame,
} from './visualFrames';

const frame = (timeSec: number, changeScore = 0, brightness = 0.5): VisualFrame => ({
  timeSec,
  changeScore,
  brightness,
  dataUrl: 'data:image/jpeg;base64,AAAA',
});

describe('visualSampleTimes', () => {
  it('samples inside the take in ascending order', () => {
    const times = visualSampleTimes(10, 5);
    expect(times).toHaveLength(5);
    expect(times[0]).toBeGreaterThan(0);
    expect(times[times.length - 1]).toBeLessThan(10);
    for (let index = 1; index < times.length; index += 1) {
      expect(times[index]).toBeGreaterThan(times[index - 1]);
    }
  });

  it('handles missing duration without NaN', () => {
    const times = visualSampleTimes(0, 3);
    expect(times.every(Number.isFinite)).toBe(true);
  });
});

describe('frame signals', () => {
  it('computes luma, brightness and change', () => {
    const dark = new Uint8ClampedArray([0, 0, 0, 255, 20, 20, 20, 255]);
    const light = new Uint8ClampedArray([200, 200, 200, 255, 220, 220, 220, 255]);
    const darkFingerprint = lumaFingerprint(dark);
    const lightFingerprint = lumaFingerprint(light);
    expect(brightnessOf(darkFingerprint)).toBeCloseTo(0.04, 2);
    expect(brightnessOf(lightFingerprint)).toBeGreaterThan(0.75);
    expect(changeBetween(darkFingerprint, lightFingerprint)).toBeGreaterThan(0.5);
    expect(changeBetween(undefined, lightFingerprint)).toBe(0);
  });
});

describe('salientVisualBeats', () => {
  it('keeps the opening frame and the strongest separated changes', () => {
    const frames = [
      frame(0.5),
      frame(1.5, 0.02),
      frame(2.5, 0.42),
      frame(3.5, 0.41),
      frame(4.5, 0.05),
      frame(5.5, 0.31),
    ];
    expect(salientVisualBeats(frames, 3)).toEqual([frames[0], frames[2], frames[5]]);
  });
});
