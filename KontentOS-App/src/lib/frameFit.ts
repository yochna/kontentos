/**
 * The frame a reel is cut into.
 *
 * A take shot sideways does not become a reel by wishing: the pixels have to be rescaled and the
 * middle taken out of them. This is the one filter chain that does it, and both encoders read it —
 * `server/mediaCut.ts` passes it to the server's ffmpeg, `src/lib/browserCut.ts` passes it to the
 * worker in the tab. Two copies is how a reel comes out vertical in one app and sideways in the
 * other.
 */

// Normalize to square pixels first so the vertical crop preserves anamorphic picture proportions.
const VERTICAL_FILTER_CHAIN = 'scale=iw*sar:ih,setsar=1,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1';

/**
 * `-vf` is only passed for a shape the source does not already fill. Rewriting a frame that is
 * already 9:16 buys nothing and costs every second of the encode, whether that encode runs on a
 * shared server core or in the creator's own tab.
 */
export function cutFilter(targetAspect: string | undefined, sourceAspect: string | undefined): string | null {
  if (targetAspect !== '9:16') return null;
  if (sourceAspect && Math.abs(parseAspect(sourceAspect) - 9 / 16) < 0.01) return null;
  return VERTICAL_FILTER_CHAIN;
}

/** "9:16", "4:3", "1.78" — anything unreadable returns 0, which never matches a target. */
export function parseAspect(value: string): number {
  const [w, h] = value.split(':').map((n) => Number(n));
  if (w > 0 && h > 0) return w / h;
  const single = Number(value);
  return Number.isFinite(single) && single > 0 ? single : 0;
}
