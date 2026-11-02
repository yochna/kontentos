import { describe, expect, it } from 'vitest';
import { generateMultiPlatformCopy } from './publishEngine';

describe('the offline copy scaffold', () => {
  const bundle = generateMultiPlatformCopy('Pricing with teeth', 'I quoted the same number twice and lost both deals.');

  it('writes nothing the creator did not say', () => {
    const all = JSON.stringify(bundle);
    // The phrases that used to be invented from a title alone and posted under the creator’s name.
    expect(all).not.toMatch(/90% of creators/i);
    expect(all).not.toMatch(/viral creator blueprint/i);
    expect(all).not.toMatch(/Stop spending 4 hours/i);
    expect(all).not.toMatch(/high-signal insights/i);
    expect(bundle.instagram.hashtags).toEqual([]);
    expect(bundle.linkedin.hashtags).toEqual([]);
  });

  it('keeps the creator’s own line as the lead and marks every gap as a blank', () => {
    expect(bundle.instagram.caption).toContain('I quoted the same number twice and lost both deals.');
    expect(bundle.instagram.caption).toMatch(/\[[^\]]+\]/);
    expect(bundle.instagram.caption).toMatch(/scaffold/i);
  });

  it('fits the platforms that refuse long posts', () => {
    for (const tweet of bundle.x.thread) expect(tweet.length).toBeLessThanOrEqual(280);
    expect(bundle.youtube.title.length).toBeLessThanOrEqual(100);
  });

  it('still scaffolds a job with no title and no hook', () => {
    const bare = generateMultiPlatformCopy('');
    expect(bare.instagram.caption).toMatch(/\[the hook/);
    expect(bare.linkedin.slideOutline.length).toBeGreaterThan(0);
  });
});
