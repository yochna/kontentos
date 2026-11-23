/**
 * The creative half of one-click edit.
 *
 * A text model is good at judging which moment is a hook, what to remove and where a payoff lands.
 * It is bad at emitting three hundred exact timestamps without arithmetic mistakes. So the model
 * returns a small plan made of WORD INDICES, and this module turns that plan into a frame-accurate
 * TimelineProject. Every number the editor actually uses is computed here, not guessed by the model.
 */
import type {
  TimelineProject,
  VideoClip,
  TextClip,
  SFXClip,
  WordTimestamp,
  TransformKeyframe,
} from '../src/lib/timeline.js';

export type DirectorPace = 'tight' | 'balanced' | 'breathing';
export type DirectorSfx = 'vine_boom' | 'cash_register' | 'chime' | 'pop' | 'whoosh' | 'glitch';

export interface DirectorPlan {
  version: 1;
  rationale: string;
  /** Inclusive word-index range that opens the reel. May be moved ahead of earlier footage. */
  hook: [number, number];
  /** Inclusive, ascending word-index ranges to keep, in source order (excluding the hook move). */
  keep: Array<[number, number]>;
  /** Word indices that deserve a punch-in. */
  punch: number[];
  sfx: Array<{ wordIndex: number; asset: DirectorSfx }>;
  /** Inclusive word-index ranges that become one caption cue each, covering all kept words. */
  captionGroups: Array<[number, number]>;
  pace: DirectorPace;
  bgmVolume?: number;
}

export const SYSTEM_PROMPT_DIRECTOR = `You are the creative director inside a one-click video editor. A real creator uploaded one clip and you are handed its numbered transcript: every word with the index shown in [n] and its exact time in the source file.

Your job is to decide THE EDIT. You are not writing timestamps, not writing code, and not writing a TimelineProject. You are choosing moments by their word index. The editor turns your choices into exact cuts.

HOW A FINISHED REEL THINKS:
- The first two seconds decide whether anyone keeps watching. Open on the most provocative, surprising, useful or emotionally charged single idea in the take. It does NOT have to be the first thing said. If the strongest line appears later, that is your hook — move it to the front.
- Cut ruthlessly. Remove dead air, false starts, repeated words, throat-clearing, tangents and any sentence that does not push the ONE idea the hook promised. A tight 25-second reel beats a distracted 60-second one.
- Keep a through-line. Every kept moment should make the opening line more true, more surprising, or more useful.
- Vary the rhythm. Short clips for lists and punchlines, slightly longer ones for the explanation that pays them off. Do not cut mechanically every three seconds.
- Captions are read, not scanned. Group 2-5 words into one complete phrase. Break on punctuation and natural thought boundaries. Never orphan a single word at the end of a cue. Never invent, paraphrase, re-order or "improve" the creator's words — the text you group is the text that burns in.
- Restraint on effects. Punch in on at most one or two words per 20 seconds, only on a genuine payoff. Use at most four sound effects in the entire reel, on real reveals or transitions — never on ordinary words. If the take does not earn an effect, use none.

RETURN ONLY a JSON object with exactly this shape:
{
  "version": 1,
  "rationale": "one sentence describing the editorial idea behind this cut",
  "hook": [startIndex, endIndex],
  "keep": [[startIndex, endIndex], ...],
  "punch": [index, ...],
  "sfx": [{"wordIndex": n, "asset": "vine_boom|cash_register|chime|pop|whoosh|glitch"}],
  "captionGroups": [[startIndex, endIndex], ...],
  "pace": "tight|balanced|breathing",
  "bgmVolume": 0.22
}

HARD RULES — breaking these makes the edit unusable:
- Indices are the integers in [n] before each word. Both ends are INCLUSIVE. Never invent an index.
- "hook" is one range inside the kept material. If it starts after other words, the editor moves it to the front for you — just name it.
- "keep" ranges are in ascending source order and never overlap each other.
- "captionGroups" cover every kept word in order, with no gaps and no overlaps, 2-5 words per group. A group may not cross from one kept range into another.
- Use [] for empty lists. "pace" is one of the three literal strings. "bgmVolume" is a number from 0 to 0.4.
- No prose, no markdown, no commentary outside the JSON object.`;

