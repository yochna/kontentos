import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_SPAN_SECONDS,
  beginCut,
  clipPathOnDisk,
  cutArgs,
  hasCutEngine,
  inFlight,
  planSpan,
  progressFraction,
  reconcile,
  resetCutEngineProbe,
} from './mediaCut.js';
import { cutFilter, parseAspect } from '../src/lib/frameFit.js';

/** The image build runs this suite on a base node image with no ffmpeg — those cases skip, they do not fail. */
function tool(name: string): boolean {
  try {
    return spawnSync(name, ['-version'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}
const hasFfmpeg = tool('ffmpeg');
const hasFfprobe = tool('ffprobe');

const secondsOf = (file: string): number => {
  const out = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
    encoding: 'utf8',
  });
  return Number((out.stdout || '').trim());
};

/** The frame the file actually holds, as "widthxheight". */
const dimsOf = (file: string): string => {
  const out = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', file],
    { encoding: 'utf8' }
  );
  return (out.stdout || '').trim();
};

describe('planning a span', () => {
  it('keeps a span that fits inside the recording', () => {
    const planned = planSpan(67.5, 112.5, 120);
    expect(planned).toEqual({ ok: true, span: { start: 67.5, duration: 45, shortOfSpan: false } });
  });

  it('clamps a span that runs past the end and says the file will be shorter', () => {
    const planned = planSpan(5, 40, 12);
    expect(planned.ok).toBe(true);
    if (planned.ok) expect(planned.span).toEqual({ start: 5, duration: 7, shortOfSpan: true });
  });

  it('refuses a span that starts after the film runs out, naming the length', () => {
    const planned = planSpan(200, 240, 12);
    expect(planned.ok).toBe(false);
    if (!planned.ok) expect(planned.reason).toMatch(/only 12s long/);
  });

  it('refuses an untimed span instead of cutting the whole take', () => {
    expect(planSpan('—', '—', 120).ok).toBe(false);
    expect(planSpan(NaN, 10, 120).ok).toBe(false);
    expect(planSpan(10, 10, 120).ok).toBe(false);
    expect(planSpan(10, 4, 120).ok).toBe(false);
  });

  it(`refuses a span longer than the ${MAX_SPAN_SECONDS}s the server will encode`, () => {
    const planned = planSpan(0, 300, 600);
    expect(planned.ok).toBe(false);
    if (!planned.ok) expect(planned.reason).toMatch(/browser/i);
  });

  it('trusts the requested end when the recording has no known length', () => {
    const planned = planSpan(0, 60, 0);
    expect(planned.ok).toBe(true);
    if (planned.ok) expect(planned.span.shortOfSpan).toBe(false);
  });
});

describe('the ffmpeg command', () => {
  const args = cutArgs({ start: 67.5, duration: 45, shortOfSpan: false }, '/uploads/a.mp4', '/uploads/b.mp4');

  it('seeks before the input so the decode never walks the whole take', () => {
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(args[args.indexOf('-ss') + 1]).toBe('67.500');
    expect(args[args.indexOf('-t') + 1]).toBe('45.000');
  });

  it('re-encodes, because a stream copy can only begin on a keyframe', () => {
    expect(args).toContain('libx264');
    expect(args).not.toContain('copy');
  });

  it('leaves the audio map optional so a silent take still cuts', () => {
    expect(args).toContain('0:v:0');
    expect(args[args.lastIndexOf('-map') + 1]).toBe('0:a:0?');
  });

  it('writes the output last, over an existing partial', () => {
    expect(args.slice(-2)).toEqual(['-y', '/uploads/b.mp4']);
  });

  it('only inserts the filter when one is asked for', () => {
    expect(args).not.toContain('-vf');
    const framed = cutArgs({ start: 0, duration: 5, shortOfSpan: false }, '/uploads/a.mp4', '/uploads/b.mp4', 'crop=1080:1920');
    expect(framed[framed.indexOf('-vf') + 1]).toBe('crop=1080:1920');
    expect(framed.slice(-2)).toEqual(['-y', '/uploads/b.mp4']);
  });
});

