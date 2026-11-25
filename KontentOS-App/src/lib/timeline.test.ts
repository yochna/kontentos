import { describe, expect, it } from 'vitest';
import {
  activeCaptionAt,
  activeVideoClipAt,
  activeWordIndex,
  applyPresetLook,
  buildCaptionsFromSegments,
  buildLocalProject,
  buildManualProject,
  evaluateEasing,
  fmtTime,
  isVideoGapAt,
  moveClip,
  parseSrtTimeToSeconds,
  PRESETS,
  recomputeDuration,
  setClipTiming,
  sourceTimeAt,
  splitClipAt,
  synthesizeWords,
  totalDuration,
  trimClipEdge,
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

describe('caption timing controls', () => {
  const first = captionClip({
    id: 'cap-1',
    startOnTimeline: 1,
    duration: 1,
    style: {
      fontFamily: 'Inter',
      fontSize: 42,
      colorHex: '#ffffff',
      position: 'bottom',
      animation: 'karaoke',
      words: [
        { word: 'one', start: 0, end: 0.5 },
        { word: 'two', start: 0.5, end: 1 },
      ],
    },
  });
  const second = captionClip({ id: 'cap-2', startOnTimeline: 2, duration: 1 });
  const video = [videoClip({ id: 'v', startOnTimeline: 0, duration: 4 })];
  const p = project(video, [first, second]);

  const captionById = (value: TimelineProject, id: string) =>
    value.tracks.find((track) => track.type === 'text')!.clips.find((clip) => clip.id === id)!;

  it('moves a caption freely across adjacent cues', () => {
    const moved = moveClip(p, 'cap-1', 2.2)!;
    expect(captionById(moved, 'cap-1').startOnTimeline).toBe(2.2);
    expect(captionById(moved, 'cap-2').startOnTimeline).toBe(2);
  });

  it('sets start and length directly and rescales word highlighting', () => {
    const next = setClipTiming(p, 'cap-1', { start: 1.5, duration: 2 })!;
    const moved = captionById(next, 'cap-1') as TextClip;
    expect(moved.startOnTimeline).toBe(1.5);
    expect(moved.duration).toBe(2);
    expect(moved.style.words?.[0]).toMatchObject({ start: 0, end: 1 });
    expect(moved.style.words?.[1]).toMatchObject({ start: 1, end: 2 });
  });

  it('refuses timing changes on a locked caption track', () => {
    const locked = project(video, [first, second]);
    locked.tracks.find((track) => track.type === 'text')!.isLocked = true;
    expect(setClipTiming(locked, 'cap-1', { duration: 2 })).toBeNull();
    expect(moveClip(locked, 'cap-1', 3)).toBeNull();
  });

  it('extends a caption when the right trim handle is dragged outward', () => {
    const next = trimClipEdge(p, 'cap-1', 'end', 2.5)!;
    const extended = captionById(next, 'cap-1') as TextClip;
    expect(extended.duration).toBe(1.5);
    expect(extended.content).toBe('hello world');
    expect(extended.style.words).toHaveLength(2);
  });

  it('extends a caption leftward without moving its word beats', () => {
    const next = trimClipEdge(p, 'cap-1', 'start', 0.5)!;
    const extended = captionById(next, 'cap-1') as TextClip;
    expect(extended.startOnTimeline).toBe(0.5);
    expect(extended.duration).toBe(1.5);
    expect(extended.content).toBe('hello world');
    expect(extended.style.words?.[0]).toMatchObject({ start: 0.5, end: 1 });
    expect(extended.style.words?.[1]).toMatchObject({ start: 1, end: 1.5 });
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

describe('caption readability', () => {
  it('keeps spoken phrases intact and preserves sentence case', () => {
    const cues = buildCaptionsFromSegments([
      { start: 0, end: 2.4, text: 'Stop scrolling. Here is the real reason.' },
    ]);
    expect(cues.map((c) => c.content)).toEqual([
      'Stop scrolling.',
      'Here is the real reason.',
    ]);
    expect(cues[0].style.fontSize).toBeGreaterThanOrEqual(60);
    expect(cues[0].style.position).toBe('bottom');
    expect(cues[0].style.words?.length).toBe(2);
  });

  it('does not let a preset discard word timings', () => {
    const words = [
      { word: 'Hello', start: 0, end: 0.4 },
      { word: 'world', start: 0.4, end: 0.9 },
    ];
    const cue = captionClip({
      id: 'cue',
      startOnTimeline: 0,
      duration: 1,
      style: {
        fontFamily: 'Inter',
        fontSize: 30,
        colorHex: '#fff',
        position: 'middle',
        animation: 'none',
        words,
      },
    });
    const preset = PRESETS.find((p) => p.id === 'punchy')!;
    const styled = (applyPresetLook(project([], [cue]), preset).tracks[1].clips as TextClip[])[0];
    expect(styled.style.fontSize).toBe(preset.caption.fontSize);
    expect(styled.style.position).toBe('bottom');
    expect(styled.style.words).toEqual(words);
  });

  it('hides captions from the export path when the text track is muted', () => {
    const cue = captionClip({ id: 'cue', startOnTimeline: 0, duration: 2 });
    const p = project([], [cue]);
    expect(activeCaptionAt(p, 0.5)?.id).toBe('cue');
    p.tracks[1].isMuted = true;
    expect(activeCaptionAt(p, 0.5)).toBeNull();
  });
});

describe('buildLocalProject without a transcript', () => {
  it('builds an honest visual cut and never turns a filename into spoken captions', () => {
    const p = buildLocalProject(
      {
        id: 'vid_1',
        title: 'kontentos_finished_reel_1795112524099',
        file_url: '/uploads/vid_1.mp4',
        duration: 6.4,
      },
      [],
      PRESETS[0]
    );
    const video = p.tracks.find((t) => t.type === 'video')!.clips as VideoClip[];
    const textTrack = p.tracks.find((t) => t.type === 'text')!;
    const text = textTrack.clips as TextClip[];

    expect(video.length).toBeGreaterThan(1);
    expect(video.every((clip) => clip.keyframes && clip.keyframes.length > 0)).toBe(true);
    expect(video[0].sourceStartOffset).toBeGreaterThan(0);
    expect(textTrack.name).toBe('On-Screen Text');
    expect(text.length).toBeGreaterThan(1);
    expect(text.map((clip) => clip.content).join(' ')).not.toMatch(
      /kontentos_finished_reel|vid_1|\.mp4/i
    );
    expect(p.projectMetadata.visualLook).toBe('viral');
    // Individual clips are rounded before the project end is computed, so allow one frame of drift.
    expect(p.projectMetadata.totalDuration).toBeCloseTo(
      video.reduce((sum, clip) => sum + clip.duration, 0),
      1
    );
  });

  it('builds a truly untouched manual project for the do-it-myself path', () => {
    const p = buildManualProject(
      { id: 'vid_1', title: 'My raw take', file_url: '/uploads/vid_1.mp4', duration: 7.3 },
      '9:16'
    );
    const video = p.tracks.find((t) => t.type === 'video')!.clips as VideoClip[];
    const text = p.tracks.find((t) => t.type === 'text')!.clips;
    const sfx = p.tracks.find((t) => t.type === 'sfx')!.clips;

    expect(video).toHaveLength(1);
    expect(video[0]).toMatchObject({
      sourceFileId: 'vid_1',
      sourceUrl: '/uploads/vid_1.mp4',
      startOnTimeline: 0,
      duration: 7.3,
      sourceStartOffset: 0,
      speedMultiplier: 1,
      keyframes: [],
    });
    expect(text).toHaveLength(0);
    expect(sfx).toHaveLength(0);
    expect(p.projectMetadata.visualLook).toBe('original');
    expect(p.projectMetadata.totalDuration).toBe(7.3);
  });
});
