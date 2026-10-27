/**
 * KontentOS — B-Roll Auto-Insert Engine & Stock Footage Overlays
 * Curated royalty-free visual assets, AI & keyword speech matching,
 * and multi-track EDL assembly.
 */

import {
  brollTrackOf,
  cloneProject,
  round2,
  textClips,
  totalDuration,
  type TimelineProject,
  type VideoClip,
} from '@/lib/timeline';

export type BrollCategory = 'tech' | 'finance' | 'urban' | 'lifestyle' | 'energy';

export interface BrollAsset {
  id: string;
  title: string;
  category: BrollCategory;
  keywords: string[];
  videoUrl: string;
  thumbnailUrl?: string;
  tag: string;
}

export const BROLL_LIBRARY: BrollAsset[] = [
  // Tech & AI Coding
  {
    id: 'tech_code_terminal',
    title: 'Code Matrix Terminal',
    category: 'tech',
    keywords: ['ai', 'code', 'software', 'tech', 'computer', 'developer', 'algorithm', 'app', 'python', 'javascript', 'system', 'build', 'program', 'terminal'],
    videoUrl: '/broll/tech_system.mp4',
    tag: 'Tech',
  },
  {
    id: 'tech_binary_matrix',
    title: 'Cyber Data Stream',
    category: 'tech',
    keywords: ['data', 'cyber', 'matrix', 'stream', 'cloud', 'digital', 'future', 'robot', 'network', 'hack', 'server', 'database'],
    videoUrl: '/broll/tech_system.mp4',
    tag: 'Cyber',
  },

  // Finance & Business / Crypto
  {
    id: 'finance_stock_charts',
    title: 'Stock Market Candlesticks',
    category: 'finance',
    keywords: ['money', 'cash', 'crypto', 'bitcoin', 'revenue', 'dollar', 'growth', 'market', 'stock', 'invest', 'wealth', 'profit', 'chart', 'sales', 'business', 'scale'],
    videoUrl: '/broll/finance_business.mp4',
    tag: 'Finance',
  },
  {
    id: 'finance_laptop_work',
    title: 'High-Growth Executive Desk',
    category: 'finance',
    keywords: ['company', 'startup', 'agency', 'client', 'work', 'laptop', 'deal', 'success', 'strategy', 'founder', 'ceo', 'productivity'],
    videoUrl: '/broll/finance_business.mp4',
    tag: 'Business',
  },

  // Urban & Cinematic
  {
    id: 'urban_city_traffic',
    title: 'Night Metropolis Hyperlapse',
    category: 'urban',
    keywords: ['city', 'traffic', 'speed', 'world', 'fast', 'night', 'street', 'commute', 'lights', 'travel', 'move', 'global'],
    videoUrl: '/broll/urban_traffic.mp4',
    tag: 'Metropolis',
  },
  {
    id: 'urban_sunset_skyline',
    title: 'Golden Hour Skyscrapers',
    category: 'urban',
    keywords: ['skyline', 'tower', 'building', 'office', 'view', 'downtown', 'future', 'architecture', 'sunset', 'horizon'],
    videoUrl: '/broll/metropolis_street.mp4',
    tag: 'Skyline',
  },

  // Lifestyle & Focus
  {
    id: 'lifestyle_coffee_morning',
    title: 'Steaming Morning Coffee',
    category: 'lifestyle',
    keywords: ['morning', 'routine', 'coffee', 'mind', 'focus', 'start', 'day', 'habit', 'calm', 'peace', 'wake', 'fresh'],
    videoUrl: '/broll/lifestyle_nature.mp4',
    tag: 'Lifestyle',
  },
  {
    id: 'lifestyle_ocean_waves',
    title: 'Calm Turquoise Ocean',
    category: 'lifestyle',
    keywords: ['ocean', 'nature', 'life', 'relax', 'deep', 'think', 'freedom', 'beach', 'breathe', 'clarity', 'space'],
    videoUrl: '/broll/lifestyle_nature.mp4',
    tag: 'Nature',
  },

  // Energy & Viral Motion
  {
    id: 'energy_neon_tunnel',
    title: 'Hyperspeed Neon Tunnel',
    category: 'energy',
    keywords: ['secret', 'viral', 'power', 'crazy', 'insane', 'shocking', 'speed', 'tunnel', 'energy', 'electric', 'boost', 'blast'],
    videoUrl: '/broll/urban_traffic.mp4',
    tag: 'Viral Speed',
  },
  {
    id: 'energy_fire_sparks',
    title: 'Blazing Sparks & Embers',
    category: 'energy',
    keywords: ['fire', 'flame', 'spark', 'burn', 'hot', 'lit', 'warning', 'attention', 'heat', 'danger', 'alert', 'boom'],
    videoUrl: '/broll/metropolis_street.mp4',
    tag: 'Impact',
  },
];

export interface AutoBrollResult {
  project: TimelineProject;
  insertedCount: number;
  matchedKeywords: string[];
}

/**
 * Automatically detects keywords in speech captions and overlays contextual B-Roll clips.
 */
