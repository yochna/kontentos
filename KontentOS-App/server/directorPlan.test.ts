import { describe, expect, it } from 'vitest';
import type { WordTimestamp, VideoClip, TextClip, SFXClip } from '../src/lib/timeline.js';
import {
  SYSTEM_PROMPT_DIRECTOR,
  buildDirectorUserPrompt,
  parseDirectorPlan,
  normalizeDirectorPlan,
  compileDirectorPlan,
  type DirectorPlan,
} from './directorPlan.js';

const words: WordTimestamp[] = [
  { word: 'Stop', start: 0.5, end: 0.8 },
  { word: 'scrolling', start: 0.8, end: 1.2 },
  { word: 'This', start: 2.0, end: 2.2 },
  { word: 'is', start: 2.2, end: 2.3 },
  { word: 'the', start: 2.3, end: 2.45 },
  { word: 'trick', start: 2.45, end: 2.9 },
  { word: 'nobody', start: 3.5, end: 3.9 },
  { word: 'tells', start: 3.9, end: 4.1 },
  { word: 'you', start: 4.1, end: 4.3 },
];

const metadata = {
  id: 'vid_1',
  title: 'A raw take',
  duration: 5,
  width: 1080,
  height: 1920,
  targetAspectRatio: '9:16' as const,
  sourceUrl: '/uploads/vid_1.mp4',
};

function plan(overrides: Partial<DirectorPlan> = {}): DirectorPlan {
  return {
    version: 1,
    rationale: 'Open on the late promise, then explain it.',
    hook: [6, 8],
    keep: [
      [0, 1],
      [3, 5],
    ],
    punch: [5, 6],
    sfx: [{ wordIndex: 0, asset: 'pop' }],
    captionGroups: [
      [6, 8],
      [0, 1],
      [3, 5],
    ],
    pace: 'balanced',
    bgmVolume: 0.3,
    ...overrides,
  };
}

describe('director plan', () => {
  it('asks the model for word indices, not a timestamp-heavy EDL', () => {
    expect(SYSTEM_PROMPT_DIRECTOR).toMatch(/word index/i);
    expect(SYSTEM_PROMPT_DIRECTOR).not.toContain('sourceStartOffset');
    const prompt = JSON.parse(buildDirectorUserPrompt(words, metadata));
    expect(prompt.transcript[0]).toBe('[0] "Stop" 0.50-0.80');
    expect(prompt.clip.wordCount).toBe(9);
  });

  it('parses a fenced model answer and rejects prose', () => {
    const fenced = `Here is the plan:\n\`\`\`json\n${JSON.stringify(plan())}\n\`\`\``;
    expect(parseDirectorPlan(fenced)?.rationale).toContain('late promise');
    expect(parseDirectorPlan('I cannot edit video')).toBeNull();
  });

  it('moves a late hook to the front and keeps source offsets exact', () => {
    const normalized = normalizeDirectorPlan(plan(), words.length)!;
    expect(normalized.ranges).toEqual([
      [6, 8],
      [0, 1],
      [3, 5],
    ]);

    const project = compileDirectorPlan(normalized, metadata, words);
    const video = project.tracks.find((t) => t.type === 'video')!.clips as VideoClip[];
    expect(video.map((c) => c.sourceStartOffset)).toEqual([3.43, 0.43, 2.13]);
    expect(video.map((c) => c.startOnTimeline)).toEqual([0, 0.94, 1.78]);
    expect(project.projectMetadata.totalDuration).toBeCloseTo(2.62, 2);
    expect(video.every((c) => c.sourceUrl === metadata.sourceUrl)).toBe(true);
  });

  it('splits a kept sentence around a late hook instead of dropping the rest', () => {
    const normalized = normalizeDirectorPlan(
      plan({ hook: [4, 5], keep: [[0, 8]], captionGroups: [] }),
      words.length
    )!;
    expect(normalized.ranges).toEqual([
      [4, 5],
      [0, 3],
      [6, 8],
    ]);
  });

  it('rejects a caption group that would span across a cut', () => {
    const normalized = normalizeDirectorPlan(
      plan({ hook: [4, 5], keep: [[0, 8]], captionGroups: [[3, 6]] }),
      words.length
    )!;
    expect(normalized.captionGroups).toEqual([]);
  });

  it('burns only the creator’s words, in playback order', () => {
    const normalized = normalizeDirectorPlan(plan(), words.length)!;
    const project = compileDirectorPlan(normalized, metadata, words);
    const text = project.tracks.find((t) => t.type === 'text')!.clips as TextClip[];
    expect(text.map((c) => c.content)).toEqual([
      'Nobody tells you',
      'Stop scrolling',
      'Is the trick',
    ]);
    // A caption starts on the word itself, not on the padded edge of its video clip.
    expect(text.map((c) => c.startOnTimeline)).toEqual([0.07, 1.01, 1.85]);
    for (const clip of text) {
      expect(clip.content).not.toMatch(/New take|script field|placeholder/i);
    }
  });

  it('places punches and sound on the exact word that earned them', () => {
    const normalized = normalizeDirectorPlan(plan(), words.length)!;
    const project = compileDirectorPlan(normalized, metadata, words);
    const video = project.tracks.find((t) => t.type === 'video')!.clips as VideoClip[];
    const punches = video.flatMap((c) => c.keyframes);
    expect(punches.filter((k) => k.scale > 1.1)).toHaveLength(2);

    const sfx = project.tracks.find((t) => t.type === 'sfx')!.clips as SFXClip[];
    expect(sfx).toHaveLength(1);
    expect(sfx[0].sfxAssetId).toBe('pop');
    expect(sfx[0].startOnTimeline).toBeCloseTo(1.01, 2);
  });

  it('clamps nonsense indices and rejects an empty plan', () => {
    const broken = normalizeDirectorPlan(
      plan({
        hook: [99, 500],
        keep: [[-5, 2]],
        punch: [999, 2],
        sfx: [{ wordIndex: 999, asset: 'pop' }],
      }),
      words.length
    )!;
    expect(broken.ranges).toEqual([[8, 8], [0, 2]]);
    expect(broken.punch).toEqual([2]);
    expect(broken.sfx).toEqual([]);
    expect(normalizeDirectorPlan(plan({ hook: [99, 100], keep: [], punch: [], sfx: [] }), 0)).toBeNull();
  });

  it('derives readable captions when the model groups them badly', () => {
    const normalized = normalizeDirectorPlan(plan({ captionGroups: [[0, 8]] }), words.length)!;
    expect(normalized.captionGroups).toEqual([]);
    const project = compileDirectorPlan(normalized, metadata, words);
    const text = project.tracks.find((t) => t.type === 'text')!.clips as TextClip[];
    expect(text.length).toBeGreaterThan(1);
    expect(text.every((c) => c.content.split(/\s+/).length <= 5)).toBe(true);
  });
});
