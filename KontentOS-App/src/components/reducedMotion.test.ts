import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion } from '@/components/ui';

// Every entrance, tilt and shimmer in the app routes through this one function, so its two
// non-browser paths are worth pinning: no window, and a browser without matchMedia.
describe('prefersReducedMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is false when there is no window at all', () => {
    vi.stubGlobal('window', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is false when matchMedia is missing', () => {
    vi.stubGlobal('window', {});
    expect(prefersReducedMotion()).toBe(false);
  });

  it('follows the media query, and only for reduce motion', () => {
    const queries: string[] = [];
    vi.stubGlobal(
      'window',
      new Proxy({ matchMedia: (q: string) => { queries.push(q); return { matches: q.includes('reduce') }; } }, {}),
    );
    expect(prefersReducedMotion()).toBe(true);
    expect(queries[0]).toBe('(prefers-reduced-motion: reduce)');
  });
});
