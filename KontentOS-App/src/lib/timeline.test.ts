import { describe, expect, it } from 'vitest';
import {
  activeVideoClipAt,
  activeWordIndex,
  evaluateEasing,
  fmtTime,
  isVideoGapAt,
  parseSrtTimeToSeconds,
  recomputeDuration,
  sourceTimeAt,
  splitClipAt,
  synthesizeWords,
  totalDuration,
  type TextClip,
  type TimelineProject,
  type VideoClip,
} from '@/lib/timeline';

const audio = { pitchShiftCents: 0, volume: 1, fadeInSec: 0, fadeOutSec: 0 };

function videoClip(over: Partial<VideoClip> & { id: string; startOnTimeline: number; duration: number }): VideoClip {
  return {
    name: over.id,
    type: 'video',
    sourceStartOffset: 0,
    sourceFileId: 'src-1',
    speedMultiplier: 1,
    keyframes: [],
    audioModifiers: audio,
    ...over,
  };
}

function captionClip(over: Partial<TextClip> & { id: string; startOnTimeline: number; duration: number }): TextClip {
  return {
    name: over.id,
    type: 'text',
    sourceStartOffset: 0,
    content: 'hello world',
    style: {
      fontFamily: 'Inter',
      fontSize: 42,
      colorHex: '#ffffff',
      position: 'bottom',
      animation: 'karaoke',
    },
    ...over,
  };
}

function project(clips: VideoClip[], captions: TextClip[] = []): TimelineProject {
  const end = clips.reduce((m, c) => Math.max(m, c.startOnTimeline + c.duration), 0);
  return {
    schemaVersion: '1.0.0',
    projectMetadata: {
      id: 'p-1',
      title: 'fixture',
      targetAspectRatio: '9:16',
      width: 1080,
      height: 1920,
      frameRate: 30,
      totalDuration: end,
    },
    globalAudioTracks: { bgmVolume: 0, duckingEnabled: false },
    tracks: [
      { id: 'track-video', name: 'Video', type: 'video', isMuted: false, isLocked: false, zIndex: 0, clips },
      { id: 'track-text', name: 'Captions', type: 'text', isMuted: false, isLocked: false, zIndex: 5, clips: captions },
    ],
  };
}

describe('time formatting', () => {
  it('renders mm:ss.t and clamps nonsense input', () => {
    expect(fmtTime(0)).toBe('00:00.0');
    expect(fmtTime(75.34)).toBe('01:15.3');
    expect(fmtTime(-3)).toBe('00:00.0');
    expect(fmtTime(Number.NaN)).toBe('00:00.0');
  });

  it('parses SRT stamps with and without an hour, comma or dot', () => {
    expect(parseSrtTimeToSeconds('00:00:01,500')).toBe(1.5);
    expect(parseSrtTimeToSeconds('00:01:30.250')).toBe(90.25);
    expect(parseSrtTimeToSeconds('01:00:00,000')).toBe(3600);
    expect(parseSrtTimeToSeconds(12.5)).toBe(12.5);
    expect(parseSrtTimeToSeconds('')).toBe(0);
    expect(parseSrtTimeToSeconds('not a time')).toBe(0);
  });
});

describe('clip lookup on the timeline', () => {
  const two = [videoClip({ id: 'a', startOnTimeline: 0, duration: 4 }), videoClip({ id: 'b', startOnTimeline: 5, duration: 3 })];
  const p = project(two);

  it('finds the clip under a position and reports the gap between cuts', () => {
    expect(activeVideoClipAt(p, 0)?.id).toBe('a');
    expect(activeVideoClipAt(p, 3.999)?.id).toBe('a');
    expect(activeVideoClipAt(p, 4.5)).toBeNull();
    expect(isVideoGapAt(p, 4.5)).toBe(true);
    expect(isVideoGapAt(p, 6)).toBe(false);
    expect(activeVideoClipAt(p, 7.999)?.id).toBe('b');
  });

  it('treats a timeline with no clips as one continuous gap', () => {
    expect(isVideoGapAt(project([]), 0)).toBe(true);
  });

  it('drops duration to zero on the project only when asked to recompute', () => {
    const stale = project(two);
    stale.projectMetadata.totalDuration = 0;
    expect(totalDuration(stale)).toBe(0);
    recomputeDuration(stale);
    expect(totalDuration(stale)).toBe(8);
  });
});

