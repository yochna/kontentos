import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkCut, MAX_CUT_SOURCE_BYTES, resolveSpan } from './cut';

const req = (over: Partial<Parameters<typeof checkCut>[0]> = {}) => ({
  fileUrl: '/uploads/vid_test.mp4',
  fileSize: 8 * 1024 * 1024,
  start: 4,
  duration: 20,
  ...over,
});

describe('resolveSpan', () => {
  it('runs to the end of the film when the written span overshoots it', () => {
    expect(resolveSpan(0, 45, 12)).toEqual({ start: 0, endAt: 12, duration: 12, shortOfSpan: true });
  });

  it('keeps a span that fits inside the source', () => {
    expect(resolveSpan(67.5, 112.5, 120)).toEqual({
      start: 67.5,
      endAt: 112.5,
      duration: 45,
      shortOfSpan: false,
    });
  });

  it('takes the span at face value when the record does not know the source length', () => {
    expect(resolveSpan(10, 60, 0)).toEqual({ start: 10, endAt: 60, duration: 50, shortOfSpan: false });
  });

  it('leaves a zero-length span for the gate to refuse instead of padding it', () => {
    expect(resolveSpan(20, 20, 60).duration).toBe(0);
  });
});

describe('checkCut', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('allows a span that sits on a reachable source', async () => {
    await expect(checkCut(req())).resolves.toBeNull();
  });

  it('refuses a span with no length', async () => {
    for (const bad of [{ duration: 0 }, { duration: -3 }, { start: Number.NaN }]) {
      const blocked = await checkCut(req(bad));
      expect(blocked?.code).toBe('bad_span');
    }
  });

  it('refuses a span that starts past the end of the film', async () => {
    const blocked = await checkCut(req({ start: 70, duration: 20, sourceSeconds: 12 }));
    expect(blocked?.code).toBe('span_past_source');
    expect(blocked?.message).toContain('only runs for 12s');
  });

  it('refuses a source too large for a browser read', async () => {
    const blocked = await checkCut(req({ fileSize: MAX_CUT_SOURCE_BYTES + 1 }));
    expect(blocked?.code).toBe('too_large');
    expect(blocked?.message).toContain('400 MB');
  });

  it('reports media that is gone rather than cutting an empty file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 }))
    );
    const blocked = await checkCut(req({ fileSize: 0 }));
    expect(blocked?.code).toBe('media_offline');
    expect(fetch).toHaveBeenCalledWith('/uploads/vid_test.mp4', expect.objectContaining({ method: 'HEAD' }));
  });

  it('sizes an unknown source with a HEAD before reading it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200, headers: { 'content-length': String(2 * 1024 * 1024) } }))
    );
    await expect(checkCut(req({ fileSize: 0 }))).resolves.toBeNull();
  });
});
