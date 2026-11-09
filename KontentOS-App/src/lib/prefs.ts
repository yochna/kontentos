/**
 * The switches on the Room station (Settings). These are the readers the engines use, so a saved
 * preference actually changes what the app does. Anything not read here is still decoration and the
 * Room station says so.
 *
 * They used to be a localStorage key, which meant a creator's chosen engine and their voice settings
 * lived and died in one browser. Now they are the `prefs` slot of the account's workspace row, read
 * synchronously from the cache the bootstrap fills — see src/lib/workspace.ts.
 */

import { readSlot, writeSlot } from './workspace';

export interface AiPrefs {
  voiceMatch: boolean;
  temperature: number;
}

export interface AiSettings extends AiPrefs {
  aiModel: string;
  autoDraft: boolean;
  transcribeOnIngest: boolean;
}

/**
 * The engines the server will actually try. The list mirrors the cascade in server/routes/caption.ts
 * — the 2.5/1.5/2.0 names that used to sit in this dropdown are retired and answer 404, so offering
 * them would only let a creator pick an engine that cannot run.
 */
export const MODEL_CHOICES = [
  { id: 'gemini-3.1-flash-lite', label: 'Flash Lite — fastest, answers under load' },
  { id: 'gemini-3.8-flash', label: 'Flash — richer, can be unavailable under load' },
  { id: 'gemini-flash-latest', label: 'Flash Latest — whatever Google ships as current' },
] as const;

const DEFAULTS: AiSettings = {
  aiModel: 'gemini-3.1-flash-lite',
  temperature: 0.7,
  autoDraft: true,
  voiceMatch: true,
  transcribeOnIngest: true,
};

function clampTemperature(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

export function readAiSettings(): AiSettings {
  const saved = readSlot<Partial<AiSettings>>('prefs');
  if (!saved) return DEFAULTS;
  const model = MODEL_CHOICES.some((m) => m.id === saved.aiModel)
    ? saved.aiModel!
    : DEFAULTS.aiModel;
  return {
    aiModel: model,
    temperature: clampTemperature(saved.temperature, DEFAULTS.temperature),
    autoDraft: saved.autoDraft ?? DEFAULTS.autoDraft,
    voiceMatch: saved.voiceMatch ?? DEFAULTS.voiceMatch,
    transcribeOnIngest: saved.transcribeOnIngest ?? DEFAULTS.transcribeOnIngest,
  };
}

export function readAiPrefs(): AiPrefs {
  const { voiceMatch, temperature } = readAiSettings();
  return { voiceMatch, temperature };
}

/** The engine the creator picked, sent to the server as its first candidate. */
export function copyModel(): string {
  return readAiSettings().aiModel;
}

/** The same engine in the few words a panel can print next to a Write button. */
export function copyModelLabel(): string {
  const choice = MODEL_CHOICES.find((m) => m.id === copyModel());
  return choice ? choice.label.split(' — ')[0] : copyModel();
}

export function saveAiSettings(next: AiSettings): void {
  writeSlot('prefs', next);
}
