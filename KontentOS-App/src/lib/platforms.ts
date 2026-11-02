/**
 * What each platform actually allows, taken from the public character limits of their composers.
 * Shared on purpose: the Studio measures the caption against it, the bench validates before queueing
 * and the server refuses a scheduled post that could never be published as written.
 */

export type PlatformId =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'linkedin'
  | 'x'
  | 'facebook'
  | 'threads';

export interface PlatformSpec {
  id: PlatformId;
  label: string;
  /** Maximum caption length the composer accepts. */
  captionMax: number;
  hashtags: { suggested: number; max: number };
  /** Where a creator pastes the link after posting by hand. */
  liveUrlHost: string;
  /** The platform's own upload composer. Opens a real tab; it does not post anything. */
  composerUrl: string;
}

export const PLATFORMS: PlatformSpec[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    captionMax: 2200,
    hashtags: { suggested: 8, max: 30 },
    liveUrlHost: 'instagram.com',
    composerUrl: 'https://www.instagram.com/create/details/',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    captionMax: 2200,
    hashtags: { suggested: 5, max: 15 },
    liveUrlHost: 'tiktok.com',
    composerUrl: 'https://www.tiktok.com/upload',
  },
  {
    id: 'youtube',
    label: 'YouTube Shorts',
    captionMax: 5000,
    hashtags: { suggested: 3, max: 15 },
    liveUrlHost: 'youtube.com',
    composerUrl: 'https://www.youtube.com/upload',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    captionMax: 3000,
    hashtags: { suggested: 4, max: 9 },
    liveUrlHost: 'linkedin.com',
    composerUrl: 'https://www.linkedin.com/feed/',
  },
  {
    id: 'x',
    label: 'X',
    captionMax: 280,
    hashtags: { suggested: 2, max: 5 },
    liveUrlHost: 'x.com',
    composerUrl: 'https://x.com/compose/post',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    captionMax: 63206,
    hashtags: { suggested: 3, max: 10 },
    liveUrlHost: 'facebook.com',
    composerUrl: 'https://www.facebook.com/reels/create/',
  },
  {
    id: 'threads',
    label: 'Threads',
    captionMax: 500,
    hashtags: { suggested: 2, max: 8 },
    liveUrlHost: 'threads.com',
    composerUrl: 'https://www.threads.net/',
  },
];

const BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]));

/** Unknown platform strings fall back to Instagram, which is what the clips are tagged with today. */
export function platformSpec(id: string | null | undefined): PlatformSpec {
  return BY_ID.get((id || '').toLowerCase() as PlatformId) || BY_ID.get('instagram')!;
}

export function hashtagCount(caption: string): number {
  return (caption.match(/(^|\s)#[\p{L}\p{N}_-]+/gu) || []).length;
}

export interface CaptionVerdict {
  ok: boolean;
  length: number;
  limit: number;
  hashtags: number;
  /** Warnings are advisory — a short caption is legal, just usually under-performing. */
  notes: string[];
}

export function checkCaption(caption: string, platformId: string): CaptionVerdict {
  const spec = platformSpec(platformId);
  const trimmed = caption.trim();
  const tags = hashtagCount(trimmed);
  const notes: string[] = [];

  if (trimmed.length > spec.captionMax) {
    notes.push(`${spec.label} accepts ${spec.captionMax} characters — this is ${trimmed.length}.`);
  }
  if (tags > spec.hashtags.max) {
    notes.push(`${tags} hashtags is past what ${spec.label} allows (${spec.hashtags.max}).`);
  }
  if (trimmed.length && trimmed.length < 80) {
    notes.push('Under 80 characters leaves the algorithm nothing to read.');
  }

  const overHard = trimmed.length > spec.captionMax || tags > spec.hashtags.max;
  return { ok: !overHard, length: trimmed.length, limit: spec.captionMax, hashtags: tags, notes };
}