describe('the frame a reel is cut into', () => {
  it('reads the shapes the vault records', () => {
    expect(parseAspect('9:16')).toBeCloseTo(9 / 16, 6);
    expect(parseAspect('16:9')).toBeCloseTo(16 / 9, 6);
    expect(parseAspect('1.7778')).toBeCloseTo(1.7778, 6);
    expect(parseAspect('square')).toBe(0);
  });

  it('crops a wide take to vertical and leaves a vertical one alone', () => {
    expect(cutFilter('9:16', '16:9')).toMatch(/crop=1080:1920/);
    expect(cutFilter('9:16', undefined)).toMatch(/crop=1080:1920/);
    expect(cutFilter('9:16', '9:16')).toBeNull();
    expect(cutFilter('9:16', '1.7778')).toMatch(/crop=1080:1920/);
    // A reel is vertical by definition; no other target rewrites the frame.
    expect(cutFilter('1:1', '16:9')).toBeNull();
    expect(cutFilter(undefined, '16:9')).toBeNull();
  });

  it('ends on a fixed even crop, so no source shape can produce an odd frame', () => {
    const chain = cutFilter('9:16', '4:3')!;
    expect(chain.split(',').slice(-2)).toEqual(['crop=1080:1920', 'setsar=1']);
  });
});

describe('reading an encode back', () => {
  it('takes the fraction from ffmpeg’s progress line', () => {
    expect(progressFraction('out_time_us=1500000\n', 3)).toBe(0.5);
    expect(progressFraction('out_time_us=9000000\n', 3)).toBe(0.99);
    expect(progressFraction('frame=12\n', 3)).toBeNull();
    expect(progressFraction('out_time_us=1000000\n', 0)).toBeNull();
  });

  it('calls a recorded file whose bytes are gone a failure, not a ready clip', () => {
    expect(reconcile('ready', true)).toEqual({ state: 'ready' });
    expect(reconcile('ready', false).state).toBe('failed');
    expect(reconcile('processing', false).reason).toMatch(/restarted/i);
    expect(reconcile('failed', true).reason).toMatch(/could not finish/i);
  });

  it('only ever reads a file out of the uploads directory', () => {
    expect(clipPathOnDisk('/uploads/vid_x.mp4')).toBe(path.join(process.cwd(), 'uploads', 'vid_x.mp4'));
    expect(clipPathOnDisk('https://cdn.example/vid_x.mp4')).toBeNull();
    expect(clipPathOnDisk('/uploads/../server.ts')).toBe(path.join(process.cwd(), 'uploads', 'server.ts'));
    expect(clipPathOnDisk('')).toBeNull();
  });
});

describe('the cut engine this machine has', () => {
  it('agrees with what is installed, and re-checks after a reset', () => {
    const realPath = process.env.PATH;
    try {
      resetCutEngineProbe();
      expect(hasCutEngine()).toBe(hasFfmpeg);
      // The answer is cached, so a machine that has it keeps having it.
      process.env.PATH = '';
      expect(hasCutEngine()).toBe(hasFfmpeg);
      resetCutEngineProbe();
      expect(hasCutEngine()).toBe(false);
    } finally {
      process.env.PATH = realPath;
      resetCutEngineProbe();
    }
  });
});

