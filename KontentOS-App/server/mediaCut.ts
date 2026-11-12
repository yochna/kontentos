import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';

/**
 * Cutting a short on the server, so the file lands in the vault without a browser ever decoding the
 * source. The clip row carries the job: `processing` while the encode runs, `ready` with a real
 * `file_size` when it lands, `failed` with the partial file deleted when it does not. Nothing is
 * awaited inside the request, because a free-tier CPU takes longer than any proxy will wait.
 */

/** The same directory the /uploads gate already serves to the creator who owns the file. */
const uploadsDir = path.join(process.cwd(), 'uploads');

/** An encode still running after this is killed and the short is reported as failed. */
export const CUT_DEADLINE_MS = 10 * 60 * 1000;

/**
 * A longer span than this is not a short, and on the tenth of a core the free plan offers it would
 * outlast any viewer's patience. The browser cut has no such ceiling and stays available for it.
 */
export const MAX_SPAN_SECONDS = 120;

/** How many encodes one creator may have running at a time. */
export const MAX_CONCURRENT_CUTS = 2;

export interface Span {
  start: number;
  duration: number;
  /** The source ran out before the requested end, so the file will be shorter than the span. */
  shortOfSpan: boolean;
}

export type SpanPlan = { ok: true; span: Span } | { ok: false; reason: string };

/**
 * The same arithmetic the Studio applies before it loads a frame, applied to what the row actually
 * says: an unknown source length refuses rather than pretending, because ffmpeg would happily read
 * past the end and hand back a file that stops mid-sentence.
 */
export function planSpan(start: unknown, end: unknown, sourceSeconds: number | undefined): SpanPlan {
  const from = Number(start);
  const to = Number(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0) {
    return { ok: false, reason: 'This short has no timed span yet. Set one on the bench and try again.' };
  }
  if (to <= from) {
    return { ok: false, reason: `That span is ${to - from}s long — there is nothing between the two timecodes.` };
  }
  const known = Number.isFinite(Number(sourceSeconds)) && Number(sourceSeconds) > 0 ? Number(sourceSeconds) : 0;
  if (known && from >= known) {
    return {
      ok: false,
      reason: `The recording is only ${Math.round(known)}s long, and this span starts at ${Math.round(from)}s.`,
    };
  }
  const endAt = known ? Math.min(to, known) : to;
  const duration = endAt - from;
  if (duration > MAX_SPAN_SECONDS) {
    return {
      ok: false,
      reason: `That span is ${Math.round(duration)}s. The server cuts shorts up to ${MAX_SPAN_SECONDS}s — for a longer piece, cut it in your browser instead.`,
    };
  }
  return { ok: true, span: { start: from, duration, shortOfSpan: known > 0 && to > known } };
}

export function newClipId(): string {
  return `vid_${crypto.randomUUID()}`;
}

let cutEngine: boolean | null = null;

/**
 * Whether this machine can run the encode at all. Asking once and remembering is the point: an
 * image with no ffmpeg installed should refuse before it writes a clip row that can only end up
 * `failed`, and the answer cannot change while the process lives.
 */
export function hasCutEngine(): boolean {
  if (cutEngine === null) {
    try {
      cutEngine = spawnSync('ffmpeg', ['-version'], { timeout: 5000 }).status === 0;
    } catch {
      cutEngine = false;
    }
  }
  return cutEngine;
}

/** Only a test needs this — the probe would otherwise stick at whatever the first call saw. */
export function resetCutEngineProbe(): void {
  cutEngine = null;
}

export function clipPathOnDisk(fileUrl: string | undefined): string | null {
  if (!fileUrl || !fileUrl.startsWith('/uploads/')) return null;
  return path.join(uploadsDir, path.basename(fileUrl));
}

/**
 * Re-encoding, not stream-copying: `-c copy` can only begin on a keyframe, so the cut would open on
 * the previous thought. `ultrafast` is the cheapest preset that still keeps up with the deadline.
 */
export function cutArgs(span: Span, srcPath: string, outPath: string, filter?: string | null): string[] {
  return [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'error',
    '-progress',
    'pipe:1',
    '-ss',
    span.start.toFixed(3),
    '-i',
    srcPath,
    '-t',
    span.duration.toFixed(3),
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    ...(filter ? ['-vf', filter] : []),
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-avoid_negative_ts',
    'make_zero',
    '-y',
    outPath,
  ];
}

