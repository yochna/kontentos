import { describe, expect, it } from 'vitest';
import { isUsableCaption, preferredModelFrom } from './routes/caption';

describe('caption output guard', () => {
  it('rejects the model answering the prompt instead of writing the post', () => {
    // Verbatim from a live gemini response that used to be saved as the creator's caption.
    expect(
      isUsableCaption(
        "The transcript provided for this reel is empty. Please provide the spoken dialogue or script content regarding 'metropolis street photography' so I can generate",
      ),
    ).toBe(false);
    expect(isUsableCaption('I am unable to generate copy without more context about the video.')).toBe(false);
    expect(isUsableCaption('As an AI assistant, I would need the transcript to continue writing.')).toBe(false);
  });

  it('rejects anything too short to be a post', () => {
    expect(isUsableCaption('')).toBe(false);
    expect(isUsableCaption('   ')).toBe(false);
    expect(isUsableCaption('Nice!')).toBe(false);
    expect(isUsableCaption(undefined)).toBe(false);
    expect(isUsableCaption(null)).toBe(false);
    expect(isUsableCaption(['an array is not a caption'])).toBe(false);
  });

  it('keeps a real caption, including a creator voice that pushes back', () => {
    expect(
      isUsableCaption(
        "Most street frames fail because you shoot the crowd, not the light. Find your patch, wait for one subject, hold the shutter. 📸 Save this before your next walk.",
      ),
    ).toBe(true);
    // A creator is allowed to say "I can't" — the guard looks for talk about the job, not for emotion.
    expect(
      isUsableCaption("I can't stop shooting this corner. Golden hour hits the glass at 18:40 and the whole block turns amber — go find your own."),
    ).toBe(true);
  });
});

describe('engine choice', () => {
  it('accepts an engine the server can actually run', () => {
    expect(preferredModelFrom('gemini-3.1-flash-lite')).toBe('gemini-3.1-flash-lite');
    expect(preferredModelFrom('gemini-3.8-flash')).toBe('gemini-3.8-flash');
    expect(preferredModelFrom('  gemini-flash-latest  ')).toBe('gemini-flash-latest');
  });

  it('drops a retired or invented engine so the cascade starts from a working one', () => {
    // Names retired between releases stay in browser storage forever; they must not reach the API.
    expect(preferredModelFrom('gemini-2.5-flash')).toBeUndefined();
    expect(preferredModelFrom('gpt-4')).toBeUndefined();
    expect(preferredModelFrom('')).toBeUndefined();
    expect(preferredModelFrom(undefined)).toBeUndefined();
    expect(preferredModelFrom(['gemini-3.8-flash'])).toBeUndefined();
  });
});
