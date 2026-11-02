import { describe, expect, it } from 'vitest';
import { getFallbackScript } from './routes/script';

const INVENTED = /90% of|5 hours|5x faster|battle-tested|most creators|daily creator tools|high-ticket/i;

describe('the script scaffold when no engine answers', () => {
  it('hands over structure, never statistics nobody measured', () => {
    const script = getFallbackScript('Editing a 30s reel in one take', '30s Direct-to-Camera', 'Deadpan', 'street photography');
    const everything = JSON.stringify(script);

    expect(everything).not.toMatch(INVENTED);
    // The only words it can write are the creator's own topic; everything else stays a blank.
    expect(script.script.hook.spokenText).toMatch(/^\[.*\]$/);
    expect(script.script.beats).toHaveLength(3);
    expect(script.script.beats.every((b: any) => b.spokenText.startsWith('['))).toBe(true);
  });

  it('gives no hashtags the creator did not choose', () => {
    const script = getFallbackScript('One take edits', '30s', 'Casual', 'creator tools');
    expect(script.multiFormat.instagram.hashtags).toEqual([]);
    expect(script.multiFormat.youtube.tags).toEqual([]);
  });

  it('keeps the first tweet inside what X will accept', () => {
    const long = 'A really long topic '.repeat(30).trim();
    const script = getFallbackScript(long, '30s', 'Casual', 'niche');
    expect(script.multiFormat.twitterThread[0].length).toBeLessThanOrEqual(280);
    expect(script.multiFormat.youtube.title.length).toBeLessThanOrEqual(100);
  });

  it('says out loud that the lines are the creator to fill', () => {
    const script = getFallbackScript('Any topic', '30s', 'Casual', 'any niche');
    expect(JSON.stringify(script)).toMatch(/KontentOS scaffold/);
  });
});
