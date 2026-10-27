// KontentOS — Editorial Studio · idea imagery.
//
// Each idea card is pinned to a SPECIFIC, hand-verified Unsplash photo id that
// was chosen for that card's exact topic (see `imageId` on each idea in
// data/mock.ts). The URL is built deterministically from that id, so the image
// is always contextual to its card — never a random or keyword-guessed pull.
//
// Unsplash's per-photo `/download` endpoint accepts sizing params, so we request
// a lightly-compressed, cropped asset (~100–250KB) instead of the multi-MB original.

/** Build a cropped, optimized Unsplash image URL for a given photo id. */
export function unsplashPhoto(id: string, w = 1200, h = 675): string {
  return `https://unsplash.com/photos/${id}/download?force=true&w=${w}&h=${h}&fit=crop&q=80`;
}

/**
 * Safely resolves an image URL to bypass browser CORS / COEP restrictions.
 * Converts external http/https image URLs into proxy URLs or returns safe data/blob/local URLs.
 */
export function getSafeImageUrl(url?: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('/')) {
    return trimmed;
  }
  // If it's an external URL, route through the universal proxy endpoint
  if (/^https?:\/\//i.test(trimmed)) {
    if (trimmed.includes('/api/proxy-media?url=')) return trimmed;
    return `/api/proxy-media?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

