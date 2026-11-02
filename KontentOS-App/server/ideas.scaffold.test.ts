import { describe, expect, it } from 'vitest';
import { generateIdeas, generateScaffoldIdeas } from './ideasEngine';

const INVENTED = /90% of|most creators|10x|high-ticket|viral resonance|4\.2x|battle-tested|\d+ hours a week/i;

describe('the ideas scaffold when no engine answers', () => {
  it('offers structure instead of sentences to publish', () => {
    const cards = generateScaffoldIdeas('Shipping a weekly reel');
    expect(cards).toHaveLength(6);
    const everything = JSON.stringify(cards);

    expect(everything).not.toMatch(INVENTED);
    expect(cards.every((c) => c.blueprint.hook.trim().startsWith('['))).toBe(true);
    expect(cards.every((c) => c.blueprint.beats.every((b) => b.body.startsWith('[')))).toBe(true);
  });

  it('refuses to score a hook nothing read', () => {
    for (const card of generateScaffoldIdeas('any topic')) {
      expect(card.blueprint.hookScore).toBe(0);
      expect(card.metric).toMatch(/Scaffold/);
    }
  });

  it('names the creator’s topic on the cards it hands back', () => {
    const cards = generateScaffoldIdeas('cold email');
    expect(cards.some((c) => c.title.includes('cold email'))).toBe(true);
  });

  it('falls to the scaffold with no key configured, rather than a canned deck', async () => {
    const saved = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = '';
    try {
      const cards = await generateIdeas('cold email');
      expect(cards.every((c) => c.id.startsWith('scaffold-'))).toBe(true);
    } finally {
      process.env.GEMINI_API_KEY = saved ?? '';
    }
  });
});
