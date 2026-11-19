import { describe, expect, it } from 'vitest';
import { compileTimelineToFiltergraph } from './ffmpegFilterCompiler';
import type { TimelineProject, TextClip, VideoClip, SFXClip } from '@/lib/timeline';

function videoClip(overrides: Partial<VideoClip> = {}): VideoClip {
  return {
    id: 'video_0',
    name: 'Clip',
    type: 'video',
    startOnTimeline: 0,
    duration: 2,
    sourceStartOffset: 1,
    sourceFileId: 'file_1',
    sourceUrl: '/uploads/a.mp4',
    speedMultiplier: 1,
    keyframes: [{ timeOffset: 0.5, scale: 1.35, position: { x: 0, y: 0 }, easing: 'easeInOut' }],
    audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0, fadeOutSec: 0 },
    ...overrides,
  };
}

function caption(overrides: Partial<TextClip> = {}): TextClip {
  return {
    id: 'caption_0',
    name: 'Caption',
    type: 'text',
    startOnTimeline: 0.2,
    duration: 1.5,
    sourceStartOffset: 0,
    content: 'Make one thing well.',
    style: {
      fontFamily: 'system-ui',
      fontSize: 60,
      colorHex: '#FFFFFF',
      activeWordColorHex: '#FFE066',
      strokeColorHex: '#000000',
      strokeWidth: 6,
      bannerPillColorHex: 'rgba(0,0,0,0.56)',
      position: 'bottom',
      animation: 'karaoke',
      words: [
        { word: 'Make', start: 0, end: 0.3 },
        { word: 'one', start: 0.3, end: 0.6 },
        { word: 'thing', start: 0.6, end: 1.0 },
        { word: 'well.', start: 1.0, end: 1.4 },
      ],
    },
    ...overrides,
  };
}

function project(overrides: { clips?: VideoClip[]; captions?: TextClip[]; sfx?: SFXClip[]; bgm?: string } = {}): TimelineProject {
  return {
    schemaVersion: '1.0.0',
    projectMetadata: {
      id: 'project_1',
      title: 'Compiler test',
      targetAspectRatio: '9:16',
      width: 1080,
      height: 1920,
      frameRate: 30,
      totalDuration: 2,
    },
    globalAudioTracks: {
      backgroundMusicAssetId: overrides.bgm,
      bgmVolume: 0.25,
      duckingEnabled: true,
    },
    tracks: [
      {
        id: 'track-video', name: 'Primary Video', type: 'video',
        isMuted: false, isLocked: false, zIndex: 10,
        clips: overrides.clips ?? [videoClip()],
      },
      {
        id: 'track-text', name: 'Kinetic Captions', type: 'text',
        isMuted: false, isLocked: false, zIndex: 30,
        clips: overrides.captions ?? [caption()],
      },
      {
        id: 'track-sfx', name: 'SFX Overlays', type: 'sfx',
        isMuted: false, isLocked: false, zIndex: 20,
        clips: overrides.sfx ?? [],
      },
    ],
  };
}

describe('compileTimelineToFiltergraph', () => {
  it('uses crop-fill, caption files and word highlights instead of a letterboxed inline text graph', () => {
    const compiled = compileTimelineToFiltergraph(project(), {
      sourceHasAudio: { '/uploads/a.mp4': false },
    });

    expect(compiled.filterComplex).toContain('force_original_aspect_ratio=increase');
    expect(compiled.filterComplex).toContain('crop=1080:1920');
    expect(compiled.filterComplex).not.toContain('pad=');
    expect(compiled.hasCaptions).toBe(true);
    expect(compiled.requiredCaptionFiles.length).toBeGreaterThan(1);
    expect(compiled.filterComplex).toContain('fontfile=font.ttf');
    expect(compiled.filterComplex).toContain('textfile=cap_000_0.txt');
    expect(compiled.filterComplex).toContain('textfile=word_000_000.txt');
    expect(compiled.filterComplex).toContain('fontcolor=0xFFE066');
    expect(compiled.captionFiles.some((file) => file.text === 'thing')).toBe(true);
  });

  it('replaces a missing source audio stream with real silence in the graph', () => {
    const silent = compileTimelineToFiltergraph(project(), {
      sourceHasAudio: { '/uploads/a.mp4': false },
    });
    expect(silent.filterComplex).toContain('anullsrc=r=44100:cl=stereo');
    expect(silent.filterComplex).not.toContain('[0:a:0]');

    const withAudio = compileTimelineToFiltergraph(project(), {
      sourceHasAudio: { '/uploads/a.mp4': true },
    });
    expect(withAudio.filterComplex).toContain('[0:a:0]atrim=start=1.000');
  });

  it('keeps BGM and SFX inputs in sync with their filter indices', () => {
    const compiled = compileTimelineToFiltergraph(
      project({
        bgm: 'lofi',
        sfx: [{
          id: 'sfx_0', name: 'Pop', type: 'sfx', sfxAssetId: 'pop',
          startOnTimeline: 0.5, duration: 0.4, sourceStartOffset: 0,
          audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0, fadeOutSec: 0 },
        }],
      }),
      { sourceHasAudio: { '/uploads/a.mp4': false } }
    );

    expect(compiled.inputArgs).toEqual([
      '-i', 'input.mp4',
      '-i', 'bgm_lofi.wav',
      '-i', 'sfx_pop.wav',
    ]);
    expect(compiled.filterComplex).toContain('[1:a:0]aloop=');
    expect(compiled.filterComplex).toContain('[2:a:0]adelay=500:all=1');
  });

  it('surfaces captions the bundled font cannot draw instead of shipping empty boxes', () => {
    expect(() =>
      compileTimelineToFiltergraph(project({ captions: [caption({ content: 'नमस्ते दोस्तों', style: { ...caption().style, words: [] } })] }))
    ).toThrow(/font cannot draw/);
  });

  it('places segments at their timeline positions, including gaps', () => {
    const compiled = compileTimelineToFiltergraph(
      project({
        clips: [
          videoClip({ id: 'a', startOnTimeline: 0, duration: 0.5 }),
          videoClip({ id: 'b', startOnTimeline: 1, duration: 0.5, sourceStartOffset: 4 }),
        ],
        captions: [],
      }),
      { sourceHasAudio: { '/uploads/a.mp4': false } }
    );

    expect(compiled.filterComplex).toContain('d=0.500[v_gap_1]');
    expect(compiled.filterComplex).toContain('a_gap_1');
    expect(compiled.filterComplex).toContain('trim=start=4.000:duration=0.500');
    expect(compiled.filterComplex).toContain('concat=n=4:v=1:a=1');
  });
});
