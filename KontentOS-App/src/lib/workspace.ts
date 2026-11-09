/**
 * The creator's desk, held in memory and kept in the account's workspace row on the server.
 *
 * Everything the bench used to pin to localStorage lives here instead: the Room switches, the Brand
 * Kit, which cut is lit, which station was last open, the timeline being edited and the draft in
 * progress. In a browser those five keys were the whole archive of someone's work, and clearing site
 * data — or opening the studio on a laptop the next morning — emptied it.
 *
 * The cache is synchronous on purpose. `readAiSettings()` and `readBrandKit()` are called from deep
 * inside the copy engines, and making them await would push a promise into every caller for the sake
 * of one read at start-up. So the row is fetched once, during the store's bootstrap, and
 * `useWorkspaceReady()` says whether that has happened yet. The bench waits on it before drawing a
 * station, which is what keeps a hydrated brand kit from arriving a beat after the engine that needed it.
 *
 * Writes go to the cache immediately and to the server on a debounce, because a creator drags a clip
 * and then drags another: only the last of a burst is worth sending. A save that fails leaves the
 * value queued and retries, and the dock stops claiming the workspace is quiet while it isn't.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import type { WorkspaceBench, WorkspacePatch, WorkspaceRow, WorkspaceSlot } from './types';

/** How long a slot waits for quiet before it is sent. */
const DEBOUNCE_MS: Record<WorkspaceSlot, number> = {
  prefs: 300,
  brandKit: 500,
  bench: 500,
  draft: 700,
  // A timeline is the big one and it changes on every drag. Four seconds of quiet, and never more
  // than twenty seconds since the first unsent edit, so a long session still checkpoints as it goes.
  project: 4000,
};

/** The longest a slot may sit queued, however busy the editor is. */
const MAX_QUEUED_MS: Record<WorkspaceSlot, number> = {
  prefs: 2000,
  brandKit: 3000,
  bench: 3000,
  draft: 5000,
  project: 20000,
};

const EMPTY_BENCH: WorkspaceBench = { cutId: '', station: '' };

type SlotState = Omit<WorkspaceRow, 'userId' | 'updatedAt'>;

const EMPTY_STATE: SlotState = { prefs: null, brandKit: null, bench: null, project: null, draft: null };

let state: SlotState = { ...EMPTY_STATE };
let ready = false;
let status = { state: 'saved' as 'saved' | 'saving' | 'unsaved', message: '' };

const stateListeners = new Set<() => void>();
const statusListeners = new Set<() => void>();

function notifyState() {
  for (const listener of stateListeners) listener();
}

/** Kept as one frozen object because useSyncExternalStore compares snapshots by identity. */
function setStatus(next: 'saved' | 'saving' | 'unsaved', message = '') {
  if (status.state === next && status.message === message) return;
  status = Object.freeze({ state: next, message });
  for (const listener of statusListeners) listener();
}

const hasBrowser = () => typeof window !== 'undefined';

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The stored value for a slot, or null when the creator has never set one. */
export function readSlot<T extends object>(slot: WorkspaceSlot): T | null {
  return (state[slot] as T | null) ?? null;
}

export function readBench(): WorkspaceBench {
  return state.bench ?? EMPTY_BENCH;
}

export function workspaceReady(): boolean {
  return ready;
}