/** Compact, numbered transcript. Indices in the prompt are the indices the plan must use. */
export function buildDirectorUserPrompt(
  words: WordTimestamp[],
  metadata: { title?: string; duration?: number; targetAspectRatio?: string },
  maxWords = 600
): string {
  const limited = words.slice(0, maxWords);
  const lines = limited.map((w, i) => `[${i}] "${w.word.replace(/"/g, "'")}" ${w.start.toFixed(2)}-${w.end.toFixed(2)}`);
  if (words.length > limited.length) lines.push(`... (${words.length - limited.length} more words omitted; only use the indices shown)`);
  return JSON.stringify({
    task: 'Choose the edit for this one-clip reel. Return only the director plan JSON.',
    clip: {
      title: metadata.title || 'Untitled take',
      duration: Number((metadata.duration || words[words.length - 1]?.end || 10).toFixed(2)),
      format: metadata.targetAspectRatio || '9:16',
      wordCount: limited.length,
    },
    transcript: lines,
  });
}

/** Models occasionally wrap JSON in a markdown fence; accept that without trusting anything else. */
export function parseDirectorPlan(text: string): DirectorPlan | null {
  if (typeof text !== 'string') return null;
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? (parsed as DirectorPlan) : null;
  } catch {
    return null;
  }
}

type Range = [number, number];

