// KontentOS — Editorial Studio · idea imagery.
//
// Every idea card is pinned to one photo from the curated stock library, chosen for that card's
// topic. The library is the single source: id, alt and URL all come off the same record, so an
// idea can never ship an alt that describes a different picture than the one its card renders.

import { CURATED_STOCK_PHOTOS } from '@/data/curatedStockPhotos';

export interface IdeaPhoto {
  id: string;
  alt: string;
  /** The 800px crop, for the one card shown large. */
  url: string;
  /** The 400px crop, for the grid — six of these is a page's worth of bytes saved. */
  thumbUrl: string;
}

/** Resolve a card's `imageId` onto its library record. An unknown id yields no photo, not a guess. */
export function ideaPhoto(id: string): IdeaPhoto {
  const photo = CURATED_STOCK_PHOTOS.find((p) => p.id === id);
  return { id, alt: photo?.description ?? '', url: photo?.previewUrl ?? '', thumbUrl: photo?.thumbUrl ?? '' };
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