function subscribeState(listener: () => void) {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

function subscribeStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

/** False until the account's workspace row has been read, successfully or not. */
export function useWorkspaceReady(): boolean {
  return useSyncExternalStore(subscribeState, workspaceReady, () => false);
}

/** Whether the desk is safely on the server, for the dock and the status panels. */
export function useWorkspaceStatus(): { state: 'saved' | 'saving' | 'unsaved'; message: string } {
  return useSyncExternalStore(subscribeStatus, workspaceStatus, workspaceStatus);
}

/** The same snapshot the dock reads — identity-stable, so it is safe as a store snapshot. */
export function workspaceStatus() {
  return status;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

const queued = new Map<WorkspaceSlot, unknown>();
const queuedSince = new Map<WorkspaceSlot, number>();
const timers = new Map<WorkspaceSlot, number>();
/** The value currently on the wire, so a second burst re-queues instead of being lost. */
const inFlight = new Map<WorkspaceSlot, unknown>();

/**
 * Remember the new value now, send it after the burst. The cache changes first, so every synchronous
 * reader — the copy engines, the rail, the desk panels — sees the creator's own edit immediately.
 * The bench is the one slot written in halves: lighting a cut and remembering a station are separate
 * code paths, so a partial bench merges with what the cache already holds instead of erasing the
 * other half.
 */
export function writeSlot(slot: WorkspaceSlot, value: unknown): void {
  const stored = slot === 'bench' && value ? { ...readBench(), ...(value as WorkspaceBench) } : value;
  state = { ...state, [slot]: stored as SlotState[WorkspaceSlot] };
  notifyState();
  if (!hasBrowser()) return;
  queued.set(slot, stored);
  queuedSince.set(slot, Date.now());
  armTimer(slot);
}

function armTimer(slot: WorkspaceSlot) {
  const waited = Date.now() - (queuedSince.get(slot) ?? Date.now());
  const delay = Math.max(0, Math.min(DEBOUNCE_MS[slot], MAX_QUEUED_MS[slot] - waited));
  const existing = timers.get(slot);
  if (existing !== undefined) window.clearTimeout(existing);
  timers.set(
    slot,
    window.setTimeout(() => {
      timers.delete(slot);
      void sendSlot(slot);
    }, delay),
  );
}

/**
 * Put one slot on the wire. A slot already being sent is not sent twice: the newer value stays
 * queued and goes out as soon as the answer lands, so two bursts can never arrive out of order and
 * leave the store holding the older one.
 */
async function sendSlot(slot: WorkspaceSlot, keepalive = false): Promise<void> {
  if (inFlight.has(slot) || !queued.has(slot)) return;
  const value = queued.get(slot);
  queued.delete(slot);
  queuedSince.delete(slot);
  inFlight.set(slot, value);
  setStatus('saving');
  try {
    const row = await api.patchWorkspace({ [slot]: value } as WorkspacePatch, keepalive);
    applyRow(row);
    // Cleared before the status is read: this send's own entry is not a reason to still say saving.
    inFlight.delete(slot);
    if (queued.size) armTimer(slot);
    setStatus(queued.size || inFlight.size ? 'saving' : 'saved');
  } catch (err: any) {
    // A 400 is this payload, not the connection: the server will refuse it every time, so keeping
    // it queued and retrying would only burn the save budget on a write that cannot land.
    const refused = Number(err?.status) === 400;
    if (!refused && !keepalive) {
      queued.set(slot, value);
      armTimer(slot);
    }
    setStatus('unsaved', refused ? String(err?.message || 'The server refused that save.') : 'Could not reach the workspace store.');
  } finally {
    inFlight.delete(slot);
  }
}

/** Send everything outstanding without waiting. The tab is closing, or the creator left the bench. */
export function flushWorkspace(): void {
  if (!hasBrowser()) return;
  for (const [slot, handle] of timers) {
    window.clearTimeout(handle);
    timers.delete(slot);
  }
  // keepalive is the reason this exists: an ordinary fetch is cancelled the moment the document goes
  // away, which is exactly when the last edit needs saving.
  for (const slot of [...queued.keys()]) void sendSlot(slot, true);
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

function applyRow(row: WorkspaceRow | null) {
  if (!row) return;
  state = {
    prefs: row.prefs ?? null,
    brandKit: row.brandKit ?? null,
    bench: row.bench ?? null,
    project: row.project ?? null,
    draft: row.draft ?? null,
  };
}

const LEGACY_KEYS: Record<Exclude<WorkspaceSlot, 'bench'>, string> = {
  prefs: 'kontentos_ai_settings',
  brandKit: 'kontentos_brand_kit',
  project: 'kontentos_working_project',
  draft: 'kontentos_active_draft',
};

const LEGACY_CUT_KEY = 'kontentos_bench_cut';
const LEGACY_STATION_PREFIX = 'kontentos_bench_station:';

function legacyRead<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function legacyDrop(keys: string[]) {
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* a browser that will not let us clean up has already had its data uploaded */
    }
  }
}

/**
 * What this browser still holds that the stored row does not, and the keys that hold it.
 *
 * Only absent slots are adopted. A slot the row already has is left to the row and the local copy is
 * dropped, because the two cannot be told apart by age: this browser's timeline could be an edit a
 * failed save lost, or a week-old copy of work the creator went on to finish elsewhere. The row wins
 * — and a save that failed has already said so on the dock, while silently overwriting another
 * device's newer work would not have said anything at all.
 */
function collectLegacy(row: WorkspaceRow | null, account: string): { patch: WorkspacePatch; keys: string[] } {
  const patch: WorkspacePatch = {};
  const keys: string[] = [];

  for (const slot of Object.keys(LEGACY_KEYS) as (keyof typeof LEGACY_KEYS)[]) {
    const key = LEGACY_KEYS[slot];
    const value = legacyRead<Record<string, unknown>>(key);
    if (value === null) continue;
    keys.push(key);
    if (!row || !row[slot]) patch[slot] = value;
  }

  const cut = legacyRead<string>(LEGACY_CUT_KEY);
  const station = legacyRead<string>(`${LEGACY_STATION_PREFIX}${account}`);
  if (typeof cut === 'string') keys.push(LEGACY_CUT_KEY);
  if (typeof station === 'string') keys.push(`${LEGACY_STATION_PREFIX}${account}`);
  if (!row?.bench && (typeof cut === 'string' || typeof station === 'string')) {
    patch.bench = { cutId: typeof cut === 'string' ? cut : '', station: typeof station === 'string' ? station : '' };
  }

  return { patch, keys };
}

async function uploadLegacy(patch: WorkspacePatch, keys: string[]) {
  try {
    applyRow(await api.patchWorkspace(patch));
    legacyDrop(keys);
  } catch {
    // The keys stay. The next bootstrap tries again, which is the point: the one thing this
    // migration must never do is delete a creator's work on the way to storing it.
  }
}

/**
 * Read the account's workspace row, adopt whatever this browser still holds from before the move to
 * the database, and open the cache to the bench. Called once, from the store's bootstrap.
 */
export async function hydrateWorkspace(account: string): Promise<void> {
  let row: WorkspaceRow | null;
  try {
    // The free plan cold-starts, and a wake-up can take most of a minute. Aborting early would open
    // the desk on defaults while the account's real work was still on its way.
    row = await api.getWorkspace(AbortSignal.timeout(60_000));
  } catch {
    // The row was not read, so nothing here knows what the account already holds. Adopting this
    // browser's old copies now could overwrite work finished on another device, so they stay put for
    // a start that can actually read the row, and the dock says the desk is not saved.
    ready = true;
    setStatus('unsaved', 'Could not reach the workspace store.');
    notifyState();
    return;
  }
  applyRow(row);
  const { patch, keys } = collectLegacy(row, account);
  for (const [slot, value] of Object.entries(patch)) {
    state = { ...state, [slot as WorkspaceSlot]: value };
  }
  if (Object.keys(patch).length) void uploadLegacy(patch, keys);
  else if (keys.length) legacyDrop(keys);
  ready = true;
  notifyState();
}

/** A second account in the same tab must not inherit the first one's desk. */
export function resetWorkspace(): void {
  for (const [slot, handle] of timers) {
    if (hasBrowser()) window.clearTimeout(handle);
    timers.delete(slot);
  }
  queued.clear();
  queuedSince.clear();
  inFlight.clear();
  state = { ...EMPTY_STATE };
  ready = false;
  setStatus('saved');
  notifyState();
}

function flushOnHide() {
  if (document.visibilityState === 'hidden') flushWorkspace();
}

/**
 * Keep saving while the tab is merely hidden, and force the last edits out when the document is
 * really going away. Returns the unsubscribe.
 */
export function startWorkspaceLifecycle(): () => void {
  if (!hasBrowser()) return () => undefined;
  window.addEventListener('pagehide', flushWorkspace);
  document.addEventListener('visibilitychange', flushOnHide);
  return () => {
    window.removeEventListener('pagehide', flushWorkspace);
    document.removeEventListener('visibilitychange', flushOnHide);
  };
}

/** Mount-time hook for the app shell, so the hide/leave saves hold for the whole session. */
export function useWorkspaceLifecycle(): void {
  useEffect(() => startWorkspaceLifecycle(), []);
}
