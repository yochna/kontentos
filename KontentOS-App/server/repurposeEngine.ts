import { GoogleGenAI } from '@google/genai';
import { platformSpec } from '../src/lib/platforms.js';
import { engineTimeout, isEngineCeiling, readEngineJson } from './engine.js';
import {
  DEFAULT_MODEL,
  ENGINE_MODELS,
  MODEL_ATTEMPT_TIMEOUT_MS,
  preferredModelFrom,
} from './routes/caption.js';
import { envGeminiKey } from './geminiKey.js';
import { splitSentences } from './sentences.js';

/**
 * Repurpose engine: one long recording's transcript in, several standalone shorts out.
 *
 * The moment finding is deterministic and needs no model — it is pure arithmetic over the
 * transcript's own segments, so the timecodes it reports are the ones the words actually sit at.
 * Only the writing (hook, beats, caption, card line) goes to an engine, in a single call for the
 * whole job, and every field has a local fallback so a saturated API still leaves the creator with
 * something usable and an honest label saying so.
 */

export interface TranscriptSegment {
  id?: number;
  start: string | number;
  end: string | number;
  text: string;
}

export interface Moment {
  index: number;
  start: number;
  end: number;
  excerpt: string;
  score: number;
}

export interface RepurposeBeat {
  label: string;
  time: string;
  body: string;
}

export interface RepurposeClip {
  id: string;
  start: number;
  end: number;
  startLabel: string;
  endLabel: string;
  spanSeconds: number;
  score: number;
  title: string;
  hook: string;
  excerpt: string;
  beats: RepurposeBeat[];
  caption: string;
  cardHeadline: string;
  platform: string;
  status: 'draft' | 'saved' | 'shipped';
}

export interface RepurposeEngineResult {
  clips: RepurposeClip[];
  engineModel: string;
  engineSource: 'engine' | 'local';
}

/** SRT "HH:MM:SS,mmm" or a plain number of seconds, to seconds. */
export function toSeconds(value: string | number): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
  const m = raw.match(/^(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/) || raw.match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const parts = m.slice(1).map((p) => Number(p) || 0);
  const [h, min, s, ms = 0] = parts.length === 4 ? parts : [...parts, 0];
  return h * 3600 + min * 60 + s + ms / 1000;
}

