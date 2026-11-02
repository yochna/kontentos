import { describe, expect, it, beforeAll, afterEach, vi } from 'vitest';

// The engine's attempt loop is what decides whether a saturated API costs the creator 15 seconds
// or 45, so it is tested against a fake Google client instead of a live one.
const engine = vi.hoisted(() => ({
  attempted: [] as string[],
  behavior: 'timeout' as 'timeout' | 'busy' | 'empty',
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async ({ model }: { model: string }) => {
        engine.attempted.push(model);
        if (engine.behavior === 'timeout') {
          // Exactly what engineTimeout rejects with, which engine.test.ts already covers.
          throw new Error(`Timeout with model ${model}`);
        }
        if (engine.behavior === 'busy') throw new Error('This model is currently experiencing high demand.');
        return { text: 'not json at all' };
      },
    };
  },
}));

import { buildRepurposeJob, findMoments, formatTimecode, scoreMoment, toSeconds } from './repurposeEngine.js';
import type { TranscriptSegment } from './repurposeEngine.js';

beforeAll(() => {
  // The engine must answer from its own arithmetic when there is no API key, which is exactly
  // the branch these tests cover.
  process.env.GEMINI_API_KEY = '';
});

afterEach(() => {
  engine.attempted = [];
  engine.behavior = 'timeout';
  process.env.GEMINI_API_KEY = '';
});

describe('toSeconds', () => {
  it('reads SRT and VTT stamps', () => {
    expect(toSeconds('00:01:12,500')).toBeCloseTo(72.5, 3);
    expect(toSeconds('00:01:12.500')).toBeCloseTo(72.5, 3);
    expect(toSeconds('01:02:03')).toBe(3723);
    expect(toSeconds('00:00:00,000')).toBe(0);
  });

  it('reads plain seconds in either type', () => {
    expect(toSeconds('45')).toBe(45);
    expect(toSeconds('45.25')).toBe(45.25);
    expect(toSeconds(30)).toBe(30);
  });

  it('returns null instead of a wrong number', () => {
    expect(toSeconds('')).toBeNull();
    expect(toSeconds('   ')).toBeNull();
    expect(toSeconds('not a time')).toBeNull();
    expect(toSeconds('00:01')).toBeNull();
    expect(toSeconds(Number.NaN)).toBeNull();
  });
});

describe('formatTimecode', () => {
  it('prints MM:SS and never a negative', () => {
    expect(formatTimecode(0)).toBe('00:00');
    expect(formatTimecode(75)).toBe('01:15');
    expect(formatTimecode(600)).toBe('10:00');
    expect(formatTimecode(-5)).toBe('00:00');
    expect(formatTimecode(59.6)).toBe('01:00');
  });
});

describe('scoreMoment', () => {
  const flat =
    'So yeah we just kept going with it for a while and nothing particularly notable happened during that stretch of the week at all.';
  const sharp =
    "Why does most content flop? Stop publishing first drafts. Here's the mistake I made for two years: I shipped 40 posts, got 3 replies, and called it growth. Actually the problem was the hook.";

  it('gives a non-thought no score', () => {
    expect(scoreMoment('too short to be a short')).toBe(0);
    expect(scoreMoment('')).toBe(0);
  });

  it('prefers the stretch that poses, rejects and quantifies', () => {
    expect(scoreMoment(sharp)).toBeGreaterThan(scoreMoment(flat));
  });

  it('gives narration that contains no moment no score at all', () => {
    expect(scoreMoment(flat)).toBe(0);
  });

  it('is capped', () => {
    expect(scoreMoment(`${sharp} ${sharp} ${sharp} ${sharp}?`)).toBeLessThanOrEqual(100);
  });
});

function segmentSet(count: number, secondsEach = 10): TranscriptSegment[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    start: formatSrt(i * secondsEach),
    end: formatSrt((i + 1) * secondsEach),
    text: `Take ${i}: ${i % 3 === 0 ? "Why does this keep happening? Stop and look at the number — 42% of attempts fail here. Here's the reason it repeats." : 'and then we carried on with the next part of the run without much to say about it at all.'}`,
  }));
}

function formatSrt(seconds: number): string {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  return `${h}:${m}:${s},000`;
}