describe.skipIf(!hasFfmpeg)('cutting a real file', () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kt-cut-')), 'media');
  const src = path.join(dir, 'source.mp4');
  const out = path.join(dir, 'short.mp4');

  beforeAll(() => {
    fs.mkdirSync(dir, { recursive: true });
    const make = spawnSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=10:size=320x240:rate=25',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=10',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        src,
      ],
      { encoding: 'utf8' }
    );
    expect(make.status).toBe(0);
  }, 120_000);

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes the span as its own file and reports the bytes', async () => {
    const settled = await new Promise<{ ok: boolean; bytes?: number; reason?: string }>((resolve) => {
      beginCut({
        videoId: 'vid_media_test',
        userId: 'user_media_test',
        span: { start: 3, duration: 2, shortOfSpan: false },
        srcPath: src,
        outPath: out,
        settle: (outcome) => resolve(outcome.ok ? { ok: true, bytes: outcome.bytes } : { ok: false, reason: outcome.reason }),
      });
    });

    expect(settled.ok).toBe(true);
    expect(settled.bytes!).toBeGreaterThan(0);
    expect(inFlight('vid_media_test')).toBeNull();
    if (hasFfprobe) {
      const seconds = secondsOf(out);
      expect(Math.abs(seconds - 2)).toBeLessThan(0.35);
    }
  }, 120_000);

  it('fills a 4:3 take with a vertical reel instead of refusing it', async () => {
    const vertical = path.join(dir, 'vertical.mp4');
    const settled = await new Promise<{ ok: boolean; reason?: string }>((resolve) => {
      beginCut({
        videoId: 'vid_media_vertical',
        userId: 'user_media_test',
        span: { start: 1, duration: 2, shortOfSpan: false },
        srcPath: src,
        outPath: vertical,
        filter: cutFilter('9:16', '4:3'),
        settle: (outcome) => resolve(outcome.ok ? { ok: true } : { ok: false, reason: outcome.reason }),
      });
    });

    expect(settled.ok).toBe(true);
    if (hasFfprobe) expect(dimsOf(vertical)).toBe('1080x1920');
  }, 120_000);

  it.skipIf(!hasFfprobe).each([
    { sar: '2/1', label: '2:1', boxWidth: 40 },
    { sar: '1/2', label: '1:2', boxWidth: 160 },
  ])('preserves picture proportions when cutting a $label anamorphic take', ({ sar, label, boxWidth }) => {
    const anamorphic = path.join(dir, `anamorphic-${boxWidth}.mp4`);
    const vertical = path.join(dir, `anamorphic-${boxWidth}-vertical.mp4`);
    // A display-square marker exposes stretched pixels even when the output SAR says 1:1.
    const make = spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=1:d=1',
      '-vf', `drawbox=x=(iw-${boxWidth})/2:y=80:w=${boxWidth}:h=80:color=white:t=fill,setsar=${sar}`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', anamorphic,
    ], { encoding: 'utf8' });
    expect(make.status, make.stderr).toBe(0);

    const encode = spawnSync('ffmpeg', cutArgs(
      { start: 0, duration: 1, shortOfSpan: false }, anamorphic, vertical, cutFilter('9:16', undefined)
    ), { encoding: 'utf8' });
    expect(encode.status, encode.stderr).toBe(0);
    expect(dimsOf(anamorphic)).toBe('320x240');
    expect(dimsOf(vertical)).toBe('1080x1920');
    for (const [file, expectedSar] of [[anamorphic, label], [vertical, '1:1']]) {
      const probe = spawnSync('ffprobe', [
        '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=sample_aspect_ratio',
        '-of', 'csv=p=0', file,
      ], { encoding: 'utf8' });
      expect(probe.status, probe.stderr).toBe(0);
      expect(probe.stdout.trim()).toBe(expectedSar);
    }

    const frame = spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-i', vertical,
      '-frames:v', '1', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1',
    ], { maxBuffer: 1080 * 1920 * 2 });
    expect(frame.status, frame.stderr.toString()).toBe(0);
    expect(frame.stdout.length).toBe(1080 * 1920);
    let pictureWidth = 0;
    let pictureHeight = 0;
    for (let x = 0; x < 1080; x++) if (frame.stdout[960 * 1080 + x] > 128) pictureWidth++;
    for (let y = 0; y < 1920; y++) if (frame.stdout[y * 1080 + 540] > 128) pictureHeight++;
    expect(Math.abs(pictureWidth - 640)).toBeLessThanOrEqual(2);
    expect(Math.abs(pictureHeight - 640)).toBeLessThanOrEqual(2);
    expect(Math.abs(pictureWidth / pictureHeight - 1)).toBeLessThan(0.01);
  }, 120_000);

  it('clears the partial file and says why when the source is unreadable', async () => {
    const missingOut = path.join(dir, 'never.mp4');
    const settled = await new Promise<{ ok: boolean; reason?: string }>((resolve) => {
      beginCut({
        videoId: 'vid_media_missing',
        userId: 'user_media_test',
        span: { start: 0, duration: 2, shortOfSpan: false },
        srcPath: path.join(dir, 'not-here.mp4'),
        outPath: missingOut,
        settle: (outcome) => resolve(outcome.ok ? { ok: true } : { ok: false, reason: outcome.reason }),
      });
    });

    expect(settled.ok).toBe(false);
    expect(settled.reason).toMatch(/code|finished but left no file/i);
    expect(fs.existsSync(missingOut)).toBe(false);
    expect(inFlight('vid_media_missing')).toBeNull();
  }, 120_000);
});
