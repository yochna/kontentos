/**
 * Web Audio Peak Extractor Utility
 * Fetches media audio, decodes PCM data via AudioContext, and extracts downsampled peak points for real-time timeline waveforms.
 */

const peakCache = new Map<string, number[]>();

export async function extractAudioPeaks(
  url: string,
  peaksPerSecond = 100
): Promise<number[]> {
  if (!url) return [];
  const cacheKey = `${url}_${peaksPerSecond}`;
  if (peakCache.has(cacheKey)) {
    return peakCache.get(cacheKey)!;
  }

  try {
    if (typeof window === 'undefined') return [];
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return generateFallbackPeaks(url, peaksPerSecond);

    const ctx = new AudioCtx();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const channelData = audioBuffer.getChannelData(0);
    const totalSamples = channelData.length;
    const duration = audioBuffer.duration;
    const totalPeaks = Math.max(10, Math.floor(duration * peaksPerSecond));
    const step = Math.max(1, Math.floor(totalSamples / totalPeaks));

    const peaks: number[] = [];
    for (let i = 0; i < totalPeaks; i++) {
      const start = i * step;
      let max = 0;
      for (let j = 0; j < step; j++) {
        const val = Math.abs(channelData[start + j] || 0);
        if (val > max) max = val;
      }
      peaks.push(Math.min(1.0, Math.round(max * 100) / 100));
    }

    ctx.close().catch(() => {});
    peakCache.set(cacheKey, peaks);
    return peaks;
  } catch {
    // If decoding or fetching fails, generate deterministic pseudo peaks
    const fallback = generateFallbackPeaks(url, peaksPerSecond);
    peakCache.set(cacheKey, fallback);
    return fallback;
  }
}

function generateFallbackPeaks(seed: string, peaksPerSecond: number): number[] {
  const count = Math.max(30, Math.floor(12 * peaksPerSecond));
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
  }

  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    const s1 = Math.sin((i + Math.abs(hash % 100)) * 0.12);
    const s2 = Math.cos((i + Math.abs(hash % 47)) * 0.35);
    const val = Math.min(1.0, Math.max(0.12, Math.abs(s1) * 0.6 + Math.abs(s2) * 0.4));
    peaks.push(Math.round(val * 100) / 100);
  }
  return peaks;
}

/**
 * Returns peak values corresponding to a trimmed clip segment.
 */
export function slicePeaksForClip(
  allPeaks: number[],
  sourceStartOffset: number,
  clipDuration: number,
  speedMultiplier = 1,
  peaksPerSecond = 100
): number[] {
  if (!allPeaks.length) return [];
  const startIdx = Math.max(0, Math.floor(sourceStartOffset * peaksPerSecond));
  const count = Math.max(5, Math.ceil(clipDuration * (speedMultiplier || 1) * peaksPerSecond));
  const sliced = allPeaks.slice(startIdx, startIdx + count);
  if (sliced.length === 0) return allPeaks.slice(0, count);
  return sliced;
}
