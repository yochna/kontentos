/**
 * Browser-side frame-accurate timeline export.
 *
 * The editor's EDL is the source of truth. This module reads the creator's own source bytes and
 * hands the timeline to the FFmpeg worker, which addresses every frame by its timecode. It never
 * plays a video element in real time and never uploads the film to another service.
 */

import type { TimelineProject } from './timeline';
import { compileTimelineToFiltergraph } from '@/utils/ffmpegFilterCompiler';
import { mergeStageProgress } from './progress';
import { isAbortFailure, readBoundedResponse } from './sourcePreflight';

/** A browser tab cannot honestly hold more than this much source for one render. */
const MAX_SOURCE_BYTES = 400 * 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 600 * 1024 * 1024;
/** No answer for this long means the WASM engine is stalled, not merely slow. */
const WORKER_GUARD_MS = 90_000;
/** A hard ceiling so a stream of progress from a runaway job cannot hold the tab forever. */
const EXPORT_HARD_LIMIT_MS = 10 * 60_000;
const PROGRESS_ORDER: TimelineExportProgress['stage'][] = [
  'reading',
  'preparing',
  'encoding',
  'finalizing',
  'done',
];

export interface TimelineExportRequest {
  project: TimelineProject;
  /** Used only when the EDL has no explicit sourceUrl (older/manual projects). */
  defaultSourceUrl?: string;
  width: number;
  height: number;
  fps: number;
  /** libx264 CRF; high quality is 20, balanced is 23. */
  crf?: number;
}

export interface TimelineExportProgress {
  stage: 'reading' | 'preparing' | 'encoding' | 'finalizing' | 'done';
  /** 0..1 where known. Null while FFmpeg has not reported a ratio yet. */
  fraction: number | null;
  message: string;
}

export interface TimelineExportResult {
  blob: Blob;
  byteLength: number;
  captionsBurned: boolean;
  engine: 'ffmpeg-timeline';
}

export class TimelineExportError extends Error {
  /** Last FFmpeg log lines, when the worker managed to report them. */
  diagnostics: string[];

  constructor(message: string, diagnostics: string[] = []) {
    super(message);
    this.name = 'TimelineExportError';
    this.diagnostics = diagnostics;
  }
}

/**
 * A source could not be read over HTTP. The status is kept so the dialog can offer the right repair:
 * a 404 means the timeline points at a clip that is no longer in this creator's library, which is a
 * different problem from a render engine failure and must not be described as one.
 */