describe('findMoments', () => {
  it('cuts timed windows that stand alone and do not overlap', () => {
    const transcript = segmentSet(30).map((s) => s.text).join(' ');
    const { moments, timecodesExact } = findMoments(segmentSet(30), transcript, 3);

    expect(timecodesExact).toBe(true);
    expect(moments).toHaveLength(3);
    moments.forEach((m, i) => {
      expect(m.index).toBe(i);
      expect(m.end - m.start).toBeGreaterThanOrEqual(18);
      expect(m.end - m.start).toBeLessThanOrEqual(70);
      expect(m.excerpt.length).toBeGreaterThan(20);
      if (i > 0) expect(m.start).toBeGreaterThanOrEqual(moments[i - 1].end);
    });
  });

  it('keeps the picked windows in recording order', () => {
    const segments = segmentSet(30);
    const transcript = segments.map((s) => s.text).join(' ');
    const { moments } = findMoments(segments, transcript, 5);
    const starts = moments.map((m) => m.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('falls back to prose chunks and admits the timecodes are unknown', () => {
    const transcript =
      'Why does most content flop? Stop publishing first drafts. Here is the mistake I made for two years. I shipped forty posts and got three replies. Actually the problem was the hook every single time. So we rewrote the first line only. The next month doubled without changing anything else. That is the whole lesson and nothing more is needed here.';
    const { moments, timecodesExact } = findMoments([], transcript, 3);

    expect(timecodesExact).toBe(false);
    expect(moments.length).toBeGreaterThan(0);
    expect(moments.length).toBeLessThanOrEqual(3);
    moments.forEach((m) => {
      expect(m.start).toBe(-1);
      expect(m.end).toBe(-1);
    });
  });

  it('ignores segments whose times cannot be read', () => {
    const broken: TranscriptSegment[] = [
      { start: 'n/a', end: 'n/a', text: 'one stretch of the recording with something to say.' },
      { start: '', end: '', text: 'another stretch of the recording with something else to say here.' },
    ];
    const { moments, timecodesExact } = findMoments(broken, broken.map((s) => s.text).join(' '), 3);
    expect(timecodesExact).toBe(false);
    expect(moments.length).toBeGreaterThan(0);
  });
});

describe('buildRepurposeJob without an engine', () => {
  it('still returns complete, honestly-labelled clips', async () => {
    const segments = segmentSet(30);
    const result = await buildRepurposeJob({
      transcript: segments.map((s) => s.text).join(' '),
      segments,
      clipCount: 4,
      tone: 'dry',
      brandVoice: '',
      temperature: 0.7,
    });

    expect(result.engineSource).toBe('local');
    expect(result.clips.length).toBeGreaterThan(0);
    expect(result.clips.length).toBeLessThanOrEqual(4);
    for (const clip of result.clips) {
      expect(clip.title.trim().length).toBeGreaterThan(0);
      expect(clip.hook.trim().length).toBeGreaterThan(0);
      expect(clip.caption.trim().length).toBeGreaterThan(0);
      expect(clip.cardHeadline.trim().length).toBeGreaterThan(0);
      expect(clip.beats).toHaveLength(3);
      expect(clip.excerpt.length).toBeGreaterThan(20);
      expect(clip.status).toBe('draft');
      expect(clip.id).toBeTruthy();
    }
  });

  it('clamps the requested clip count instead of trusting it', async () => {
    const segments = segmentSet(30);
    const result = await buildRepurposeJob({
      transcript: segments.map((s) => s.text).join(' '),
      segments,
      clipCount: 999,
      tone: 'direct',
      brandVoice: '',
      temperature: 0.7,
    });
    expect(result.clips.length).toBeLessThanOrEqual(8);
  });

  it('reports no clips for a transcript with no thoughts in it', async () => {
    const result = await buildRepurposeJob({
      transcript: '',
      segments: [],
      clipCount: 5,
      tone: 'direct',
      brandVoice: '',
      temperature: 0.7,
    });
    expect(result.clips).toEqual([]);
  });
});

describe('the engine attempt loop', () => {
  const key = 'test-key-for-the-cascade-0123456789';
  const input = {
    transcript: segmentSet(30).map((s) => s.text).join(' '),
    segments: segmentSet(30),
    clipCount: 3,
    tone: 'direct',
    brandVoice: '',
    temperature: 0.7,
  };

  it('stops at the first ceiling instead of stacking three of them', async () => {
    process.env.GEMINI_API_KEY = key;
    engine.behavior = 'timeout';

    const result = await buildRepurposeJob(input);

    expect(result.engineSource).toBe('local');
    // Three 15s ceilings in a row is the 45-second wait this rule exists to prevent.
    expect(engine.attempted).toHaveLength(1);
  });

  it('does try the next engine when one refuses quickly', async () => {
    process.env.GEMINI_API_KEY = key;
    engine.behavior = 'busy';

    const result = await buildRepurposeJob(input);

    expect(result.engineSource).toBe('local');
    expect(engine.attempted.length).toBeGreaterThan(1);
  });

  it('writes locally when an engine answers with something that is not JSON', async () => {
    process.env.GEMINI_API_KEY = key;
    engine.behavior = 'empty';

    const result = await buildRepurposeJob(input);

    expect(result.engineSource).toBe('local');
    expect(result.clips.length).toBeGreaterThan(0);
  });
});

describe('the local draft copy', () => {
  it('never ends a title or a hook on a dangling word', async () => {
    const segments: TranscriptSegment[] = [
      {
        id: 0,
        start: '00:00:00,000',
        end: '00:00:40,000',
        text: 'Fix that stretch and only then write the words around it before you ever think about the caption for the post and what it should say today.',
      },
      {
        id: 1,
        start: '00:00:40,000',
        end: '00:01:20,000',
        text: 'Why does most content flop? Stop publishing first drafts, because the number you actually care about is the reply rate and not the reach.',
      },
    ];
    const result = await buildRepurposeJob({
      transcript: segments.map((s) => s.text).join(' '),
      segments,
      clipCount: 3,
      tone: 'dry',
      brandVoice: '',
      temperature: 0.7,
    });

    expect(result.clips.length).toBeGreaterThan(0);
    for (const clip of result.clips) {
      const lastWord = clip.title.split(/\s+/).pop()?.toLowerCase().replace(/[^a-z']/g, '') || '';
      expect(['a', 'an', 'the', 'and', 'of', 'to', 'for', 'with', 'that', 'is', 'your']).not.toContain(lastWord);
      expect(clip.hook.endsWith(' and')).toBe(false);
      expect(clip.hook).not.toMatch(/\b(a|the|of|and)\s*$/i);
    }
  });

  it('quotes what was said instead of inventing a hook', async () => {
    const segments: TranscriptSegment[] = [
      { id: 0, start: '00:00:00,000', end: '00:00:40,000', text: 'Stop publishing first drafts. The viewer gets four seconds and then a decision about you.' },
      { id: 1, start: '00:00:40,000', end: '00:01:20,000', text: 'Here is the mistake I see founders make: they treat the hook as packaging and not as the argument itself.' },
    ];
    const result = await buildRepurposeJob({
      transcript: segments.map((s) => s.text).join(' '),
      segments,
      clipCount: 3,
      tone: 'dry',
      brandVoice: '',
      temperature: 0.7,
    });
    const clip = result.clips[0];
    expect(clip.hook).toBe('Stop publishing first drafts.');
    expect(clip.title).toBe('Stop publishing first drafts');
    expect(clip.caption).toContain('dry register');
  });

  it('does not print invented offsets for a moment with no timecodes', async () => {
    const transcript =
      'Why does most content flop? Stop publishing first drafts. Here is the mistake I made for two years. ' +
      'I shipped forty posts and got three replies. Actually the problem was the hook every single time. ' +
      'So we rewrote the first line only. The next month doubled without changing anything else at all.';
    const result = await buildRepurposeJob({
      transcript,
      segments: [],
      clipCount: 3,
      tone: 'direct',
      brandVoice: '',
      temperature: 0.7,
    });
    expect(result.clips.length).toBeGreaterThan(0);
    for (const clip of result.clips) {
      expect(clip.beats.every((b) => b.time === '—')).toBe(true);
      expect(clip.spanSeconds).toBe(0);
    }
  });

  it('keeps a draft inside the ceiling of the composer it was written for', async () => {
    const transcript =
      'Why does most content flop? Stop publishing first drafts, because the number you actually care ' +
      'about is the reply rate and not the reach, and reach is the vanity metric that keeps founders ' +
      'publishing work nobody finishes reading. Here is the mistake I made for two years: I shipped ' +
      'forty posts and got three replies, and I called that a growth problem when it was a hook ' +
      'problem every single time. So we rewrote only the first line of the same forty posts. The next ' +
      'month the reach doubled without changing the idea, the offer, or the audience at all. Never ' +
      'judge a piece by how it felt to write, judge it by how many people stayed to the final frame.';
    const build = (platform: string) =>
      buildRepurposeJob({
        transcript,
        segments: [],
        clipCount: 3,
        tone: 'direct',
        brandVoice: '',
        temperature: 0.7,
        platform,
      });

    const short = await build('x');
    expect(short.clips.length).toBeGreaterThan(0);
    for (const clip of short.clips) {
      expect(clip.platform).toBe('x');
      expect(clip.caption.length).toBeLessThanOrEqual(280);
      // The timecode line is the first thing dropped: the words are the draft, the stamp is not.
      expect(clip.caption).toContain('direct register');
      // Shrinking to fit must not stop on a half-word or a dangling article.
      expect(clip.caption.split('\n\n')[0]).not.toMatch(/\b(a|the|of|and|to|for|with|that|is|your)[\s…]*$/i);
    }

    const long = await build('instagram');
    for (const clip of long.clips) {
      expect(clip.caption.length).toBeLessThanOrEqual(2200);
    }
  });
});
