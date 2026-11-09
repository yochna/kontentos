import { afterEach, describe, expect, it } from 'vitest';
import { copyVoice, readBrandKit, saveBrandKit, voiceBrief, voiceTone, type BrandKit } from './brandKit';
import { copyModel, readAiPrefs, readAiSettings, saveAiSettings } from './prefs';
import { resetWorkspace, writeSlot } from './workspace';

const FULL_KIT: BrandKit = {
  voiceArchetype: 'Blunt systems builder',
  tone: 'Dry & Direct',
  catchphrase: 'Ship it ugly.',
  bannedWords: 'game-changer, unlock',
  hooks: ['Curiosity Gap', 'Negative Frame', 'Direct Address', 'Fourth hook that is dropped'],
};

/**
 * The Room switches and the Brand Kit are slots of the account's workspace row now, so a test seeds
 * the cache the same way hydration does — through the module's own write path, not by pretending the
 * browser holds a key.
 */
function withWorkspace(value: { prefs?: unknown; brandKit?: unknown } | null) {
  resetWorkspace();
  if (value === null) return;
  if ('prefs' in value) writeSlot('prefs', value.prefs);
  if ('brandKit' in value) writeSlot('brandKit', value.brandKit);
}

afterEach(() => {
  resetWorkspace();
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
    withWorkspace(null);
    expect(readAiPrefs()).toEqual({ voiceMatch: true, temperature: 0.7 });
  });

  it('reads back exactly what was saved', () => {
    withWorkspace(null);
    saveAiSettings({ aiModel: 'gemini-3.8-flash', temperature: 0.2, autoDraft: false, voiceMatch: false, transcribeOnIngest: true });
    expect(readAiPrefs()).toEqual({ voiceMatch: false, temperature: 0.2 });
    expect(readAiSettings().autoDraft).toBe(false);
    expect(copyModel()).toBe('gemini-3.8-flash');
  });

  it('replaces an engine the server cannot run with the default', () => {
    withWorkspace({ prefs: { aiModel: 'gemini-2.5-flash' } });
    expect(copyModel()).toBe('gemini-3.1-flash-lite');
  });

  it('clamps a broken slider value instead of sending it to the model', () => {
    withWorkspace({ prefs: { temperature: 9 } });
    expect(readAiPrefs().temperature).toBe(1);
    withWorkspace({ prefs: { temperature: 'not a number' } });
    expect(readAiPrefs().temperature).toBe(0.7);
  });

  it('survives a row that holds the wrong shape', () => {
    withWorkspace({ prefs: 'the creator saved a string' });
    expect(readAiPrefs().temperature).toBe(0.7);
    expect(readBrandKit()).toEqual({});
  });

  it('only hands the engine a voice while the switch is on', () => {
    withWorkspace({ prefs: { voiceMatch: true }, brandKit: FULL_KIT });
    expect(copyVoice()).toContain('Blunt systems builder');
    withWorkspace({ prefs: { voiceMatch: false }, brandKit: FULL_KIT });
    expect(copyVoice()).toBe('');
  });

  it('keeps a saved kit as the engines see it', () => {
    withWorkspace(null);
    saveBrandKit(FULL_KIT);
    expect(readBrandKit()).toEqual(FULL_KIT);
  });
});