/** ffmpeg's `-progress` stream, read for the one number worth showing while an encode runs. */
export function progressFraction(chunk: string, duration: number): number | null {
  if (!(duration > 0)) return null;
  const micro = /out_time_us(?:|=)?=(\d+)/.exec(chunk) || /out_time_ms=(\d+)/.exec(chunk);
  if (!micro) return null;
  const seconds = Number(micro[1]) / 1_000_000;
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(0.99, seconds / duration);
}

export interface RunningCut {
  videoId: string;
  userId: string;
  startedAt: number;
  fraction: number;
  error: string;
}

const running = new Map<string, RunningCut>();

export function inFlight(videoId: string): RunningCut | null {
  return running.get(videoId) || null;
}

export function countFor(userId: string): number {
  let n = 0;
  for (const cut of running.values()) if (cut.userId === userId) n += 1;
  return n;
}

/**
 * Whether a row claiming to be mid-encode really is. The registry only ever holds processes this
 * container started, so a row still marked `processing` with no process behind it is what a restart
 * leaves behind — and the honest answer is that it failed, not that it might yet finish.
 */
export function reconcile(
  status: string,
  mediaAvailable: boolean
): { state: 'encoding' | 'ready' | 'failed'; reason?: string } {
  if (status === 'ready' && mediaAvailable) return { state: 'ready' };
  if (status === 'ready') return { state: 'failed', reason: 'The cut is recorded but its file is not on this server.' };
  if (status === 'failed') return { state: 'failed', reason: 'The server could not finish this cut.' };
  return { state: 'failed', reason: 'The studio restarted while this cut was running.' };
}

export interface BeginCutInput {
  videoId: string;
  userId: string;
  span: Span;
  srcPath: string;
  outPath: string;
  /** What ffmpeg does to every frame before encoding — see `cutFilter`. */
  filter?: string | null;
  /** Called when the encode is over, either way, with what the file ended up weighing. */
  settle: (outcome: { ok: true; bytes: number } | { ok: false; reason: string }) => void;
}

/**
 * Starts the encode and returns immediately. The child is killed at the deadline rather than left
 * to run: on a shared tenth of a core, one abandoned encode slows every other creator's work.
 */
export function beginCut(input: BeginCutInput): void {
  const entry: RunningCut = {
    videoId: input.videoId,
    userId: input.userId,
    startedAt: Date.now(),
    fraction: 0,
    error: '',
  };
  running.set(input.videoId, entry);

  let child: ReturnType<typeof spawn>;
  const finish = (outcome: { ok: true; bytes: number } | { ok: false; reason: string }) => {
    running.delete(input.videoId);
    input.settle(outcome);
  };
  const fail = (reason: string) => {
    try {
      fs.unlinkSync(input.outPath);
    } catch {
      /* no partial file to clear — the failure reason is the answer the creator needs */
    }
    finish({ ok: false, reason });
  };

  try {
    child = spawn('ffmpeg', cutArgs(input.span, input.srcPath, input.outPath, input.filter));
  } catch {
    fail('ffmpeg is not available on this server, so the cut could not be made here.');
    return;
  }

  let stderr = '';
  let stdoutTail = '';
  child.stdout?.on('data', (buf: Buffer) => {
    stdoutTail = (stdoutTail + buf.toString('utf8')).slice(-2000);
    const at = stdoutTail.lastIndexOf('\n');
    if (at > 0) stdoutTail = stdoutTail.slice(at);
    const fraction = progressFraction(stdoutTail, input.span.duration);
    if (fraction !== null) entry.fraction = Math.max(entry.fraction, fraction);
  });
  child.stderr?.on('data', (buf: Buffer) => {
    stderr = (stderr + buf.toString('utf8')).slice(-2000);
  });

  const deadline = setTimeout(() => {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone; the close handler settles it */
    }
  }, CUT_DEADLINE_MS);
  deadline.unref();

  let spawnFailed = false;
  child.on('error', () => {
    spawnFailed = true;
    clearTimeout(deadline);
    fail('ffmpeg is not available on this server, so the cut could not be made here.');
  });

  child.on('close', (code) => {
    clearTimeout(deadline);
    if (spawnFailed) return;
    if (code !== 0) {
      const detail = stderr.trim().split('\n').pop() || '';
      fail(`The cut stopped${code === null ? ' (killed: it ran past the time limit)' : ` with code ${code}`}${detail ? `: ${detail.slice(0, 200)}` : '.'}`);
      return;
    }
    fs.stat(input.outPath, (err, stat) => {
      if (err || !stat || stat.size === 0) {
        fail('ffmpeg finished but left no file.');
        return;
      }
      finish({ ok: true, bytes: stat.size });
    });
  });
}
