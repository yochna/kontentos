import type { Idea } from '@/data/mock';
import type { User, Video } from './types';

/**
 * The Ideas station suggests the creator's own subjects, not a generic trend list. The niche typed in Room is
 * the strongest signal; saved ideas and uploaded clips are the next best thing the app actually
 * knows about. Nothing here invents a topic, and the Ideas screen only reaches for neutral starter
 * prompts when this list is empty.
 */

const MAX_TOPICS = 6;

const LEADING_NOISE = /^(how to|why|the|a|an|my|our)\s+/i;
const TRAILING_FORMAT = /\s*[·|—–-]\s*(reel|short|video|carousel|post|episode|part|sec|s)\b.*$/i;
const TRAILING_NUMBER = /\s*#?\d+\s*$/;
const PLACEHOLDER = /^\[[^\]]+\]\s*/;
const GENERIC_FILE = /^(img|vid|dsc|mov|screen(?:shot| recording)?)[\s_-]?\d+$/i;
const COPY_SUFFIX = /\s*\(\d+\)\s*$/;

/** A run of digits and punctuation is a filename, never a subject the creator can make a reel about. */
function hasRealWords(text: string): boolean {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const digits = text.match(/\d/g)?.length ?? 0;
  return letters >= 3 && digits <= letters * 2;
}

function tidy(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let text = raw.replace(/\s+/g, ' ').trim();
  text = text.replace(PLACEHOLDER, '').replace(LEADING_NOISE, '');
  text = text.replace(TRAILING_FORMAT, '').replace(TRAILING_NUMBER, '');
  // Raw uploads often arrive as IMG_2049.mp4 or 81496-576306063 (1). Neither is a subject.
  text = text
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(COPY_SUFFIX, '')
    .replace(/[.,;:!?]+$/g, '')
    .trim();
  if (text.length < 3 || GENERIC_FILE.test(text) || !hasRealWords(text)) return '';
  return text.length > 48 ? `${text.slice(0, 47).trimEnd()}…` : text;
}

export interface CreatorTopicInput {
  user?: User | null;
  savedIdeas?: Idea[];
  videos?: Video[];
}

/** Niche first, then the subjects already in the creator's archive — de-duplicated and capped. */
export function creatorTopics({ user, savedIdeas = [], videos = [] }: CreatorTopicInput): string[] {
  const topics: string[] = [];
  const seen = new Set<string>();
  const add = (raw: unknown) => {
    const value = tidy(raw);
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    topics.push(value);
  };

  add(user?.niche);
  for (const idea of savedIdeas) {
    add(idea.title);
    add(idea.blueprint?.focus);
  }
  for (const video of videos) {
    add(video.title);
    add(video.description);
  }

  return topics.slice(0, MAX_TOPICS);
}

/**
 * Extra context for the generation engine. `copyVoice()` carries the voice brief when voice-matching
 * is on; this carries *what* the creator makes, so a generated angle still belongs to them.
 */
export function creatorBrief(topics: string[], user?: User | null): string {
  const lines: string[] = [];
  const niche = typeof user?.niche === 'string' ? user.niche.trim().slice(0, 120) : '';
  if (niche) lines.push(`Creator niche: ${niche}`);
  if (topics.length) {
    lines.push(`Subjects this creator already makes: ${topics.slice(0, 5).join(', ')}`);
    lines.push('Keep every idea tied to those subjects and to making content; do not drift into generic industry trends.');
  }
  return lines.join('\n');
}
