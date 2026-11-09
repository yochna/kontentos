import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateWorkspace, readBench, readSlot, resetWorkspace, workspaceStatus, writeSlot } from './workspace';
import type { WorkspaceRow } from './types';

/**
 * The workspace module is built for a browser: it queues writes behind a window timer, and it adopts
 * what an older build left in localStorage. So the test gives it one — a fake clock, an in-memory
 * storage jar and a fetch that records what was sent — instead of only exercising the parts that
 * happen without either.
 */

const jar = new Map<string, string>();
const calls: { method: string; url: string; body?: any }[] = [];

type Responder = (url: string, init: any) => { status: number; body: any };

let responder: Responder = () => ({ status: 200, body: { success: true, data: null } });

function fakeRow(patch: Partial<WorkspaceRow> = {}): WorkspaceRow {
  return {
    userId: 'u1',
    prefs: null,
    brandKit: null,
    bench: null,
    project: null,
    draft: null,
    updatedAt: '2026-11-06T00:00:00.000Z',
    ...patch,
  };
}

/** The store answering a PATCH with the row it now holds, which is what the real one returns. */
const echoPatch: Responder = (_url, init) =>
  init.method === 'PATCH'
    ? { status: 200, body: { success: true, data: fakeRow(init.body ? JSON.parse(init.body) : {}) } }
    : { status: 200, body: { success: true, data: null } };

beforeEach(() => {
  vi.useFakeTimers();
  jar.clear();
  calls.length = 0;
  responder = () => ({ status: 200, body: { success: true, data: null } });

  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => (jar.has(key) ? jar.get(key)! : null),
      setItem: (key: string, value: string) => jar.set(key, value),
      removeItem: (key: string) => jar.delete(key),
    },
    // Delegated when called, so the fake clock is the one the module ends up using.
    setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle: number) => globalThis.clearTimeout(handle),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: any = {}) => {
      calls.push({ method: init.method ?? 'GET', url, body: init.body ? JSON.parse(init.body) : undefined });
      const { status, body } = responder(url, init);
      return { ok: status < 400, status, json: async () => body };
    }),
  );
});

afterEach(() => {
  resetWorkspace();
  vi.unstubAllGlobals();
  delete (globalThis as any).window;
  vi.useRealTimers();
});

const patches = () => calls.filter((call) => call.method === 'PATCH').map((call) => call.body);

describe('workspace cache', () => {
  it('is empty before the account row arrives', () => {
    expect(readSlot('prefs')).toBeNull();
    expect(readBench()).toEqual({ cutId: '', station: '' });
  });

  it('puts a write in the cache at once, without waiting for the server', () => {
    writeSlot('prefs', { temperature: 0.2 });
    expect(readSlot<Record<string, unknown>>('prefs')).toEqual({ temperature: 0.2 });
  });

  it('merges the lit cut with the station instead of overwriting the half it was not given', () => {
    writeSlot('bench', { cutId: 'vid_1', station: 'smart-editor' });
    writeSlot('bench', { station: 'publish-schedule' });
    expect(readBench()).toEqual({ cutId: 'vid_1', station: 'publish-schedule' });
  });

  it('sends one save for a burst of edits to the same slot', async () => {
    writeSlot('project', { tracks: [1] });
    writeSlot('project', { tracks: [1, 2] });
    writeSlot('project', { tracks: [1, 2, 3] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(patches()).toEqual([{ project: { tracks: [1, 2, 3] } }]);
  });

  it('says saved again once the last send lands, not forever after', async () => {
    const pending: (() => void)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: any = {}) => {
        calls.push({ method: init.method ?? 'GET', url, body: undefined });
        if (init.method === 'PATCH') await new Promise<void>((resolve) => void pending.push(resolve));
        return { ok: true, status: 200, json: async () => ({ success: true, data: null }) };
      }),
    );

    writeSlot('prefs', { temperature: 0.5 });
    await vi.advanceTimersByTimeAsync(400);
    expect(workspaceStatus().state).toBe('saving');

    pending[0]?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(workspaceStatus().state).toBe('saved');
  });

  it('sends each slot on its own clock', async () => {    writeSlot('prefs', { temperature: 0.9 });
    writeSlot('brandKit', { tone: 'Dry & Direct' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(patches()).toEqual(expect.arrayContaining([{ prefs: { temperature: 0.9 } }, { brandKit: { tone: 'Dry & Direct' } }]));
  });

  it('re-queues a save the store could not take', async () => {
    responder = (_url, init) =>
      init.method === 'PATCH' ? { status: 503, body: { error: 'The workspace store is unreachable.' } } : { status: 200, body: { success: true, data: null } };
    writeSlot('prefs', { temperature: 0.3 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(patches().length).toBeGreaterThan(1);
    expect(patches().at(-1)).toEqual({ prefs: { temperature: 0.3 } });
  });

  it('drops a save the server refused on purpose rather than retrying it forever', async () => {
    responder = (_url, init) =>
      init.method === 'PATCH' ? { status: 400, body: { error: 'The prefs slot only holds a plain object.' } } : { status: 200, body: { success: true, data: null } };
    writeSlot('prefs', { temperature: 0.3 });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(patches()).toHaveLength(1);
  });

  it('sends the newest value after an in-flight save, never the one still on the wire', async () => {
    const pending: (() => void)[] = [];
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: any = {}) => {
        calls.push({ method: init.method ?? 'GET', url, body: init.body ? JSON.parse(init.body) : undefined });
        if (init.method === 'PATCH') {
          attempts++;
          if (attempts === 1) await new Promise<void>((resolve) => void pending.push(resolve));
          return { ok: true, status: 200, json: async () => ({ success: true, data: fakeRow(JSON.parse(init.body)) }) };
        }
        return { ok: true, status: 200, json: async () => ({ success: true, data: null }) };
      }),
    );

    writeSlot('prefs', { temperature: 0.1 });
    await vi.advanceTimersByTimeAsync(600);
    writeSlot('prefs', { temperature: 0.9 });
    await vi.advanceTimersByTimeAsync(3600);
    pending.forEach((done) => done());
    await vi.advanceTimersByTimeAsync(1000);

    expect(patches().map((body: any) => body.prefs)).toEqual([{ temperature: 0.1 }, { temperature: 0.9 }]);
    expect(readSlot<Record<string, unknown>>('prefs')).toEqual({ temperature: 0.9 });
  });
});

