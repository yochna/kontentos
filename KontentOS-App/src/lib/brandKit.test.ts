import { afterEach, describe, expect, it } from 'vitest';
import { copyVoice, readBrandKit, voiceBrief, voiceTone, type BrandKit } from './brandKit';
import { copyModel, readAiPrefs, readAiSettings, saveAiSettings } from './prefs';

const FULL_KIT: BrandKit = {
  voiceArchetype: 'Blunt systems builder',
  tone: 'Dry & Direct',
  catchphrase: 'Ship it ugly.',
  bannedWords: 'game-changer, unlock',
  hooks: ['Curiosity Gap', 'Negative Frame', 'Direct Address', 'Fourth hook that is dropped'],
};

const REAL_STORAGE: Record<string, string> = {};
const storage = {
  getItem: (k: string) => REAL_STORAGE[k] ?? null,
  setItem: (k: string, v: string) => {
    REAL_STORAGE[k] = v;
  },
};

function withStorage(value: Record<string, string> | null) {
  Object.assign(REAL_STORAGE, value ?? {});
  if (value === null) for (const k of Object.keys(REAL_STORAGE)) delete REAL_STORAGE[k];
  (globalThis as { localStorage?: unknown }).localStorage = storage;
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
  for (const k of Object.keys(REAL_STORAGE)) delete REAL_STORAGE[k];
});

describe('Brand Kit voice', () => {
  it('writes the filled-in fields and nothing else', () => {
    const brief = voiceBrief(FULL_KIT);
    expect(brief).toContain('Voice archetype: Blunt systems builder');
    expect(brief).toContain('Tone: Dry & Direct');
    expect(brief).toContain('Ship it ugly.');
    expect(brief).toContain('Never use these words or phrases: game-changer, unlock');
    expect(brief).toContain('Curiosity Gap | Negative Frame | Direct Address');
    expect(brief).not.toContain('Fourth hook');
  });

  it('produces an empty brief instead of inventing a persona', () => {
    expect(voiceBrief({})).toBe('');
    expect(voiceBrief({ tone: '   ' })).toBe('');
    expect(readBrandKit()).toEqual({});
  });

  it('keeps the engine default tone only when the creator set none', () => {
    expect(voiceTone({})).toBe('Viral & Punchy');
    expect(voiceTone({ tone: 'Dry & Direct' })).toBe('Dry & Direct');
  });
});

describe('Room station preferences', () => {
  it('falls back to defaults when nothing was saved', () => {
    withStorage({});
    expect(readAiPrefs()).toEqual({ voiceMatch: true, temperature: 0.7 });
  });

  it('reads back exactly what was saved', () => {
    withStorage({});
    saveAiSettings({ aiModel: 'gemini-3.8-flash', temperature: 0.2, autoDraft: false, voiceMatch: false, transcribeOnIngest: true });
    expect(readAiPrefs()).toEqual({ voiceMatch: false, temperature: 0.2 });
    expect(readAiSettings().autoDraft).toBe(false);
    expect(copyModel()).toBe('gemini-3.8-flash');
  });

  it('replaces an engine the server cannot run with the default', () => {
    withStorage({ kontentos_ai_settings: JSON.stringify({ aiModel: 'gemini-2.5-flash' }) });
    expect(copyModel()).toBe('gemini-3.1-flash-lite');
  });

  it('clamps a broken slider value instead of sending it to the model', () => {
    withStorage({ kontentos_ai_settings: JSON.stringify({ temperature: 9 }) });
    expect(readAiPrefs().temperature).toBe(1);
    withStorage({ kontentos_ai_settings: JSON.stringify({ temperature: 'not a number' }) });
    expect(readAiPrefs().temperature).toBe(0.7);
  });

  it('survives corrupted storage', () => {
    withStorage({ kontentos_ai_settings: '{' });
    expect(readAiPrefs().temperature).toBe(0.7);
  });

  it('only hands the engine a voice while the switch is on', () => {
    withStorage({ kontentos_brand_kit: JSON.stringify(FULL_KIT), kontentos_ai_settings: JSON.stringify({ voiceMatch: true }) });
    expect(copyVoice()).toContain('Blunt systems builder');
    withStorage({ kontentos_ai_settings: JSON.stringify({ voiceMatch: false }) });
    expect(copyVoice()).toBe('');
  });
});