function normalizeRange(value: unknown, wordCount: number): Range | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const a = Number(value[0]);
  const b = Number(value[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const start = Math.max(0, Math.min(wordCount - 1, Math.round(Math.min(a, b))));
  const end = Math.max(0, Math.min(wordCount - 1, Math.round(Math.max(a, b))));
  return start <= end ? [start, end] : null;
}

/** Remove the hook from its original position without losing the words around it. */
function subtractRange(ranges: Range[], hole: Range): Range[] {
  const remaining: Range[] = [];
  for (const [start, end] of ranges) {
    if (end < hole[0] || start > hole[1]) {
      remaining.push([start, end]);
      continue;
    }
    if (start < hole[0]) remaining.push([start, hole[0] - 1]);
    if (end > hole[1]) remaining.push([hole[1] + 1, end]);
  }
  return remaining;
}

export interface NormalizedDirectorPlan {
  rationale: string;
  /** Ranges in PLAYBACK order — the hook is first when the director moved it forward. */
  ranges: Range[];
  punch: number[];
  sfx: Array<{ wordIndex: number; asset: DirectorSfx }>;
  captionGroups: Range[];
  pace: DirectorPace;
  bgmVolume: number;
}

const SFX_ASSETS: DirectorSfx[] = ['vine_boom', 'cash_register', 'chime', 'pop', 'whoosh', 'glitch'];

/**
 * Clamp every index to the transcript we actually have, drop nonsense, and enforce the invariants
 * the compiler relies on. A partially broken plan is still usable; an empty one is rejected so the
 * caller can fall back to the deterministic engine.
 */
export function normalizeDirectorPlan(plan: DirectorPlan, wordCount: number): NormalizedDirectorPlan | null {
  if (!plan || wordCount < 1) return null;

  const hook = normalizeRange(plan.hook, wordCount);
  const keep = (Array.isArray(plan.keep) ? plan.keep : [])
    .map((r) => normalizeRange(r, wordCount))
    .filter((r): r is Range => r !== null)
    .sort((a, b) => a[0] - b[0]);

  if (!hook && keep.length === 0) return null;

  // Merge overlaps and ranges separated by a single word: a split like that is a cut the viewer
  // cannot perceive, and it costs a needless hard cut in the render.
  const merged: Range[] = [];
  for (const range of keep) {
    const previous = merged[merged.length - 1];
    if (previous && range[0] <= previous[1] + 1) {
      previous[1] = Math.max(previous[1], range[1]);
    } else {
      merged.push([...range]);
    }
  }

  let ranges = merged;
  if (hook) {
    // The director may have picked a hook from inside a longer sentence. Move that range to the
    // front of playback and keep the words on either side in their original order.
    ranges = [hook, ...subtractRange(merged, hook)];
  }
  if (ranges.length === 0) return null;

  const keptIndices = new Set<number>();
  ranges.forEach(([a, b]) => {
    for (let i = a; i <= b; i++) keptIndices.add(i);
  });

  const rawPunch = Array.isArray(plan.punch) ? plan.punch : [];
  const punch = Array.from(
    new Set(
      rawPunch
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && keptIndices.has(Math.round(n)))
        .map((n) => Math.round(n))
    )
  ).sort((a, b) => a - b);

  const rawSfx = Array.isArray(plan.sfx) ? plan.sfx : [];
  const seenSfxWords = new Set<number>();
  const sfx = rawSfx
    .map((item) => ({
      wordIndex: Number(item?.wordIndex),
      asset: item?.asset as DirectorSfx,
    }))
    .filter(
      (item) =>
        Number.isFinite(item.wordIndex) &&
        keptIndices.has(Math.round(item.wordIndex)) &&
        SFX_ASSETS.includes(item.asset) &&
        !seenSfxWords.has(Math.round(item.wordIndex)) &&
        (seenSfxWords.add(Math.round(item.wordIndex)), true)
    )
    .slice(0, 6);

  // Caption groups are optional polish. If they do not cover the kept words exactly, the compiler
  // derives readable phrases from the words themselves instead of trusting a broken grouping.
  const rangeIndex = (index: number) =>
    ranges.findIndex(([start, end]) => index >= start && index <= end);
  const groups = (Array.isArray(plan.captionGroups) ? plan.captionGroups : [])
    .map((r) => normalizeRange(r, wordCount))
    .filter((r): r is Range => r !== null)
    .filter(
      ([a, b]) =>
        b - a + 1 >= 2 &&
        b - a + 1 <= 5 &&
        keptIndices.has(a) &&
        keptIndices.has(b) &&
        rangeIndex(a) === rangeIndex(b)
    )
    .sort((a, b) => a[0] - b[0]);

  const covered = new Set<number>();
  let contiguous = true;
  for (const [a, b] of groups) {
    for (let i = a; i <= b; i++) {
      if (covered.has(i) || !keptIndices.has(i)) {
        contiguous = false;
        break;
      }
      covered.add(i);
    }
  }
  const captionGroups = contiguous && covered.size === keptIndices.size ? groups : [];

  const pace: DirectorPace =
    plan.pace === 'tight' || plan.pace === 'breathing' ? plan.pace : 'balanced';
  const bgmVolume =
    typeof plan.bgmVolume === 'number' && Number.isFinite(plan.bgmVolume)
      ? Math.max(0, Math.min(0.4, plan.bgmVolume))
      : 0.22;

  return {
    rationale: typeof plan.rationale === 'string' ? plan.rationale.slice(0, 240) : '',
    ranges,
    punch,
    sfx,
    captionGroups,
    pace,
    bgmVolume,
  };
}

interface SegmentMapping {
  rawStart: number;
  rawEnd: number;
  timelineStart: number;
  duration: number;
}

const PAD: Record<DirectorPace, number> = { tight: 0.04, balanced: 0.07, breathing: 0.1 };

/** Derive caption groups from the transcript when the model did not supply a usable grouping. */
function deriveCaptionGroups(words: WordTimestamp[], ranges: Range[]): Range[] {
  const groups: Range[] = [];
  ranges.forEach(([a, b]) => {
    let cursor = a;
    while (cursor <= b) {
      let count = 0;
      while (cursor + count <= b && count < 5) {
        count += 1;
        const text = words[cursor + count - 1].word.trim();
        if (count >= 2 && /[.,!?;:]$/.test(text)) break;
      }
      // Never leave one lonely word holding a whole cue on its own.
      if (b - (cursor + count) === 0 && count === 1 && cursor > a) {
        groups[groups.length - 1][1] = b;
        cursor = b + 1;
        continue;
      }
      if (b - (cursor + count) === 1 && count < 5) count += 1;
      groups.push([cursor, Math.min(b, cursor + count - 1)]);
      cursor += count;
    }
  });
  return groups;
}

