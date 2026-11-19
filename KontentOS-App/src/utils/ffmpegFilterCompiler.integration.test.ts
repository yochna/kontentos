import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileTimelineToFiltergraph } from './ffmpegFilterCompiler';
import type { TimelineProject } from '@/lib/timeline';

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).error === undefined;
const describeWithFfmpeg = hasFfmpeg ? describe : describe.skip;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'kontentos-export-'));

afterAll(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

function tinyProject(): TimelineProject {
  return {
    schemaVersion: '1.0.0',
    projectMetadata: {
      id: 'tiny', title: 'Tiny render', targetAspectRatio: '9:16',
      width: 216, height: 384, frameRate: 15, totalDuration: 1,
    },
    globalAudioTracks: { bgmVolume: 0.25, duckingEnabled: true },
    tracks: [
      {
        id: 'track-video', name: 'Primary Video', type: 'video',
        isMuted: false, isLocked: false, zIndex: 10,
        clips: [{
          id: 'v0', name: 'Clip', type: 'video',
          startOnTimeline: 0, duration: 1, sourceStartOffset: 0,
          sourceFileId: 'f0', sourceUrl: 'input.mp4', speedMultiplier: 1,
          keyframes: [],
          audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0, fadeOutSec: 0 },
        }],
      },
      {
        id: 'track-text', name: 'Kinetic Captions', type: 'text',
        isMuted: false, isLocked: false, zIndex: 30,
        clips: [{
          id: 'c0', name: 'Caption', type: 'text',
          startOnTimeline: 0, duration: 1, sourceStartOffset: 0,
          content: 'Hello world.',
          style: {
            fontFamily: 'sans-serif', fontSize: 60, colorHex: '#FFFFFF',
            activeWordColorHex: '#FFE066', strokeColorHex: '#000000',
            strokeWidth: 6, position: 'bottom', animation: 'karaoke',
            words: [
              { word: 'Hello', start: 0, end: 0.5 },
              { word: 'world.', start: 0.5, end: 1 },
            ],
          },
        }],
      },
    ],
  };
}

describeWithFfmpeg('compiled timeline rendering', () => {
  it('renders a tiny silent project with burn-in captions through a real ffmpeg', () => {
    const font = path.resolve(process.cwd(), 'public/fonts/font.ttf');
    expect(fs.existsSync(font)).toBe(true);
    fs.copyFileSync(font, path.join(scratch, 'font.ttf'));

    const source = spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=navy:s=320x240:d=1:r=15',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-y', 'input.mp4',
    ], { cwd: scratch, encoding: 'utf8' });
    expect(source.status, source.stderr).toBe(0);

    const compiled = compileTimelineToFiltergraph(tinyProject(), {
      width: 216,
      height: 384,
      fps: 15,
      sourceHasAudio: { 'input.mp4': false },
    });
    for (const file of compiled.captionFiles) {
      fs.writeFileSync(path.join(scratch, file.name), file.text, 'utf8');
    }

    const output = spawnSync('ffmpeg', [
      ...compiled.inputArgs,
      '-filter_complex', compiled.filterComplex,
      '-map', compiled.outputVideoLabel,
      '-map', compiled.outputAudioLabel,
      '-t', compiled.totalDuration.toFixed(3),
      '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '1',
      '-pix_fmt', 'yuv420p', '-crf', '28',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
      '-y', 'out.mp4',
    ], { cwd: scratch, encoding: 'utf8' });

    expect(output.status, output.stderr).toBe(0);
    expect(fs.statSync(path.join(scratch, 'out.mp4')).size).toBeGreaterThan(1000);
  });

  it('renders several cuts from one source at their timeline positions', () => {
    const source = spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=teal:s=320x240:d=1.5:r=15',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-y', 'multi.mp4',
    ], { cwd: scratch, encoding: 'utf8' });
    expect(source.status, source.stderr).toBe(0);

    const base = tinyProject();
    const clip = { ...base.tracks[0].clips[0], sourceUrl: 'multi.mp4' };
    const multi: TimelineProject = {
      ...base,
      projectMetadata: { ...base.projectMetadata, totalDuration: 1.25 },
      tracks: base.tracks.map((track) =>
        track.type === 'video'
          ? {
              ...track,
              clips: [
                { ...clip, id: 'a', duration: 0.5, sourceStartOffset: 0 },
                { ...clip, id: 'b', startOnTimeline: 0.75, duration: 0.5, sourceStartOffset: 0.8 },
              ],
            }
          : { ...track, clips: [] }
      ),
    };
    const compiled = compileTimelineToFiltergraph(multi, {
      width: 216, height: 384, fps: 15, sourceHasAudio: { 'multi.mp4': false },
    });
    const output = spawnSync('ffmpeg', [
      ...compiled.inputArgs,
      '-filter_complex', compiled.filterComplex,
      '-map', compiled.outputVideoLabel,
      '-map', compiled.outputAudioLabel,
      '-t', compiled.totalDuration.toFixed(3),
      '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '1',
      '-pix_fmt', 'yuv420p', '-crf', '28',
      '-c:a', 'aac', '-b:a', '128k',
      '-y', 'multi_out.mp4',
    ], { cwd: scratch, encoding: 'utf8' });

    expect(output.status, output.stderr).toBe(0);
    expect(fs.statSync(path.join(scratch, 'multi_out.mp4')).size).toBeGreaterThan(1000);
  });
});