export function autoInsertBrollToProject(
  project: TimelineProject,
  options: { density?: 'light' | 'medium' | 'dense' } = {}
): AutoBrollResult {
  const clone = cloneProject(project);
  const cues = textClips(clone);
  const totalDur = totalDuration(clone);

  // Spacing constraints between B-Roll overlays
  const minSpacing =
    options.density === 'dense' ? 3.5 : options.density === 'light' ? 8.0 : 5.0;
  const clipDuration = 2.4;

  let brollTrack = brollTrackOf(clone);
  if (!brollTrack) {
    brollTrack = {
      id: 'track-broll',
      name: 'B-Roll & Visual Overlays',
      type: 'video',
      isMuted: false,
      isLocked: false,
      zIndex: 15,
      clips: [],
    };
    clone.tracks.push(brollTrack);
  } else {
    // Clear auto-generated B-roll clips if re-running
    brollTrack.clips = [];
  }

  const matchedKeywords: string[] = [];
  let lastBrollEnd = 1.0; // Give first 1s for hook face-to-camera

  for (const cue of cues) {
    const cueStart = cue.startOnTimeline;
    if (cueStart < lastBrollEnd + minSpacing) continue;
    if (cueStart + clipDuration > totalDur) break;

    const text = cue.content.toLowerCase();
    const tokens = text.replace(/[^a-z0-9\s]/g, '').split(/\s+/);

    // Find best asset match
    let bestAsset: BrollAsset | null = null;
    let matchedKw = '';

    for (const asset of BROLL_LIBRARY) {
      for (const kw of asset.keywords) {
        if (tokens.includes(kw) || text.includes(kw)) {
          bestAsset = asset;
          matchedKw = kw;
          break;
        }
      }
      if (bestAsset) break;
    }

    if (!bestAsset && cues.indexOf(cue) % 3 === 1) {
      // Periodic visual cutaway when no explicit keyword matches
      const fallbackIdx = (brollTrack.clips.length) % BROLL_LIBRARY.length;
      bestAsset = BROLL_LIBRARY[fallbackIdx];
      matchedKw = bestAsset.tag.toLowerCase();
    }

    if (bestAsset) {
      const bClip: VideoClip = {
        id: `broll_${Date.now()}_${brollTrack.clips.length}`,
        name: `B-Roll: ${bestAsset.title}`,
        type: 'video',
        sourceFileId: bestAsset.id,
        sourceUrl: bestAsset.videoUrl,
        startOnTimeline: round2(cueStart),
        duration: clipDuration,
        sourceStartOffset: 0,
        speedMultiplier: 1.0,
        keyframes: [
          {
            timeOffset: 0,
            scale: 1.05,
            position: { x: 0, y: 0 },
            easing: 'linear',
          },
          {
            timeOffset: clipDuration,
            scale: 1.12,
            position: { x: 0, y: 0 },
            easing: 'linear',
          },
        ],
        audioModifiers: {
          pitchShiftCents: 0,
          volume: 0, // Muted so speech voiceover remains pristine
          fadeInSec: 0,
          fadeOutSec: 0,
        },
      };

      brollTrack.clips.push(bClip);
      if (matchedKw && !matchedKeywords.includes(matchedKw)) {
        matchedKeywords.push(matchedKw);
      }
      lastBrollEnd = cueStart + clipDuration;
    }
  }

  brollTrack.clips.sort((a, b) => a.startOnTimeline - b.startOnTimeline);

  return {
    project: clone,
    insertedCount: brollTrack.clips.length,
    matchedKeywords,
  };
}

/**
 * Manually drops a specific B-Roll asset from the library onto the timeline at current time.
 */
export function insertBrollAtTime(
  project: TimelineProject,
  assetId: string,
  atTime: number,
  durationSec = 2.5
): TimelineProject {
  const clone = cloneProject(project);
  const asset = BROLL_LIBRARY.find((a) => a.id === assetId) || BROLL_LIBRARY[0];

  let brollTrack = brollTrackOf(clone);
  if (!brollTrack) {
    brollTrack = {
      id: 'track-broll',
      name: 'B-Roll & Visual Overlays',
      type: 'video',
      isMuted: false,
      isLocked: false,
      zIndex: 15,
      clips: [],
    };
    clone.tracks.push(brollTrack);
  }

  const newClip: VideoClip = {
    id: `broll_${Date.now()}`,
    name: `B-Roll: ${asset.title}`,
    type: 'video',
    sourceFileId: asset.id,
    sourceUrl: asset.videoUrl,
    startOnTimeline: round2(atTime),
    duration: durationSec,
    sourceStartOffset: 0,
    speedMultiplier: 1.0,
    keyframes: [
      { timeOffset: 0, scale: 1.05, position: { x: 0, y: 0 }, easing: 'linear' },
      { timeOffset: durationSec, scale: 1.12, position: { x: 0, y: 0 }, easing: 'linear' },
    ],
    audioModifiers: {
      pitchShiftCents: 0,
      volume: 0,
      fadeInSec: 0,
      fadeOutSec: 0,
    },
  };

  brollTrack.clips.push(newClip);
  brollTrack.clips.sort((a, b) => a.startOnTimeline - b.startOnTimeline);
  return clone;
}
