/**
 * Browser-side span cut.
 *
 * The Studio writes words, not pictures, so until now a short it proposed could only be re-made by
 * hand on the bench. This module closes that loop: it pulls the creator's own source bytes out of
 * /uploads and runs the ffmpeg worker with an input seek so only the requested span is decoded.
 * Nothing is uploaded anywhere — the cut happens in this tab and the file is handed back as a Blob.
 *
 * It sits on this side of the app because two engines now need it: the Studio's Cut screen and the
 * Press, which has to put a file in the vault before it can call the result a reel. Encoding there
 * rather than on the server is a deliberate trade — a shared free-tier core takes minutes over a
 * 30s span, this tab takes seconds and reports real progress.
 */

import { cutFilter } from './frameFit';

/** A source larger than this cannot be read into a browser tab's memory and reported on honestly. */
export const MAX_CUT_SOURCE_BYTES = 400 * 1024 * 1024;

const WORKER_GUARD_MS = 150_000; // the worker kills its own ffmpeg run at 120 s; this is the backstop

export interface CutProgress {
  stage: 'reading' | 'preparing' | 'encoding' | 'finalizing' | 'done';
  /** 0..1 where known. Null when ffmpeg has not reported a ratio yet. */
  fraction: number | null;
  message: string;
}

export interface CutRequest {
  /** /uploads/<file> path from the clip's own record. */
  fileUrl: string;
  /** Declared size in bytes; probed with a HEAD when unknown or missing. */
  fileSize?: number;
  /** Seconds of film actually in the source, when the record knows. Zero or absent means unknown. */
  sourceSeconds?: number;
  start: number;
  duration: number;
  /**
   * The shape the cut should come out in, e.g. '9:16'. The filter chain is derived from this and the
   * source's own aspect rather than taken from the caller: what reaches ffmpeg has to be one of the
   * two chains in `frameFit`, not a string some screen assembled.
   */
  targetAspect?: string;
  /** The source's aspect_ratio, when its record knows it. */
  sourceAspect?: string;
}

export interface CutResult {
  blob: Blob;
  byteLength: number;
}

/** What has to be true before a span can be cut here, in the creator's terms. */
export type CutBlocker =
  | { code: 'media_offline'; message: string }
  | { code: 'too_large'; message: string }
  | { code: 'bad_span'; message: string }
  | { code: 'span_past_source'; message: string };

/**
 * A clip's requested span, fitted to the film that actually exists.
 *
 * Spans are timed from transcript cues, and a cue track does not know how long the uploaded file
 * turned out to be — so a 45s span can sit on a 12s recording. Rather than promise frames that are
 * not there, the cut runs to the end of the real film and says it was shortened. A source length of
 * zero means the record does not know, in which case the span is taken at face value.
 */
export function resolveSpan(
  start: number,
  end: number,
  sourceSeconds: number
): { start: number; endAt: number; duration: number; shortOfSpan: boolean } {
  const from = Math.max(0, Number.isFinite(start) ? start : 0);
  const known = Number.isFinite(sourceSeconds) && sourceSeconds > 0;
  const endAt = known ? Math.min(end, sourceSeconds) : end;
  return {
    start: from,
    endAt,
    duration: endAt - from,
    shortOfSpan: known && end > sourceSeconds,
  };
}

class CutError extends Error {}

// Upload records may default to 9:16 without ever measuring the frame.
export function probeFrameAspect(fileUrl: string): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const finish = (aspect: string | null) => {
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      resolve(aspect);
    };
    const timer = setTimeout(() => finish(null), 8000);
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      finish(w > 0 && h > 0 ? `${w}:${h}` : null);
    };
    video.onerror = () => finish(null);
    video.src = fileUrl;
  });
}

let worker: Worker | null = null;
let workerReady: Promise<void> | null = null;

type Listener = (data: any) => void;
const listeners = new Set<Listener>();

function ensureWorker(): { worker: Worker; ready: Promise<void> } {
  if (!worker) {
    const created = new Worker(new URL('../workers/ffmpeg.worker.ts', import.meta.url), {
      type: 'module',
    });
    created.onmessage = (event: MessageEvent) => {
      for (const fn of listeners) fn(event.data);
    };
    created.onerror = (event) => {
      const message = event.message || 'The ffmpeg worker could not start in this browser.';
      for (const fn of listeners) fn({ type: 'WORKER_FATAL', error: message });
    };
    worker = created;
    workerReady = new Promise<void>((resolve, reject) => {
      const off: Listener = (data) => {
        if (data?.type === 'INIT_SUCCESS') {
          listeners.delete(off);
          resolve();
        } else if (data?.type === 'INIT_ERROR' || data?.type === 'WORKER_FATAL') {
          listeners.delete(off);
          reject(new Error(data.error || 'The ffmpeg engine could not be loaded in this browser.'));
        }
      };
      listeners.add(off);
      created.postMessage({ type: 'INIT' });
    }).catch((err) => {
      // A core that failed to load must not stay cached: drop the worker so the next attempt
      // re-loads instead of replaying the same failure forever.
      teardown();
      throw err;
    });
  }
  return { worker: worker!, ready: workerReady! };
}

function teardown() {
  worker?.terminate();
  worker = null;
  workerReady = null;
  listeners.clear();
}

/**
 * Whether this short could be cut here at all, and what to say when it cannot. `cutSpan` runs it
 * before reading a byte, so a caller never has to trust its own arithmetic about the source.
 */
