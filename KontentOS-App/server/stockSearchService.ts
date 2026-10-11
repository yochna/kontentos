/**
 * Stock Photography Search Service for KontentOS Static Studio.
 * Proxies Unsplash / Pexels search requests with API key protection
 * and provides an editorial curated fallback collection.
 */

import { CURATED_STOCK_PHOTOS, CuratedPhoto } from '../src/data/curatedStockPhotos.js';

export interface StockPhotoResult {
  id: string;
  url: string;
  thumbUrl: string;
  previewUrl: string;
  proxyUrl: string;
  description: string;
  category?: string;
  photographer: {
    name: string;
    username: string;
    profileUrl: string;
  };
  source: 'unsplash' | 'pexels' | 'curated';
  aspectRatio?: string;
}

export interface StockSearchResponse {
  success: boolean;
  query: string;
  page: number;
  perPage: number;
  total: number;
  photos: StockPhotoResult[];
  source: 'unsplash' | 'pexels' | 'curated';
}

/**
 * Curated high-resolution editorial collection across popular creator categories.
 * Guaranteed fallback when external API rate limits are hit or when no API keys are configured.
 */
export const CURATED_STOCK_COLLECTION: StockPhotoResult[] = CURATED_STOCK_PHOTOS as StockPhotoResult[];

/**
 * Executes a server-side stock photo search with Unsplash/Pexels API proxying
 * and automated fallback to curated collections.
 */
export async function searchStockPhotos(params: {
  query?: string;
  page?: number;
  perPage?: number;
  orientation?: 'landscape' | 'portrait' | 'squarish';
}): Promise<StockSearchResponse> {
  const query = (params.query || '').trim();
  const page = Math.max(1, Number(params.page) || 1);
  const perPage = Math.min(30, Math.max(1, Number(params.perPage) || 16));
  const orientation = params.orientation;

  const unsplashKey = (process.env.UNSPLASH_ACCESS_KEY || '').trim();
  const pexelsKey = (process.env.PEXELS_API_KEY || '').trim();

  // 1. Try Unsplash API if access key is provided
  if (unsplashKey && query) {
    try {
      const url = new URL('https://api.unsplash.com/search/photos');
      url.searchParams.set('query', query);
      url.searchParams.set('page', String(page));
      url.searchParams.set('per_page', String(perPage));
      if (orientation) url.searchParams.set('orientation', orientation);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Client-ID ${unsplashKey}`,
          'Accept-Version': 'v1',
        },
      });

      if (res.ok) {
        const data = await res.json();
        const photos: StockPhotoResult[] = (data.results || []).map((p: any) => ({
          id: p.id,
          url: p.urls.regular || p.urls.full,
          thumbUrl: p.urls.thumb || p.urls.small,
          previewUrl: p.urls.small || p.urls.regular,
          proxyUrl: `/api/proxy-media?url=${encodeURIComponent(p.urls.regular || p.urls.full)}`,
          description: p.alt_description || p.description || 'Editorial photo',
          photographer: {
            name: p.user?.name || 'Photographer',
            username: p.user?.username || '',
            profileUrl: p.user?.links?.html || 'https://unsplash.com',
          },
          source: 'unsplash',
        }));

        return {
          success: true,
          query,
          page,
          perPage,
          total: data.total || photos.length,
          photos,
          source: 'unsplash',
        };
      } else {
        console.warn(`[StockSearch] Unsplash returned ${res.status}, falling back to curated library.`);
      }
    } catch (uErr: any) {
      console.warn('[StockSearch] Unsplash request error:', uErr?.message);
    }
  }

  // 2. Try Pexels API if key is provided
  if (pexelsKey && query) {
    try {
      const url = new URL('https://api.pexels.com/v1/search');
      url.searchParams.set('query', query);
      url.searchParams.set('page', String(page));
      url.searchParams.set('per_page', String(perPage));
      if (orientation) url.searchParams.set('orientation', orientation);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: pexelsKey,
        },
      });

      if (res.ok) {
        const data = await res.json();
        const photos: StockPhotoResult[] = (data.photos || []).map((p: any) => ({
          id: String(p.id),
          url: p.src.large2x || p.src.large,
          thumbUrl: p.src.tiny || p.src.small,
          previewUrl: p.src.medium || p.src.large,
          proxyUrl: `/api/proxy-media?url=${encodeURIComponent(p.src.large2x || p.src.large)}`,
          description: p.alt || 'Editorial photo',
          photographer: {
            name: p.photographer || 'Photographer',
            username: p.photographer_id ? String(p.photographer_id) : '',
            profileUrl: p.photographer_url || 'https://pexels.com',
          },
          source: 'pexels',
        }));

        return {
          success: true,
          query,
          page,
          perPage,
          total: data.total_results || photos.length,
          photos,
          source: 'pexels',
        };
      } else {
        console.warn(`[StockSearch] Pexels returned ${res.status}, falling back to curated library.`);
      }
    } catch (pErr: any) {
      console.warn('[StockSearch] Pexels request error:', pErr?.message);
    }
  }

  // 3. Robust Curated Fallback
  // Filters matching query terms across description and category
  let filtered = CURATED_STOCK_COLLECTION;
  if (query) {
    const qLower = query.toLowerCase();
    const matches = CURATED_STOCK_COLLECTION.filter(
      (item) =>
        item.description.toLowerCase().includes(qLower) ||
        (item.category && item.category.toLowerCase().includes(qLower))
    );
    if (matches.length > 0) {
      filtered = matches;
    }
  }

  // Pagination on curated dataset
  const startIndex = (page - 1) * perPage;
  const paginated = filtered.slice(startIndex, startIndex + perPage);
  // If page exceeds length, return all filtered
  const finalPhotos = paginated.length > 0 ? paginated : filtered.slice(0, perPage);

  return {
    success: true,
    query,
    page,
    perPage,
    total: filtered.length,
    photos: finalPhotos,
    source: 'curated',
  };
}
