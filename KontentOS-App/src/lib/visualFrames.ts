/**
 * Browser-side visual sampling for clips with no usable speech.
 *
 * Speech-to-text can only describe spoken words. Silent footage still has real visual information:
 * colour, motion, scene changes and on-screen action. These helpers sample the actual frames so the
 * editor and the copy engine can work from evidence instead of a filename or a invented transcript.
 */

export interface VisualFrame {
  /** Source time in seconds. */
  timeSec: number;
  /** JPEG data URL, small enough to send with an auto-edit request. */
  dataUrl: string;
  /** 0..1 change from the previous sampled frame. */
  changeScore: number;
  /** 0..1 average luma of the frame. */
  brightness: number;
}

const SAMPLE_GRID_WIDTH = 48;
const SAMPLE_GRID_HEIGHT = 27;
const MAX_ENCODED_SIDE = 640;
const JPEG_QUALITY = 0.68;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Sample inside the take so black lead-in/tail frames do not dominate the analysis. */
export function visualSampleTimes(durationSec: number, count = 8): number[] {
  const duration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 12;
  const sampleCount = Math.max(2, Math.min(12, Math.floor(count)));
  const margin = Math.min(duration * 0.08, 0.35);
  const usable = Math.max(0.2, duration - margin * 2);
  return Array.from({ length: sampleCount }, (_, index) =>
    round2(margin + (usable * index) / (sampleCount - 1)),
  );
}

export function lumaFingerprint(pixels: Uint8ClampedArray): number[] {
  const values: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) {
    values.push((pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114) / 255);
  }
  return values;
}

export function brightnessOf(fingerprint: number[]): number {
  if (!fingerprint.length) return 0;
  return round2(fingerprint.reduce((sum, value) => sum + value, 0) / fingerprint.length);
}

export function changeBetween(previous: number[] | undefined, current: number[]): number {
  if (!previous || previous.length !== current.length) return 0;
  let total = 0;
  for (let index = 0; index < current.length; index += 1) {
    total += Math.abs(current[index] - previous[index]);
  }
  return round2(total / current.length);
}

function waitForMediaEvent(video: HTMLVideoElement, event: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener(event, onEvent);
      video.removeEventListener('error', onError);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('The clip could not be decoded for visual analysis.'));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Timed out while sampling clip frames.'));
    }, timeoutMs);
    video.addEventListener(event, onEvent, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

async function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  const ready = waitForMediaEvent(video, 'seeked', 6000);
  video.currentTime = Math.min(Math.max(timeSec, 0), Math.max(0, video.duration - 0.04));
  await ready;
}

/**
 * Capture evenly spaced frames plus cheap motion/luma signals. Returns an empty array when the
 * environment has no canvas or the source cannot be read; callers must keep working without it.
 */
export async function captureVisualFrames(
  sourceUrl: string,
  durationSec: number,
  count = 8,
): Promise<VisualFrame[]> {
  if (typeof document === 'undefined' || !sourceUrl) return [];

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  const metadata = waitForMediaEvent(video, 'loadedmetadata', 8000);
  video.src = sourceUrl;
  video.load();

  try {
    await metadata;
    const times = visualSampleTimes(Number.isFinite(video.duration) ? video.duration : durationSec, count);
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = SAMPLE_GRID_WIDTH;
    gridCanvas.height = SAMPLE_GRID_HEIGHT;
    const gridContext = gridCanvas.getContext('2d', { willReadFrequently: true });
    const encodedCanvas = document.createElement('canvas');
    const encodedContext = encodedCanvas.getContext('2d');
    if (!gridContext || !encodedContext) return [];

    const scale = Math.min(1, MAX_ENCODED_SIDE / Math.max(video.videoWidth || 1, video.videoHeight || 1));
    encodedCanvas.width = Math.max(1, Math.round((video.videoWidth || 1920) * scale));
    encodedCanvas.height = Math.max(1, Math.round((video.videoHeight || 1080) * scale));

    const frames: VisualFrame[] = [];
    let previousFingerprint: number[] | undefined;
    for (const timeSec of times) {
      await seekVideo(video, timeSec);
      gridContext.drawImage(video, 0, 0, SAMPLE_GRID_WIDTH, SAMPLE_GRID_HEIGHT);
      const fingerprint = lumaFingerprint(
        gridContext.getImageData(0, 0, SAMPLE_GRID_WIDTH, SAMPLE_GRID_HEIGHT).data,
      );
      encodedContext.drawImage(video, 0, 0, encodedCanvas.width, encodedCanvas.height);
      frames.push({
        timeSec,
        dataUrl: encodedCanvas.toDataURL('image/jpeg', JPEG_QUALITY),
        changeScore: changeBetween(previousFingerprint, fingerprint),
        brightness: brightnessOf(fingerprint),
      });
      previousFingerprint = fingerprint;
    }
    return frames;
  } catch (error) {
    console.warn('[visualFrames] frame sampling skipped:', error);
    return [];
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}

/** Pick the most useful visual beats without duplicating neighbouring frames. */
export function salientVisualBeats(frames: VisualFrame[], maxBeats = 4): VisualFrame[] {
  if (frames.length <= maxBeats) return frames;
  const ranked = frames
    .slice(1)
    .map((frame, index) => ({ frame, index: index + 1, score: frame.changeScore }))
    .sort((a, b) => b.score - a.score);
  const picked = new Set<number>([0]);
  for (const candidate of ranked) {
    if (picked.size >= maxBeats) break;
    if ([...picked].some((index) => Math.abs(index - candidate.index) < 2)) continue;
    picked.add(candidate.index);
  }
  return frames.filter((_, index) => picked.has(index));
}