export function formatTimecode(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const SIGNALS: { pattern: RegExp; weight: number }[] = [
  { pattern: /\?/g, weight: 12 },
  { pattern: /\b(why|how|what if|should you)\b/gi, weight: 9 },
  { pattern: /\b(stop|don't|never|quit|avoid)\b/gi, weight: 10 },
  { pattern: /\b(here'?s|the trick|the reason|the mistake|the problem)\b/gi, weight: 11 },
  { pattern: /\b(but|instead|actually|rather than|most people)\b/gi, weight: 8 },
  { pattern: /\b\d{1,3}(\.\d+)?%?\b/g, weight: 6 },
  { pattern: /\b(i did|i ran|i tried|we shipped|i stopped)\b/gi, weight: 9 },
  { pattern: /[!]/g, weight: 4 },
];

/**
 * Score one stretch of transcript as a standalone short. Rewards a self-contained thought: an
 * opening that poses or rejects something, a number or a claim, and a turn of argument.
 */
export function scoreMoment(text: string): number {
  const clean = text.trim();
  if (clean.length < 60) return 0;
  let score = 0;
  for (const { pattern, weight } of SIGNALS) {
    const hits = clean.match(pattern);
    if (hits) score += Math.min(hits.length, 3) * weight;
  }
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length >= 2 && sentences.length <= 7) score += 10;
  const words = clean.split(/\s+/).length;
  if (words >= 35 && words <= 170) score += 12;
  return Math.min(100, score);
}

/** How long a moment may run, in seconds. The Press narrows these; the Studio keeps the defaults. */
export interface MomentRange {
  minSeconds: number;
  maxSeconds: number;
}

const DEFAULT_RANGE: MomentRange = { minSeconds: 18, maxSeconds: 70 };

/**
 * Walk the segments and take up to `count` non-overlapping windows, each scoring on its own. The
 * window is a complete thought rather than a fixed length: it grows until it holds
 * `minSeconds`, stops before it passes `maxSeconds`. Segments without usable times fall back to
 * equal windows over the raw transcript, and the caller is told the timecodes are estimates.
 */
export function findMoments(
  segments: TranscriptSegment[],
  transcript: string,
  count: number,
  range?: MomentRange
): { moments: Moment[]; timecodesExact: boolean } {
  const bounds: MomentRange = range
    ? {
        minSeconds: Math.max(3, Math.round(range.minSeconds)),
        maxSeconds: Math.max(Math.max(3, Math.round(range.minSeconds)) + 1, Math.round(range.maxSeconds)),
      }
    : DEFAULT_RANGE;
  const usable = segments
    .map((s) => ({
      start: toSeconds(s.start),
      end: toSeconds(s.end),
      text: String(s.text || '').trim(),
    }))
    .filter((s): s is { start: number; end: number; text: string } => s.start !== null && s.end !== null)
    .sort((a, b) => a.start - b.start);

  if (usable.length >= 2) {
    const windows: Moment[] = [];
    let from = 0;
    while (from < usable.length) {
      let to = from;
      let span = 0;
      while (to + 1 < usable.length && usable[to + 1].end - usable[from].start < bounds.maxSeconds) to += 1;
      span = usable[to].end - usable[from].start;
      // Extend until the window is long enough to hold a complete thought.
      while (span < bounds.minSeconds && to + 1 < usable.length) {
        to += 1;
        span = usable[to].end - usable[from].start;
      }
      const text = usable
        .slice(from, to + 1)
        .map((u) => u.text)
        .join(' ')
        .trim();
      windows.push({
        index: windows.length,
        start: usable[from].start,
        end: usable[to].end,
        excerpt: text,
        score: scoreMoment(text),
      });
      from = to + 1;
    }

    const picked: Moment[] = [];
    const sorted = [...windows].sort((a, b) => b.score - a.score);
    for (const w of sorted) {
      if (picked.length >= count) break;
      if (picked.some((p) => !(w.end <= p.start || w.start >= p.end))) continue;
      picked.push(w);
    }
    picked.sort((a, b) => a.start - b.start);
    return {
      moments: picked.map((m, i) => ({ ...m, index: i })),
      timecodesExact: true,
    };
  }

  // No usable segment times: chunk the prose itself and say so.
  const sentences = transcript
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 20);
  const per = Math.max(3, Math.ceil(sentences.length / Math.max(1, count)));
  const moments: Moment[] = [];
  for (let i = 0; i < sentences.length && moments.length < count; i += per) {
    const chunk = sentences.slice(i, i + per).join(' ').trim();
    if (!chunk) continue;
    moments.push({ index: moments.length, start: -1, end: -1, excerpt: chunk, score: scoreMoment(chunk) });
  }
  return { moments, timecodesExact: false };
}

interface EngineCopy {
  title?: string;
  hook?: string;
  caption?: string;
  cardHeadline?: string;
  beats?: { label?: string; time?: string; body?: string }[];
}

/** Words that must not end a clipped line, because the phrase reads as broken behind them. */
const DANGLE = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'that', 'this',
  'these', 'those', 'is', 'are', 'was', 'were', 'it', 'as', 'at', 'by', 'from', 'so', 'if', 'not', 'your', 'my',
]);

/** Clip to `max` words without landing on a dangling article or preposition. */
function clipWords(text: string, max: number): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  if (words.length <= max) return words.join(' ');
  const taken = words.slice(0, max);
  while (taken.length > 1 && DANGLE.has(taken[taken.length - 1].toLowerCase().replace(/[^a-z']/g, ''))) {
    taken.pop();
  }
  return taken.join(' ');
}

function firstSentence(excerpt: string): string {
  return (splitSentences(excerpt)[0] || excerpt).replace(/^["'“]+/, '').trim();
}

function localTitle(excerpt: string): string {
  const clipped = clipWords(firstSentence(excerpt), 9).replace(/[.!?]+$/, '');
  return (clipped || 'A moment worth posting').replace(/^\w/, (c) => c.toUpperCase());
}

/** The hook is what the creator actually said first, so the local draft quotes it rather than dressing it up. */
function localHook(excerpt: string): string {
  return clipWords(firstSentence(excerpt), 20);
}

/** Shorten to `budget` characters without landing on a half-word or a dangling article. */
function fitWords(text: string, budget: number): string {
  if (text.length <= budget) return text;
  let out = text.slice(0, Math.max(1, budget - 1));
  const space = out.lastIndexOf(' ');
  if (space > out.length * 0.6) out = out.slice(0, space);
  const words = out.split(/\s+/).filter(Boolean);
  while (words.length > 1 && DANGLE.has(words[words.length - 1].toLowerCase().replace(/[^a-z']/g, ''))) {
    words.pop();
  }
  return `${words.join(' ')}…`;
}

function localCaption(m: Moment, tone: string, platform: string): string {
  const note = `Draft in a ${tone} register — put it in your own voice before posting.`;
  const stamp =
    m.start >= 0 ? `From ${formatTimecode(m.start)}–${formatTimecode(m.end)} in the recording.` : '';
  const limit = platformSpec(platform).captionMax;

  // A draft the destination's own composer would refuse is not a draft. The timecode line is
  // dropped first, then the excerpt shrinks, so even a 280-character platform gets usable copy.
  const build = (withStamp: boolean) => {
    const tail = [withStamp ? stamp : '', note].filter(Boolean);
    const room = Math.min(420, Math.max(40, limit - tail.join('\n\n').length - 2));
    return [fitWords(m.excerpt, room), ...tail].join('\n\n');
  };

  const withStamp = build(true);
  return withStamp.length <= limit ? withStamp : build(false);
}

/**
 * The three beat windows of a moment, stamped as timecodes.
 *
 * Fractions of the real span, not a rounded third multiplied back up: a 68s short divided by three
 * used to end its last beat at 0:69, past both the minute mark and the end of the clip.
 */
function beatWindows(m: Moment): string[] {
  if (!(m.start >= 0 && m.end > m.start)) return ['—', '—', '—'];
  const len = m.end - m.start;
  return [0, 1, 2].map((i) => {
    const from = formatTimecode(m.start + (len * i) / 3);
    const to = formatTimecode(m.start + (len * (i + 1)) / 3);
    return `${from} – ${to}`;
  });
}

function localBeats(m: Moment): RepurposeBeat[] {
  const parts = splitSentences(m.excerpt);
  const [first, second, third] = beatWindows(m);
  return [
    {
      label: 'Beat 1: The claim',
      time: first,
      body: parts[0] || m.excerpt.slice(0, 120),
    },
    {
      label: 'Beat 2: The proof',
      time: second,
      body: parts.slice(1, 3).join(' ') || m.excerpt.slice(120, 260),
    },
    {
      label: 'Beat 3: The turn',
      time: third,
      body: parts.slice(3, 6).join(' ') || 'Land the ask: what the viewer should do next.',
    },
  ];
}

function assemble(m: Moment, copy: EngineCopy | null, tone: string, platform: string): RepurposeClip {
  const windows = beatWindows(m);
  const beats =
    copy?.beats && copy.beats.length >= 3
      ? copy.beats.slice(0, 3).map((b, i) => ({
          label: String(b.label || 'Beat').trim(),
          // A beat the engine left untimed is still inside this moment: stamp it from the real span
          // rather than pasting a generic 0:00–0:30 over a short that runs somewhere else.
          time: String(b.time || '').trim() || windows[i],
          body: String(b.body || '').trim() || m.excerpt.slice(0, 140),
        }))
      : localBeats(m);

  return {
    id: `clip-${m.index}-${Math.round(m.start * 1000)}`,
    start: m.start,
    end: m.end,
    startLabel: m.start >= 0 ? formatTimecode(m.start) : '—:—',
    endLabel: m.end >= 0 ? formatTimecode(m.end) : '—:—',
    spanSeconds: m.end > m.start ? m.end - m.start : 0,
    score: m.score,
    title: (copy?.title || '').trim() || localTitle(m.excerpt),
    hook: (copy?.hook || '').trim() || localHook(m.excerpt),
    excerpt: m.excerpt,
    beats,
    caption: (copy?.caption || '').trim() || localCaption(m, tone, platform),
    cardHeadline: (copy?.cardHeadline || '').trim() || localTitle(m.excerpt),
    platform,
    status: 'draft',
  };
}

export async function buildRepurposeJob(input: {
  transcript: string;
  segments: TranscriptSegment[];
  clipCount: number;
  tone: string;
  brandVoice: string;
  temperature: number;
  model?: string;
  platform?: string;
  /**
   * Moments the caller already picked. The Press supplies the one span it is about to cut, so the
   * words describe the reel instead of a different stretch of the same take.
   */
  moments?: Moment[];
}): Promise<RepurposeEngineResult> {
  const platform = (input.platform || 'instagram').trim() || 'instagram';
  const spec = platformSpec(platform);
  const wanted = Math.max(3, Math.min(8, Math.round(input.clipCount) || 5));
  const moments = input.moments?.length
    ? input.moments.map((m, i) => ({ ...m, index: i }))
    : findMoments(input.segments, input.transcript, wanted).moments;

  if (!moments.length) {
    return { clips: [], engineModel: 'none', engineSource: 'local' };
  }

  const fallback = () => ({
    clips: moments.map((m) => assemble(m, null, input.tone, platform)),
    engineModel: 'local',
    engineSource: 'local' as const,
  });

  const apiKey = envGeminiKey();
  if (!apiKey) return fallback();

  const requested = preferredModelFrom(input.model) ?? DEFAULT_MODEL;
  const models = Array.from(new Set([requested, ...ENGINE_MODELS]));

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'kontentos-studio' } },
    });

    const outline = moments
      .map(
        (m, i) =>
          `SHORT ${i + 1} (at ${m.start >= 0 ? formatTimecode(m.start) : 'unknown'}–${
            m.end >= 0 ? formatTimecode(m.end) : 'unknown'
          }): ${m.excerpt}`
      )
      .join('\n\n');

    const prompt = `You are cutting standalone shorts out of one long recording for a creator who posts on ${spec.label}.
Tone: ${input.tone}.
${input.brandVoice ? `Write as this specific creator, not as a generic strategist:\n${input.brandVoice}\n` : ''}
For EACH short below, using only what the excerpt supports, write:
- title: under 60 characters, specific to this excerpt
- hook: the first thing said on camera, one sentence, must survive being seen alone
- beats: exactly 3 objects { label, time, body } where time is a offset inside the short like "0:00 – 0:08"
- caption: the post text for ${spec.label} — ${spec.captionMax >= 1200 ? '90-220 words' : 'one tight paragraph'} and never more than ${spec.captionMax} characters, which is what that composer refuses past. Start on the same claim, no hashtags-in-a-block, no "game-changer" style filler
- cardHeadline: one line to put on a still card, under 90 characters

Do not invent facts, numbers, or outcomes the excerpt does not contain.

${outline}

Return ONLY a JSON array with one object per short, in the same order, each:
{"title":"","hook":"","beats":[{"label":"","time":"","body":""}],"caption":"","cardHeadline":""}`;

    for (const model of models) {
      let text = '';
      try {
        const res = await engineTimeout(
          ai.models.generateContent({
            model,
            contents: prompt,
            config: { responseMimeType: 'application/json', temperature: input.temperature },
          }),
          MODEL_ATTEMPT_TIMEOUT_MS,
          `Timeout with model ${model}`
        );
        text = res.text?.trim() || '';
      } catch (err: any) {
        const reason = err?.message ? String(err.message) : String(err);
        // A fast refusal (503/429) is worth another engine; a ceiling being hit is not.
        if (isEngineCeiling(reason)) {
          console.warn(`[repurpose] ${model} hit its ceiling — writing locally instead of stacking timeouts:`, reason);
          return fallback();
        }
        console.warn(`[repurpose] ${model} unavailable, trying next engine:`, reason);
        continue;
      }

      const parsed = readEngineJson<any>(text);
      const list: EngineCopy[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.shorts)
          ? parsed.shorts
          : [];
      const usable = list.filter(
        (c) => c && typeof c === 'object' && String(c.title || '').trim() && String(c.hook || '').trim()
      );

      if (!usable.length) {
        console.warn(`[repurpose] ${model} returned no usable shorts, trying next engine.`);
        continue;
      }

      return {
        clips: moments.map((m, i) => assemble(m, usable[i] || null, input.tone, platform)),
        engineModel: model,
        engineSource: 'engine',
      };
    }
  } catch (err) {
    console.warn('[repurpose] engine path failed, writing locally:', err);
  }

  return fallback();
}
