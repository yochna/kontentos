/**
 * The Brand Kit is edited on its own station and saved to localStorage; the copy engines read it
 * from here. Everything is optional — an empty kit produces an empty brief, so the engines fall
 * back to their default voice instead of inventing one.
 */

import { readAiPrefs } from './prefs';

const KIT_KEY = 'kontentos_brand_kit';

export interface BrandKit {
  voiceArchetype?: string;
  catchphrase?: string;
  bannedWords?: string;
  tone?: string;
  palette?: string[];
  fonts?: string[];
  hooks?: string[];
  avatar?: string;
}

export function readBrandKit(): BrandKit {
  try {
    const raw = localStorage.getItem(KIT_KEY);
    return raw ? (JSON.parse(raw) as BrandKit) : {};
  } catch {
    return {};
  }
}

const clip = (value: unknown, max = 120) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/**
 * A short instruction block for the copy engines: persona, tone, catchphrase, words to avoid.
 * Returns '' when the creator has filled nothing in.
 */
export function voiceBrief(kit: BrandKit = readBrandKit()): string {
  const lines: string[] = [];
  const archetype = clip(kit.voiceArchetype, 80);
  const tone = clip(kit.tone, 80);
  const catchphrase = clip(kit.catchphrase, 100);
  const banned = clip(kit.bannedWords, 160);
  const hooks = (kit.hooks ?? []).map((h) => clip(h, 100)).filter(Boolean).slice(0, 3);

  if (archetype) lines.push(`Voice archetype: ${archetype}`);
  if (tone) lines.push(`Tone: ${tone}`);
  if (catchphrase) lines.push(`Signature line the creator actually uses: "${catchphrase}"`);
  if (banned) lines.push(`Never use these words or phrases: ${banned}`);
  if (hooks.length) lines.push(`Hook shapes that work for this creator: ${hooks.join(' | ')}`);

  return lines.join('\n');
}

/** The tone the creator set, or the engine default when they have not set one. */
export function voiceTone(kit: BrandKit = readBrandKit()): string {
  return clip(kit.tone, 80) || 'Viral & Punchy';
}

/** The kit brief, or '' when the creator turned voice-matching off on the Room station. */
export function copyVoice(): string {
  return readAiPrefs().voiceMatch ? voiceBrief() : '';
}