describe('sourceTimeAt', () => {
  it('maps timeline position through the speed multiplier', () => {
    const p = project([videoClip({ id: 'a', startOnTimeline: 0, duration: 4, sourceStartOffset: 10, speedMultiplier: 2 })]);
    expect(sourceTimeAt(p, 0)).toBe(10);
    expect(sourceTimeAt(p, 1)).toBe(12);
    expect(sourceTimeAt(p, 2)).toBe(14);
  });

  it('holds the trailing frame of the preceding cut inside a gap', () => {
    const p = project([
      videoClip({ id: 'a', startOnTimeline: 0, duration: 2, sourceStartOffset: 0 }),
      videoClip({ id: 'b', startOnTimeline: 6, duration: 2, sourceStartOffset: 40 }),
    ]);
    expect(sourceTimeAt(p, 3)).toBe(2);
    expect(sourceTimeAt(p, 5.5)).toBe(2);
  });

  it('clamps past the end of the timeline instead of running off', () => {
    const p = project([videoClip({ id: 'a', startOnTimeline: 0, duration: 2, sourceStartOffset: 0 })]);
    expect(sourceTimeAt(p, 99)).toBe(2);
    expect(sourceTimeAt(project([]), 5)).toBe(0);
  });
});

describe('karaoke word highlighting', () => {
  const cue = captionClip({
    id: 'c1',
    startOnTimeline: 2,
    duration: 4,
    style: {
      fontFamily: 'Inter',
      fontSize: 42,
      colorHex: '#ffffff',
      position: 'bottom',
      animation: 'karaoke',
      words: [
        { word: 'one', start: 0.5, end: 1 },
        { word: 'two', start: 1.4, end: 2 },
      ],
    },
  });

  it('lights the spoken word, holds through micro-pauses and never fires early', () => {
    expect(activeWordIndex(cue, 2.7)).toBe(0);
    expect(activeWordIndex(cue, 3.2)).toBe(0); // pause between words holds the previous one
    expect(activeWordIndex(cue, 3.5)).toBe(1);
    expect(activeWordIndex(cue, 6)).toBe(1); // past the last word, hold it
    expect(activeWordIndex(cue, 2.2)).toBe(-1); // before speech starts
  });

  it('returns -1 for a cue with no transcript', () => {
    expect(activeWordIndex(captionClip({ id: 'c2', startOnTimeline: 0, duration: 1 }), 0.5)).toBe(-1);
  });
});

describe('easing curves', () => {
  it('clamps progress to [0,1] and keeps every curve end-anchored', () => {
    for (const easing of ['linear', 'easeIn', 'easeOut', 'easeInOut', 'cubicBezier'] as const) {
      expect(evaluateEasing(easing, -5)).toBe(0);
      expect(evaluateEasing(easing, 1)).toBe(1);
    }
    expect(evaluateEasing('instant', 0.999)).toBe(0);
    expect(evaluateEasing(undefined, 0.4)).toBeCloseTo(0.4);
    expect(evaluateEasing('easeIn', 0.5)).toBeLessThan(0.5);
    expect(evaluateEasing('easeOut', 0.5)).toBeGreaterThan(0.5);
  });
});

describe('synthesizeWords', () => {
  it('produces ascending, non-overlapping words inside the cue', () => {
    const words = synthesizeWords('KontentOS turns one raw clip into many posts.', 6);
    expect(words.length).toBe(8);
    expect(words[0].start).toBeGreaterThanOrEqual(0);
    expect(words[words.length - 1].end).toBeLessThanOrEqual(6);
    for (let i = 1; i < words.length; i++) {
      expect(words[i].start).toBeGreaterThanOrEqual(words[i - 1].start);
      expect(words[i].end).toBeGreaterThan(words[i].start);
    }
  });

  it('returns nothing for empty text or a zero-length cue', () => {
    expect(synthesizeWords('   ', 5)).toEqual([]);
    expect(synthesizeWords('hello', 0)).toEqual([]);
  });
});

describe('splitClipAt', () => {
  it('keeps source offsets and durations consistent across the two halves', () => {
    const p = project([videoClip({ id: 'a', startOnTimeline: 2, duration: 6, sourceStartOffset: 10 })]);
    const split = splitClipAt(p, 'a', 5);
    expect(split).not.toBeNull();
    const clips = split!.tracks[0].clips as VideoClip[];
    expect(clips.length).toBe(2);
    const [left, right] = clips;
    expect(left.duration).toBeCloseTo(3);
    expect(left.sourceStartOffset).toBe(10);
    expect(right.startOnTimeline).toBeCloseTo(5);
    expect(right.duration).toBeCloseTo(3);
    expect(right.sourceStartOffset).toBeCloseTo(13);
    expect(left.id).not.toBe(right.id);
    expect(totalDuration(recomputeDuration(split!))).toBeCloseTo(8);
  });

  it('refuses to split at or outside the clip edges', () => {
    const p = project([videoClip({ id: 'a', startOnTimeline: 2, duration: 6 })]);
    expect(splitClipAt(p, 'a', 2)).toBeNull();
    expect(splitClipAt(p, 'a', 8)).toBeNull();
    expect(splitClipAt(p, 'a', 20)).toBeNull();
    expect(splitClipAt(p, 'missing', 4)).toBeNull();
  });
});