describe('one-time migration from localStorage', () => {
  it('adopts what this browser holds and uploads it before deleting it', async () => {
    jar.set('kontentos_ai_settings', JSON.stringify({ temperature: 0.4 }));
    jar.set('kontentos_brand_kit', JSON.stringify({ tone: 'Dry & Direct' }));
    jar.set('kontentos_bench_cut', JSON.stringify('vid_9'));
    jar.set('kontentos_bench_station:u1', JSON.stringify('smart-editor'));
    responder = echoPatch;

    await hydrateWorkspace('u1');
    await vi.advanceTimersByTimeAsync(10);

    expect(readSlot<Record<string, unknown>>('prefs')).toEqual({ temperature: 0.4 });
    expect(readSlot<Record<string, unknown>>('brandKit')).toEqual({ tone: 'Dry & Direct' });
    expect(readBench()).toEqual({ cutId: 'vid_9', station: 'smart-editor' });
    expect(patches()).toEqual([
      {
        prefs: { temperature: 0.4 },
        brandKit: { tone: 'Dry & Direct' },
        bench: { cutId: 'vid_9', station: 'smart-editor' },
      },
    ]);
    expect([...jar.keys()]).toEqual([]);
  });

  it('leaves a browser copy alone when the row already holds that slot', async () => {
    jar.set('kontentos_brand_kit', JSON.stringify({ tone: 'Old & Local' }));
    responder = (_url, init) =>
      init.method === 'PATCH'
        ? { status: 200, body: { error: 'nothing should be sent' } }
        : { status: 200, body: { success: true, data: fakeRow({ brandKit: { tone: 'Server wins' } }) } };

    await hydrateWorkspace('u1');
    await vi.advanceTimersByTimeAsync(10);

    expect(readSlot<Record<string, unknown>>('brandKit')).toEqual({ tone: 'Server wins' });
    // The stale copy is dropped and nothing is uploaded: an old browser must not overwrite the account.
    expect(patches()).toHaveLength(0);
    expect([...jar.keys()]).toEqual([]);
  });

  it('keeps the browser copy when the upload cannot be made', async () => {
    jar.set('kontentos_ai_settings', JSON.stringify({ temperature: 0.6 }));
    responder = (_url, init) =>
      init.method === 'PATCH' ? { status: 503, body: { error: 'The workspace store is unreachable.' } } : { status: 200, body: { success: true, data: null } };

    await hydrateWorkspace('u1');
    await vi.advanceTimersByTimeAsync(10);

    expect(readSlot<Record<string, unknown>>('prefs')).toEqual({ temperature: 0.6 });
    // The key stays so the next start tries again: the migration must not delete work on its way to
    // storing it.
    expect(jar.has('kontentos_ai_settings')).toBe(true);
  });

  it('opens the desk on defaults when the server cannot be reached at all', async () => {
    responder = () => {
      throw new Error('offline');
    };
    await expect(hydrateWorkspace('u1')).resolves.toBeUndefined();
    expect(readSlot('prefs')).toBeNull();
  });

  it('clears the desk when a second account signs in here', async () => {
    writeSlot('prefs', { temperature: 0.4 });
    resetWorkspace();
    expect(readSlot('prefs')).toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    // Nothing the first creator typed follows them into the second account's row.
    expect(patches()).toHaveLength(0);
  });
});
