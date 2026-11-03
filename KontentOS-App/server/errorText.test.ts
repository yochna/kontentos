import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeMessage } from './errorText.js';

// Real strings this app has to keep out of a response body: the first three come from the
// deployed stack (Atlas + mongoose), the rest from the JSON fallback and Node's own filesystem
// errors. Each is checked twice — that the creator gets the route's sentence, and that nothing
// from the original survives in it.
const DRIVER_MESSAGES: Array<[string, string]> = [
  [
    'MongooseServerSelectionError: Could not connect from server to any hosts in {"hosts":["atlas-shard-00-00.xd9kq.mongodb.net:27017"]}',
    'atlas-shard-00-00',
  ],
  [
    'MongoDBAuthenticationError: Authentication failed for user kontentos_admin on database prod',
    'kontentos_admin',
  ],
  [
    'CastError: Cast to ObjectId failed for value "abc" at path "_id" for model Video, { file: "/app/server/db.ts:517:22" }',
    '/app/server',
  ],
  [
    'Error: EACCES: permission denied, open \'C:\\Users\\PC-ACER\\.data\\kontentos-db.json\'',
    '.data',
  ],
  [
    'FetchError: request to https://generativelanguage.googleapis.com/v1beta?key=AIzaSesecretfragment failed, reason: getaddrinfo ENOTFOUND',
    'generativelanguage',
  ],
];

describe('error text that is allowed to reach a browser', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('replaces every infrastructure message with the route sentence', () => {
    for (const [raw, leak] of DRIVER_MESSAGES) {
      const out = safeMessage(new Error(raw), 'Please try again in a moment.');
      expect(out).toBe('Please try again in a moment.');
      expect(out).not.toContain(leak);
      // Suppressed does not mean lost — the real failure has to stay findable in the log.
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockClear();
    }
  });

  it('passes a sentence written for a creator straight through', () => {
    expect(safeMessage(new Error('That clip is not in your library.'), 'fallback')).toBe(
      'That clip is not in your library.',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('collapses anything too long to keep it, so a dump never rides inside a valid-looking message', () => {
    const long = 'Upload failed. ' + 'x'.repeat(400);
    expect(safeMessage(new Error(long), 'fallback')).toBe('fallback');
  });

  it('treats a non-Error throw, and one with no message, as nothing worth saying', () => {
    expect(safeMessage('boom', 'fallback')).toBe('boom');
    expect(safeMessage({ status: 500 }, 'fallback')).toBe('fallback');
    expect(safeMessage(new Error(''), 'fallback')).toBe('fallback');
    expect(safeMessage(undefined, 'fallback')).toBe('fallback');
  });

  it('collapses a multi-line driver trace', () => {
    const traced =
      'MongoServerError: invalid connection state\n    at Connection._handshake (node:internal/tls:1001:15)\n    at async reconfigure (/app/server/db.ts:470:12)';
    expect(safeMessage(new Error(traced), 'Storage is unavailable.')).toBe('Storage is unavailable.');
  });
});