export async function checkCut(req: CutRequest): Promise<CutBlocker | null> {
  if (!Number.isFinite(req.start) || !Number.isFinite(req.duration) || req.duration <= 0) {
    return { code: 'bad_span', message: 'This short has no usable timecode span yet.' };
  }
  // A span can sit past the end of the film it was written against: the cues that timed it come
  // from a transcript, and a transcript does not know how long the file turned out to be.
  if (req.sourceSeconds && req.sourceSeconds > 0 && req.start >= req.sourceSeconds) {
    return {
      code: 'span_past_source',
      message: `That span starts at ${Math.round(req.start)}s, but the source only runs for ${Math.round(req.sourceSeconds)}s — there is no film there to cut.`,
    };
  }
  let size = req.fileSize && req.fileSize > 0 ? req.fileSize : 0;
  if (!size) {
    try {
      const head = await fetch(req.fileUrl, { method: 'HEAD', credentials: 'same-origin' });
      if (!head.ok) return { code: 'media_offline', message: 'The source file is not on this server any more.' };
      size = Number(head.headers.get('content-length')) || 0;
    } catch {
      return { code: 'media_offline', message: 'The source file could not be reached.' };
    }
  }
  if (size > MAX_CUT_SOURCE_BYTES) {
    return {
      code: 'too_large',
      message: `The source is ${Math.round(size / (1024 * 1024))} MB — a browser cut reads it whole, so clips above ${Math.round(MAX_CUT_SOURCE_BYTES / (1024 * 1024))} MB are trimmed on the bench instead.`,
    };
  }
  return null;
}

export async function cutSpan(
  req: CutRequest,
  onProgress: (p: CutProgress) => void,
  signal?: AbortSignal
): Promise<CutResult> {
  const blocked = await checkCut(req);
  if (blocked) throw new CutError(blocked.message);
  signal?.throwIfAborted();

  onProgress({ stage: 'reading', fraction: null, message: 'Reading your source…' });
  // Only a vertical target needs to know the source's shape, and the read runs alongside the full
  // fetch below rather than in front of it.
  const aspectProbe = req.targetAspect === '9:16' ? probeFrameAspect(req.fileUrl) : Promise.resolve(null);
  const res = await fetch(req.fileUrl, { credentials: 'same-origin', signal });
  if (!res.ok) {
    throw new CutError(
      res.status === 401 || res.status === 403
        ? 'That source is not on your account, so it cannot be cut here.'
        : 'The source file is not on this server any more.'
    );
  }
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_CUT_SOURCE_BYTES) {
    throw new CutError(
      `The source turned out to be ${Math.round(buffer.byteLength / (1024 * 1024))} MB, past the ${Math.round(MAX_CUT_SOURCE_BYTES / (1024 * 1024))} MB a browser cut can hold.`
    );
  }

  signal?.throwIfAborted();
  const { worker: w, ready } = ensureWorker();
  const id = `cut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return new Promise<CutResult>((resolve, reject) => {
    let settled = false;
    const guard = setTimeout(() => fail('The browser cut stopped answering. Try a shorter span.'), WORKER_GUARD_MS);

    const cleanup = () => {
      clearTimeout(guard);
      listeners.delete(onMessage);
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    const succeed = (result: CutResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      teardown();
      reject(new CutError(message));
    };
    const onAbort = () => fail('The cut was cancelled.');

    const onMessage: Listener = (data) => {
      if (!data || (data.id && data.id !== id)) return;
      switch (data.type) {
        case 'PROGRESS':
          onProgress({ stage: 'encoding', fraction: clampFraction(data.progress), message: 'Encoding your cut…' });
          break;
        case 'EXPORT_PROGRESS': {
          const stage: CutProgress['stage'] =
            data.stage === 'preparing_assets'
              ? 'preparing'
              : data.stage === 'encoding'
                ? 'encoding'
                : data.stage === 'finalizing'
                  ? 'finalizing'
                  : 'done';
          onProgress({ stage, fraction: clampFraction(data.progress), message: data.message || 'Working…' });
          break;
        }
        case 'CUT_SUCCESS':
          onProgress({ stage: 'done', fraction: 1, message: 'Cut finished.' });
          succeed({
            blob: new Blob([data.buffer], { type: 'video/mp4' }),
            byteLength: Number(data.byteLength) || 0,
          });
          break;
        case 'CUT_ERROR':
          fail(data.error || 'The browser cut could not be completed.');
          break;
        case 'WORKER_FATAL':
          fail(data.error || 'The ffmpeg engine stopped in this browser.');
          break;
        default:
          break;
      }
    };

    listeners.add(onMessage);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    ready
      .then(async () => {
        if (settled) return;
        // Unknown pixels still need the vertical filter; the stored aspect may only be a default.
        const sourceAspect = (await aspectProbe) || undefined;
        if (settled) return;
        onProgress({ stage: 'preparing', fraction: 0.05, message: 'Loading the cut bench…' });
        w.postMessage(
          {
            type: 'CUT_SPAN',
            id,
            buffer,
            inputFileName: 'input.mp4',
            start: req.start,
            duration: req.duration,
            filter: cutFilter(req.targetAspect, sourceAspect) ?? undefined,
          },
          [buffer]
        );
      })
      .catch((err: Error) => fail(err.message || 'The ffmpeg engine could not be loaded in this browser.'));
  });
}

function clampFraction(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}