export class SourceUnavailableError extends TimelineExportError {
  constructor(
    message: string,
    readonly status: number,
    readonly sourceUrl: string
  ) {
    super(message);
    this.name = 'SourceUnavailableError';
  }
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
      for (const listener of listeners) listener(event.data);
    };
    created.onerror = (event) => {
      const message = event.message || 'The render engine could not start in this browser.';
      for (const listener of listeners) listener({ type: 'WORKER_FATAL', error: message });
    };
    worker = created;
    workerReady = new Promise<void>((resolve, reject) => {
      const onReady: Listener = (data) => {
        if (data?.type === 'INIT_SUCCESS') {
          listeners.delete(onReady);
          resolve();
        } else if (data?.type === 'INIT_ERROR' || data?.type === 'WORKER_FATAL') {
          listeners.delete(onReady);
          reject(new Error(data.error || 'The render engine could not be loaded in this browser.'));
        }
      };
      listeners.add(onReady);
      created.postMessage({ type: 'INIT' });
    }).catch((error: Error) => {
      teardown();
      throw error;
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

async function fetchSourceBytes(sourceUrl: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const urls = [sourceUrl];
  if (/^https?:\/\//i.test(sourceUrl)) {
    urls.push(`/api/proxy-media?url=${encodeURIComponent(sourceUrl)}`);
  }

  let lastError: unknown;
  for (const url of urls) {
    try {
      const response = await fetch(url, { credentials: 'same-origin', signal });
      if (!response.ok) {
        // The signed media gate deliberately answers 404 for "not your clip" as well as "gone", so
        // neither the server nor this message should claim to know which one it was. Both are fixed
        // by pointing the timeline at a clip that is in the creator's current library.
        if (response.status === 404) {
          throw new SourceUnavailableError(
            'This cut points to a clip that is no longer in your library. Re-attach a clip to render it.',
            404,
            sourceUrl
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new SourceUnavailableError(
            'That source is not on your account, so it cannot be rendered here.',
            response.status,
            sourceUrl
          );
        }
        throw new SourceUnavailableError(
          `The server could not deliver this source right now (${response.status}). Try again in a moment.`,
          response.status,
          sourceUrl
        );
      }
      return await readBoundedResponse(response, MAX_SOURCE_BYTES, 'A source', signal);
    } catch (error) {
      if (isAbortFailure(error, signal)) throw new TimelineExportError('The render was cancelled.');
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new TimelineExportError('The source video could not be read.');
}

function clampFraction(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

/**
 * Reads the plan and its sources, then renders the EDL frame by frame. An FFmpeg failure is thrown
 * with its real message; callers may offer a fallback but nothing is downgraded in silence.
 */
export async function exportTimeline(
  req: TimelineExportRequest,
  onProgress: (progress: TimelineExportProgress) => void,
  signal?: AbortSignal
): Promise<TimelineExportResult> {
  if (signal?.aborted) throw new TimelineExportError('The render was cancelled.');

  // Compile once here to learn which files must be fetched. The worker compiles again after it has
  // probed audio, because a silent source changes the graph. Both calls get identical geometry.
  const planned = compileTimelineToFiltergraph(req.project, {
    width: req.width,
    height: req.height,
    fps: req.fps,
  });
  const files = planned.requiredVideoFiles.map((file) => ({
    ...file,
    sourceUrl:
      !req.defaultSourceUrl || file.sourceUrl !== file.fileName
        ? file.sourceUrl
        : req.defaultSourceUrl,
  }));
  if (files.some((file) => !file.sourceUrl)) {
    throw new TimelineExportError('No readable source is attached to this timeline.');
  }

  const sourceBuffers: Array<{ fileName: string; sourceUrl: string; buffer: ArrayBuffer }> = [];
  let totalBytes = 0;
  for (let index = 0; index < files.length; index++) {
    signal?.throwIfAborted();
    const file = files[index];
    onProgress({
      stage: 'reading',
      fraction: (index / files.length) * 0.05,
      message: `Reading source ${index + 1} of ${files.length}…`,
    });
    const buffer = await fetchSourceBytes(file.sourceUrl, signal);
    if (buffer.byteLength > MAX_SOURCE_BYTES) {
      throw new TimelineExportError(
        `A source is ${Math.round(buffer.byteLength / (1024 * 1024))} MB — browser rendering can hold at most ${Math.round(MAX_SOURCE_BYTES / (1024 * 1024))} MB per file.`
      );
    }
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_TOTAL_SOURCE_BYTES) {
      throw new TimelineExportError(
        `This timeline's sources total ${Math.round(totalBytes / (1024 * 1024))} MB, past the ${Math.round(MAX_TOTAL_SOURCE_BYTES / (1024 * 1024))} MB a browser render can hold.`
      );
    }
    sourceBuffers.push({ fileName: file.fileName, sourceUrl: file.sourceUrl, buffer });
  }
  if (signal?.aborted) throw new TimelineExportError('The render was cancelled.');

  const { worker: w, ready } = ensureWorker();
  const id = `timeline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return new Promise<TimelineExportResult>((resolve, reject) => {
    let settled = false;
    const diagnostics: string[] = [];
    const remember = (line: unknown) => {
      if (typeof line !== 'string' || !line.trim()) return;
      diagnostics.push(line.trim());
      if (diagnostics.length > 40) diagnostics.shift();
    };
    let lastProgress: TimelineExportProgress = {
      stage: 'reading',
      fraction: 0.05,
      message: 'Preparing frame-accurate render…',
    };
    const report = (update: TimelineExportProgress) => {
      lastProgress = mergeStageProgress(lastProgress, update, PROGRESS_ORDER);
      onProgress(lastProgress);
    };
    let guard: ReturnType<typeof setTimeout> | null = null;
    let hardLimit: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (guard) clearTimeout(guard);
      if (hardLimit) clearTimeout(hardLimit);
      listeners.delete(onMessage);
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    const succeed = (result: TimelineExportResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const fail = (message: string, options?: { terminate?: boolean }) => {
      if (settled) return;
      settled = true;
      cleanup();
      // A normal FFmpeg error leaves a clean, loaded worker behind, so a retry does not reload the
      // 32 MB core. A crash or abort must terminate it because pending WASM work cannot be recalled.
      if (options?.terminate) teardown();
      reject(new TimelineExportError(message, diagnostics.slice(-10)));
    };
    const onAbort = () => fail('The render was cancelled.', { terminate: true });

    // A long render is allowed to be slow; it is not allowed to go quiet. Any real worker event
    // resets the idle clock, while the separate ceiling still bounds a runaway job.
    const armGuard = () => {
      if (guard) clearTimeout(guard);
      guard = setTimeout(
        () => fail('The render engine stopped answering. Try a shorter timeline.', { terminate: true }),
        WORKER_GUARD_MS
      );
    };
    armGuard();
    hardLimit = setTimeout(
      () => fail('This render passed the browser’s 10-minute ceiling. Try a shorter timeline or lower resolution.', { terminate: true }),
      EXPORT_HARD_LIMIT_MS
    );

    const onMessage: Listener = (data) => {
      if (!data || (data.id && data.id !== id)) return;
      // Undated stream events belong to another job on this worker; only fatal notices are global.
      if ((data.type === 'PROGRESS' || data.type === 'LOG') && !data.id) return;
      armGuard();
      switch (data.type) {
        case 'LOG':
          remember(data.message);
          break;
        case 'PROGRESS':
          report({
            stage: 'encoding',
            fraction: clampFraction(data.progress),
            message: 'Rendering frames…',
          });
          break;
        case 'EXPORT_PROGRESS': {
          const stage: TimelineExportProgress['stage'] =
            data.stage === 'preparing_assets'
              ? 'preparing'
              : data.stage === 'encoding'
                ? 'encoding'
                : data.stage === 'finalizing' || data.stage === 'done' || data.stage === 'complete'
                  ? 'finalizing'
                  : 'preparing';
          report({
            stage,
            fraction: clampFraction(data.progress),
            message: data.message || 'Working…',
          });
          break;
        }
        case 'EXPORT_SUCCESS':
          report({ stage: 'done', fraction: 1, message: 'Render finished.' });
          succeed({
            blob: new Blob([data.buffer], { type: 'video/mp4' }),
            byteLength: Number(data.byteLength) || 0,
            captionsBurned: !!data.captionsBurned,
            engine: 'ffmpeg-timeline',
          });
          break;
        case 'EXPORT_ERROR':
          if (Array.isArray(data.logs)) data.logs.forEach(remember);
          fail(data.error || 'The frame-accurate export could not be completed.');
          break;
        case 'WORKER_FATAL':
          fail(data.error || 'The render engine stopped in this browser.', { terminate: true });
          break;
        default:
          break;
      }
    };

    listeners.add(onMessage);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    ready
      .then(() => {
        if (settled) return;
        w.postMessage(
          {
            type: 'EXPORT_TIMELINE',
            id,
            project: req.project,
            sourceBuffers,
            width: req.width,
            height: req.height,
            fps: req.fps,
            crf: req.crf ?? 20,
          },
          sourceBuffers.map((source) => source.buffer)
        );
      })
      .catch((error: Error) =>
        fail(error.message || 'The render engine could not be loaded.', { terminate: true })
      );
  });
}