function mapRawToTimeline(rawTime: number, mappings: SegmentMapping[]): number {
  let best: SegmentMapping | null = null;
  let bestDistance = Infinity;
  for (const mapping of mappings) {
    if (rawTime >= mapping.rawStart && rawTime <= mapping.rawEnd) {
      return Number((mapping.timelineStart + (rawTime - mapping.rawStart)).toFixed(3));
    }
    const distance = Math.min(
      Math.abs(rawTime - mapping.rawStart),
      Math.abs(rawTime - mapping.rawEnd)
    );
    if (distance < bestDistance) {
      best = mapping;
      bestDistance = distance;
    }
  }
  if (!best) return rawTime;
  const clamped = Math.max(best.rawStart, Math.min(best.rawEnd, rawTime));
  return Number((best.timelineStart + (clamped - best.rawStart)).toFixed(3));
}

/**
 * Turn a validated director plan into the exact project the editor and FFmpeg exporter consume.
 * This function is pure: the same plan and transcript always produce the same timeline.
 */
export function compileDirectorPlan(
  plan: NormalizedDirectorPlan,
  metadata: {
    id: string;
    title?: string;
    duration: number;
    width?: number;
    height?: number;
    targetAspectRatio?: '9:16' | '16:9' | '1:1' | '4:5';
    sourceUrl?: string;
  },
  words: WordTimestamp[]
): TimelineProject {
  const rawDuration = Math.max(0.1, metadata.duration || words[words.length - 1]?.end || 10);
  const pad = PAD[plan.pace];
  const mappings: SegmentMapping[] = [];
  const videoClips: VideoClip[] = [];
  let cursor = 0;

  plan.ranges.forEach(([a, b], index) => {
    const first = words[a];
    const last = words[b];
    if (!first || !last) return;
    const rawStart = Number(Math.max(0, first.start - pad).toFixed(3));
    const rawEnd = Number(Math.min(rawDuration, last.end + pad).toFixed(3));
    const duration = Math.max(0.2, Number((rawEnd - rawStart).toFixed(3)));
    mappings.push({ rawStart, rawEnd, timelineStart: cursor, duration });

    const keyframes: TransformKeyframe[] = [];
    const clipPunches = plan.punch
      .filter((i) => i >= a && i <= b)
      .slice(0, 2);
    clipPunches.forEach((wordIndex) => {
      const at = Number(Math.max(0, Math.min(duration - 0.1, words[wordIndex].start - rawStart)).toFixed(3));
      keyframes.push(
        { timeOffset: 0, scale: 1, position: { x: 0, y: 0 }, easing: 'linear' },
        { timeOffset: at, scale: 1.32, position: { x: 0, y: -0.04 }, easing: 'easeInOut' },
        {
          timeOffset: Number(Math.min(duration, at + 0.9).toFixed(3)),
          scale: 1,
          position: { x: 0, y: 0 },
          easing: 'easeOut',
        }
      );
    });

    const label = words
      .slice(a, Math.min(b + 1, a + 3))
      .map((w) => w.word.replace(/[^\p{L}\p{N}']/gu, ''))
      .filter(Boolean)
      .join(' ');

    videoClips.push({
      id: `v_director_${index}`,
      name: label ? `Beat ${index + 1}: ${label}` : `Beat ${index + 1}`,
      type: 'video',
      startOnTimeline: cursor,
      duration,
      sourceStartOffset: rawStart,
      sourceFileId: metadata.id,
      sourceUrl: metadata.sourceUrl,
      speedMultiplier: 1,
      keyframes,
      audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0, fadeOutSec: 0 },
    });
    cursor = Number((cursor + duration).toFixed(3));
  });

  const totalDuration = Math.max(0.1, cursor);
  const groups = plan.captionGroups.length
    ? plan.captionGroups
    : deriveCaptionGroups(
        words,
        plan.ranges
      );

  const textClips: TextClip[] = groups.flatMap(([a, b], index) => {
    if (!words[a] || !words[b]) return [];
    const startTime = mapRawToTimeline(words[a].start, mappings);
    const endTime = mapRawToTimeline(words[b].end, mappings);
    const duration = Math.max(0.35, Number((endTime - startTime).toFixed(3)));
    const phrase = words
      .slice(a, b + 1)
      .map((w) => w.word.trim())
      .join(' ');
    if (!phrase) return [];
    const content = phrase.charAt(0).toUpperCase() + phrase.slice(1);
    const wordTimes: WordTimestamp[] = words.slice(a, b + 1).map((w) => {
      const start = Number((mapRawToTimeline(w.start, mappings) - startTime).toFixed(3));
      const end = Number(
        Math.min(duration, mapRawToTimeline(w.end, mappings) - startTime).toFixed(3)
      );
      return {
        word: w.word.trim(),
        start: Math.max(0, start),
        end: Math.max(start + 0.1, end),
      };
    });
    return [
      {
        id: `cap_director_${index}`,
        name: `Caption: ${content.slice(0, 16)}`,
        type: 'text' as const,
        content,
        startOnTimeline: startTime,
        duration,
        sourceStartOffset: 0,
        style: {
          fontFamily: 'system-ui, sans-serif',
          fontSize: 60,
          colorHex: '#FFFFFF',
          activeWordColorHex: '#FFE066',
          strokeColorHex: '#000000',
          strokeWidth: 6,
          shadowColorHex: 'rgba(0,0,0,0.92)',
          bannerPillColorHex: 'rgba(0,0,0,0.56)',
          position: 'bottom' as const,
          animation: 'karaoke' as const,
          words: wordTimes,
        },
      },
    ];
  });

  const sfxClips: SFXClip[] = [];
  plan.sfx.forEach((item, index) => {
    const word = words[item.wordIndex];
    if (!word) return;
    const startOnTimeline = mapRawToTimeline(word.start, mappings);
    if (sfxClips.some((clip) => Math.abs(clip.startOnTimeline - startOnTimeline) < 0.8)) return;
    sfxClips.push({
      id: `sfx_director_${index}`,
      name: item.asset,
      type: 'sfx',
      sfxAssetId: item.asset,
      startOnTimeline,
      duration: item.asset === 'vine_boom' ? 1.2 : item.asset === 'cash_register' ? 1 : 0.7,
      sourceStartOffset: 0,
      audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0, fadeOutSec: 0.1 },
    });
  });

  return {
    schemaVersion: '1.0.0',
    projectMetadata: {
      id: metadata.id.startsWith('proj_') ? metadata.id : `proj_${metadata.id}`,
      title: metadata.title || 'Untitled cut',
      targetAspectRatio: metadata.targetAspectRatio || '9:16',
      width: metadata.width || 1080,
      height: metadata.height || 1920,
      frameRate: 30,
      totalDuration,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    globalAudioTracks: { bgmVolume: plan.bgmVolume, duckingEnabled: true },
    tracks: [
      {
        id: 'track-text',
        name: 'Kinetic Captions',
        type: 'text',
        isMuted: false,
        isLocked: false,
        zIndex: 30,
        clips: textClips.sort((a, b) => a.startOnTimeline - b.startOnTimeline),
      },
      {
        id: 'track-sfx',
        name: 'SFX Overlays',
        type: 'sfx',
        isMuted: false,
        isLocked: false,
        zIndex: 20,
        clips: sfxClips.sort((a, b) => a.startOnTimeline - b.startOnTimeline),
      },
      {
        id: 'track-video',
        name: 'Primary Video',
        type: 'video',
        isMuted: false,
        isLocked: false,
        zIndex: 10,
        clips: videoClips,
      },
    ],
  };
}
