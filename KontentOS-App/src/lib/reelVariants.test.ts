import { describe, expect, it } from 'vitest';
import { buildReelVariants } from './reelVariants';
import { compileTimelineToFiltergraph } from '../utils/ffmpegFilterCompiler';
import { getPreset, sfxClips, textClips, videoClips, type TimelineProject } from './timeline';
import type { AutoEditStats } from './api';

const base: TimelineProject = {
  schemaVersion: '1.0.0',
  projectMetadata: {
    id: 'proj_1',
    title: 'A raw take',
    targetAspectRatio: '9:16',
    width: 1080,
    height: 1920,
    frameRate: 30,
    visualLook: 'viral',
    totalDuration: 2.4,
  },
  globalAudioTracks: { bgmVolume: 0, duckingEnabled: false },
  tracks: [
    {
      id: 'track-text',
      name: 'Captions',
      type: 'text',
      isMuted: false,
      isLocked: false,
      zIndex: 30,
      clips: [
        {
          id: 'text_1',
          name: 'Cue 1',
          type: 'text',
          content: 'Here is the trick',
          startOnTimeline: 0.2,
          duration: 1.6,
          sourceStartOffset: 0,
          style: {
            fontFamily: 'system-ui',
            fontSize: 64,
            colorHex: '#FFFFFF',
            activeWordColorHex: '#FFE066',
            strokeColorHex: '#000000',
            strokeWidth: 6,
            shadowColorHex: 'rgba(0,0,0,0.9)',
            position: 'bottom',
            animation: 'bouncePop',
            words: [{ word: 'Here', start: 0, end: 0.4 }],
          },
        },
      ],
    },
    {
      id: 'track-sfx',
      name: 'Accents',
      type: 'sfx',
      isMuted: false,
      isLocked: false,
      zIndex: 20,
      clips: [
        {
          id: 'sfx_1',
          name: 'Pop Sound',
          type: 'sfx',
          sfxAssetId: 'pop',
          startOnTimeline: 0.4,
          duration: 0.4,
          sourceStartOffset: 0,
          audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0, fadeOutSec: 0.1 },
        },
      ],
    },
    {
      id: 'track-video',
      name: 'Primary Video',
      type: 'video',
      isMuted: false,
      isLocked: false,
      zIndex: 10,
      clips: [
        {
          id: 'video_1',
          name: 'Raw 1',
          type: 'video',
          sourceFileId: 'vid_1',
          sourceUrl: '/uploads/a.mp4',
          speedMultiplier: 1,
          startOnTimeline: 0,
          duration: 1.2,
          sourceStartOffset: 0,
          keyframes: [
            { timeOffset: 0, scale: 1, position: { x: 0, y: 0 }, easing: 'linear' },
            { timeOffset: 0.4, scale: 1.32, position: { x: 0, y: -0.04 }, easing: 'easeInOut' },
            { timeOffset: 1.2, scale: 1, position: { x: 0, y: 0 }, easing: 'easeOut' },
          ],
          audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0, fadeOutSec: 0 },
        },
        {
          id: 'video_2',
          name: 'Raw 2',
          type: 'video',
          sourceFileId: 'vid_1',
          sourceUrl: '/uploads/a.mp4',
          speedMultiplier: 1,
          startOnTimeline: 1.2,
          duration: 1.2,
          sourceStartOffset: 2,
          keyframes: [],
          audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0, fadeOutSec: 0 },
        },
      ],
    },
  ],
};

const sourceStats: AutoEditStats = {
  originalDurationSec: 3.2,
  trimmedDurationSec: 2.4,
  silenceRemovedSec: 0.8,
  cutsCount: 2,
  punchZoomsCount: 1,
  sfxCount: 1,
  captionsCount: 1,
};

describe('reel variants', () => {
  it('produces three genuinely different edits from one base project', () => {
    const variants = buildReelVariants(base, sourceStats, getPreset('punchy'));
    expect(variants.map((v) => v.id)).toEqual(['your-pick', 'clean-story', 'rapid-remix']);

    const baseCuts = videoClips(base).length;
    const clean = variants[1];
    const rapid = variants[2];
    expect(videoClips(clean.project).length).toBeLessThan(baseCuts);
    expect(videoClips(rapid.project).length).toBeGreaterThan(baseCuts);
    expect(clean.project.projectMetadata.visualLook).toBe('clean');
    expect(rapid.project.projectMetadata.visualLook).toBe('bold');
    expect(sfxClips(clean.project)).toHaveLength(0);
    expect(sfxClips(rapid.project).length).toBeGreaterThan(sfxClips(base).length);
  });

  it('keeps captions and total duration intact so every option exports in sync', () => {
    const variants = buildReelVariants(base, sourceStats, getPreset('punchy'));
    for (const variant of variants) {
      expect(textClips(variant.project).map((c) => [c.content, c.startOnTimeline, c.duration])).toEqual([
        ['Here is the trick', 0.2, 1.6],
      ]);
      expect(textClips(variant.project)[0].style.words).toEqual([{ word: 'Here', start: 0, end: 0.4 }]);
      expect(variant.project.projectMetadata.totalDuration).toBe(2.4);
      expect(variant.stats.cutsCount).toBe(videoClips(variant.project).length);
    }
  });

  it('gives the rapid option a visible punch on every snapped beat', () => {
    const rapid = buildReelVariants(base, sourceStats, getPreset('punchy'))[2];
    const clips = videoClips(rapid.project);
    expect(clips.every((clip) => clip.keyframes.some((k) => k.scale > 1.25))).toBe(true);
    expect(rapid.stats.punchZoomsCount).toBeGreaterThan(sourceStats.punchZoomsCount);
  });

  it('compiles every option into an exportable FFmpeg filtergraph', () => {
    const variants = buildReelVariants(base, sourceStats, getPreset('punchy'));
    for (const variant of variants) {
      const compiled = compileTimelineToFiltergraph(variant.project, {
        sourceHasAudio: { '/uploads/a.mp4': false },
      });
      expect(compiled.outputVideoLabel).toBe('[vout]');
      expect(compiled.filterComplex).toContain('concat=n=');
      expect(compiled.filterComplex.length).toBeGreaterThan(200);
    }
  });

  it('does not mutate the original project', () => {
    const before = JSON.stringify(base);
    buildReelVariants(base, sourceStats, getPreset('punchy'));
    expect(JSON.stringify(base)).toBe(before);
  });
});
