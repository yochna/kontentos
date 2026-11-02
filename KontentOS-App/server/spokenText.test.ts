import { describe, expect, it } from 'vitest';
import { isEmptySpeechEnvelope, isSpokenTextUsable } from './spokenText';

describe('what may be stored as something the creator said', () => {
  it('refuses the empty envelope a model returns when the take is silent', () => {
    const empty = { language: 'English', transcript: '', srt: '', segments: [] };
    expect(isEmptySpeechEnvelope(empty)).toBe(true);
    // Used to fall through and store this JSON, quotes and all, as the clip's transcript.
    expect(isSpokenTextUsable(JSON.stringify(empty))).toBe(false);
  });

  it('keeps an envelope that actually carries speech', () => {
    expect(isEmptySpeechEnvelope({ transcript: 'Golden hour hits the glass.', srt: '', segments: [] })).toBe(false);
    expect(isEmptySpeechEnvelope({ transcript: '', srt: '1\n00:00:00,000 --> 00:00:02,000\nHello\n', segments: [] })).toBe(false);
    expect(isEmptySpeechEnvelope({ transcript: '', srt: '', segments: [{ text: 'Hello' }] })).toBe(false);
    expect(isEmptySpeechEnvelope({ not: 'a speech answer' })).toBe(false);
  });

  it('refuses an engine apologising about the job', () => {
    for (const answer of [
      'I could not find any speech in this video.',
      'There is no audio track to transcribe.',
      'The audio appears silent.',
      'Unable to transcribe the provided file.',
    ]) {
      expect(isSpokenTextUsable(answer)).toBe(false);
    }
  });

  it('refuses the scaffold echoed back from the prompt', () => {
    expect(isSpokenTextUsable('[your opening line about street photography]')).toBe(false);
    expect(isSpokenTextUsable('[{"id":1}]')).toBe(false);
  });

  it('keeps real spoken sentences, including a creator who says they cannot', () => {
    expect(isSpokenTextUsable('Golden hour hits the glass at 18:40 and the whole block turns amber.')).toBe(true);
    expect(isSpokenTextUsable("I can't stop shooting this corner.")).toBe(true);
    expect(isSpokenTextUsable('Two words.')).toBe(true);
    expect(isSpokenTextUsable('')).toBe(false);
    expect(isSpokenTextUsable(undefined)).toBe(false);
  });
});
