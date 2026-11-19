import { describe, expect, it } from 'vitest';
import {
  declaredBytesExceed,
  isAbortFailure,
  isRejectedMediaContentType,
  sizeLimitMessage,
} from './sourcePreflight';

describe('source preflight', () => {
  it('refuses error pages that a proxy may return with HTTP 200', () => {
    expect(isRejectedMediaContentType('image/svg+xml')).toBe(true);
    expect(isRejectedMediaContentType('text/html; charset=utf-8')).toBe(true);
    expect(isRejectedMediaContentType('application/json')).toBe(true);
    expect(isRejectedMediaContentType('video/mp4')).toBe(false);
    expect(isRejectedMediaContentType(null)).toBe(false);
  });

  it('rejects an oversized declared length before reading the body', () => {
    expect(declaredBytesExceed('501', 500)).toBe(true);
    expect(declaredBytesExceed('500', 500)).toBe(false);
    expect(declaredBytesExceed('unknown', 500)).toBe(false);
  });

  it('names the limit in human-readable terms', () => {
    expect(sizeLimitMessage(2 * 1024 * 1024, 1024 * 1024, 'A source')).toMatch(/2 MB.*1 MB/);
  });

  it('recognizes cancellation from a browser abort or an already-aborted signal', () => {
    expect(isAbortFailure(new DOMException('aborted', 'AbortError'))).toBe(true);
    const controller = new AbortController();
    controller.abort();
    expect(isAbortFailure(new Error('other'), controller.signal)).toBe(true);
    expect(isAbortFailure(new Error('other'))).toBe(false);
  });
});
