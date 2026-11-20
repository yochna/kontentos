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

function sfxClip(overrides: Partial<SFXClip> = {}): SFXClip {
  return {
    id: 'sfx_0',
    name: 'Pop',
    type: 'sfx',
    sfxAssetId: 'pop',
    startOnTimeline: 0.5,
    duration: 0.4,
    sourceStartOffset: 0,
    audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0, fadeOutSec: 0 },
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
    // Clean captions are outlined text, not a black bar; and the anchor matches the preview's
    // bottom-anchored overlay rather than the old fixed-height guess.
    expect(compiled.filterComplex).not.toContain('box=1');
    expect(compiled.filterComplex).toContain('y=1566');
  });

  it('keeps the box only for the solid-pill caption preset', () => {
    const base = caption();
    const pill = compileTimelineToFiltergraph(
      project({
        captions: [
          caption({
            style: {
              ...base.style,
              animation: 'bannerPill',
              bannerPillColorHex: 'rgba(12, 34, 56, 0.56)',
            },
          }),
        ],
      }),
      { sourceHasAudio: { '/uploads/a.mp4': false } }
    );

    expect(pill.filterComplex).toContain('box=1');
    expect(pill.filterComplex).toContain('boxcolor=0x0c2238@0.56');
    expect(pill.filterComplex).toContain('boxborderw=');
  });

  it('keeps each caption’s own size, colour and position in the burn-in', () => {
    const base = caption();
    const compiled = compileTimelineToFiltergraph(
      project({
        captions: [
          caption({ id: 'caption_a', startOnTimeline: 0.2, duration: 0.8 }),
          caption({
            id: 'caption_b',
            startOnTimeline: 1.1,
            duration: 0.8,
            content: 'A different line.',
            style: {
              ...base.style,
              fontSize: 40,
              colorHex: '#00FF00',
              position: 'top',
              words: [],
            },
          }),
        ],
      }),
      { sourceHasAudio: { '/uploads/a.mp4': false } }
    );

    expect(compiled.filterComplex).toContain('fontsize=60');
    expect(compiled.filterComplex).toContain('fontsize=40');
    expect(compiled.filterComplex).toContain('fontcolor=0xFFFFFF');
    expect(compiled.filterComplex).toContain('fontcolor=0x00FF00');
    // The second cue is top-anchored, so it must not inherit the first cue's 1566px bottom line.
    expect(compiled.filterComplex).toContain('y=317');
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

  it('uses one input per SFX asset even when that sound fires repeatedly', () => {
    const compiled = compileTimelineToFiltergraph(
      project({
        captions: [],
        sfx: [
          sfxClip({ id: 'sfx_0', startOnTimeline: 0.5 }),
          sfxClip({ id: 'sfx_1', startOnTimeline: 1.2 }),
          sfxClip({ id: 'sfx_2', sfxAssetId: 'whoosh', startOnTimeline: 0.8 }),
        ],
      }),
      { sourceHasAudio: { '/uploads/a.mp4': false } }
    );

    expect(compiled.requiredSfxFiles).toEqual(['sfx_pop.wav', 'sfx_whoosh.wav']);
    expect(compiled.inputArgs).toEqual([
      '-i', 'input.mp4',
      '-i', 'sfx_pop.wav',
      '-i', 'sfx_whoosh.wav',
    ]);
    expect(compiled.filterComplex).toContain('[1:a:0]adelay=500:all=1');
    expect(compiled.filterComplex).toContain('[1:a:0]adelay=1200:all=1');
    expect(compiled.filterComplex).toContain('[2:a:0]adelay=800:all=1');
  });

  it('fades real source audio in and out from the clip modifier values', () => {
    const compiled = compileTimelineToFiltergraph(
      project({
        captions: [],
        clips: [
          videoClip({
            audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0.25, fadeOutSec: 0.4 },
          }),
        ],
      }),
      { sourceHasAudio: { '/uploads/a.mp4': true } }
    );

    expect(compiled.filterComplex).toContain('afade=t=in:st=0:d=0.250');
    expect(compiled.filterComplex).toContain('afade=t=out:st=1.600:d=0.400');

    const silent = compileTimelineToFiltergraph(
      project({
        captions: [],
        clips: [
          videoClip({
            audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0.25, fadeOutSec: 0.4 },
          }),
        ],
      }),
      { sourceHasAudio: { '/uploads/a.mp4': false } }
    );
    expect(silent.filterComplex).not.toContain('afade=');
  });

  it('surfaces captions the bundled font cannot draw instead of shipping empty boxes', () => {
    expect(() =>
      compileTimelineToFiltergraph(project({ captions: [caption({ content: 'नमस्ते दोस्तों', style: { ...caption().style, words: [] } })] }))
    ).toThrow(/no readable text/);
  });

  it('strips emoji decoration from generated captions and keeps the readable words', () => {
    const compiled = compileTimelineToFiltergraph(
      project({
        captions: [
          caption({
            content: '🚨 Ship it 🔥 1️⃣ today',
            style: {
              ...caption().style,
              words: [
                { word: '🚨 Ship', start: 0, end: 0.5 },
                { word: 'it', start: 0.5, end: 0.8 },
                { word: '🔥 1️⃣ today', start: 0.8, end: 1.4 },
              ],
            },
          }),
        ],
      }),
      { sourceHasAudio: { '/uploads/a.mp4': false } }
    );

    expect(compiled.hasCaptions).toBe(true);
    const burned = compiled.captionFiles.map((file) => file.text).join(' ');
    expect(burned).toContain('Ship it');
    expect(burned).toContain('1 today');
    expect(burned).not.toMatch(/[\u{1F000}-\u{1FAFF}]/u);
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
