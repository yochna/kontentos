/** Small, honest inferences from metadata the app already has. No guessed subject matter. */

export type ExportAspect = '9:16' | '16:9' | '1:1' | '4:5';

export interface ArchivedVideoRef {
  id: string;
  title: string;
  file_url?: string;
  duration?: number;
  thumbnail_url?: string;
}

/** The archived render is the source Publish must point at, not a fresh synthetic record. */
export function findArchivedVideo<T extends ArchivedVideoRef>(
  videos: readonly T[],
  fileUrl?: string
): T | null {
  if (!fileUrl) return null;
  return videos.find((video) => video.file_url === fileUrl) ?? null;
}

const ASPECT_RATIOS: Record<ExportAspect, number> = {
  '9:16': 9 / 16,
  '16:9': 16 / 9,
  '1:1': 1,
  '4:5': 4 / 5,
};

export function aspectGeometry(aspect: ExportAspect): { width: number; height: number } {
  if (aspect === '16:9') return { width: 1920, height: 1080 };
  if (aspect === '1:1') return { width: 1080, height: 1080 };
  if (aspect === '4:5') return { width: 1080, height: 1350 };
  return { width: 1080, height: 1920 };
}

/** Pick the nearest supported export frame using the source's real pixel ratio when it is known. */
export function inferExportAspect(aspectRatio?: string | null): ExportAspect {
  if (!aspectRatio) return '9:16';
  const match = aspectRatio.match(/(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)/i);
  if (!match) return '9:16';
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '9:16';

  const source = width / height;
  return (Object.keys(ASPECT_RATIOS) as ExportAspect[]).reduce((best, candidate) => {
    const distance = Math.abs(Math.log(source / ASPECT_RATIOS[candidate]));
    const bestDistance = Math.abs(Math.log(source / ASPECT_RATIOS[best]));
    return distance < bestDistance ? candidate : best;
  }, '9:16');
}

/** Short clips benefit from tighter caption groups; long takes would otherwise whip past the text. */
export function suggestedWordsPerCue(durationSec: number, presetWordsPerCue: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return presetWordsPerCue;
  if (durationSec < 12) return Math.max(2, Math.min(presetWordsPerCue, 4));
  if (durationSec > 90) return Math.max(presetWordsPerCue, 6);
  return presetWordsPerCue;
}
