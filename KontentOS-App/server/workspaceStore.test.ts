import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { localDataDir } from './db.js';
import { RefusedWorkspaceWrite, getWorkspace, patchWorkspace } from './workspaceStore.js';

// Runs against the JSON fallback (vitest.config.ts blanks MONGODB_URI) in its own directory, the
// same way the repurpose store does: the local store is one whole-file read-modify-write.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kontentos-workspace-test-'));
process.env.KONTENTOS_DATA_DIR = dataDir;

const OWNER = 'user_owner';
const OTHER = 'user_someone_else';

const LOCAL_FILE = 'kontentos-workspace.json';

beforeEach(() => {
  fs.rmSync(path.join(dataDir, LOCAL_FILE), { force: true });
});

describe('workspace store', () => {
  it('writes into the directory the core store already uses', () => {
    expect(localDataDir()).toBe(path.resolve(dataDir));
  });

  it('says nothing has been saved until the creator saves something', async () => {
    expect(await getWorkspace(OWNER)).toBeNull();
  });

  it('saves a slot and reads the whole row back', async () => {
    const row = await patchWorkspace(OWNER, { prefs: { aiModel: 'gemini-3.1-flash-lite', temperature: 0.2 } });
    expect(row.prefs).toEqual({ aiModel: 'gemini-3.1-flash-lite', temperature: 0.2 });
    expect(row.updatedAt).toMatch(/Z$/);

    const again = await patchWorkspace(OWNER, { brandKit: { tone: 'Dry & Direct' } });
    expect(again.brandKit).toEqual({ tone: 'Dry & Direct' });
    // The untouched slot survives the second write: a patch replaces what it names, not the row.
    expect(again.prefs).toEqual({ aiModel: 'gemini-3.1-flash-lite', temperature: 0.2 });
    expect(await getWorkspace(OWNER)).toEqual(again);
  });

  it('clears a slot when the client sends null and leaves its neighbours alone', async () => {
    await patchWorkspace(OWNER, { project: { tracks: [] }, bench: { cutId: 'vid_1', station: 'smart-editor' } });
    const cleared = await patchWorkspace(OWNER, { project: null });
    expect(cleared.project).toBeNull();
    expect(cleared.bench).toEqual({ cutId: 'vid_1', station: 'smart-editor' });
  });

  it('accepts a real timeline, word cues and all', async () => {
    // A caption clip nests six levels below the project, which is deeper than a saved idea ever
    // goes. The depth bound is set for exactly this shape, so it must store and come back.
    const project = {
      schemaVersion: '1.0.0',
      projectMetadata: { name: 'city-run' },
      tracks: [
        {
          id: 't1',
          clips: [
            {
              id: 'c1',
              type: 'text',
              content: 'Ship it ugly.',
              style: { fontSize: 42, words: [{ start: 0.2, end: 0.5, text: 'Ship' }] },
            },
          ],
        },
      ],
    };
    const row = await patchWorkspace(OWNER, { project });
    expect(row.project).toEqual(project);
  });

  it('keeps one creator out of another creator’s desk', async () => {
    await patchWorkspace(OWNER, { brandKit: { catchphrase: 'Ship it ugly.' } });
    expect(await getWorkspace(OTHER)).toBeNull();

    const moved = await patchWorkspace(OTHER, { brandKit: { catchphrase: 'hijacked' } });
    expect(moved.userId).toBe(OTHER);
    expect((await getWorkspace(OWNER))?.brandKit).toEqual({ catchphrase: 'Ship it ugly.' });
  });

  it('refuses a slot the workspace does not have', async () => {
    await expect(patchWorkspace(OWNER, { admin: true } as never)).rejects.toBeInstanceOf(RefusedWorkspaceWrite);
  });

  it('refuses a value that would read as a query operator', async () => {
    await expect(patchWorkspace(OWNER, { prefs: { $where: 'sleep(5)' } })).rejects.toBeInstanceOf(RefusedWorkspaceWrite);
    await expect(patchWorkspace(OWNER, { brandKit: { 'a.b': 1 } })).rejects.toBeInstanceOf(RefusedWorkspaceWrite);
  });

  it('refuses a slot over its size instead of storing half a timeline', async () => {
    const huge = { tracks: [{ id: 'x'.repeat(4 * 1024 * 1024) }] };
    await expect(patchWorkspace(OWNER, { project: huge })).rejects.toBeInstanceOf(RefusedWorkspaceWrite);
    expect(await getWorkspace(OWNER)).toBeNull();
  });

  it('trims the bench slot to what the app can actually use', async () => {
    const row = await patchWorkspace(OWNER, {
      bench: { cutId: 'x'.repeat(500), station: 'y'.repeat(90), extra: 'ignored' },
    });
    expect(row.bench).toEqual({ cutId: '', station: 'y'.repeat(40) });
  });

  it('survives a value that is not an object at all', async () => {
    await expect(patchWorkspace(OWNER, { prefs: 'a string' })).rejects.toBeInstanceOf(RefusedWorkspaceWrite);
    await expect(patchWorkspace(OWNER, { draft: [1, 2, 3] })).rejects.toBeInstanceOf(RefusedWorkspaceWrite);
  });

  it('keeps the damaged file rather than answering empty and deleting it', async () => {
    await patchWorkspace(OWNER, { prefs: { temperature: 0.4 } });
    fs.writeFileSync(path.join(dataDir, LOCAL_FILE), '{"prefs":', 'utf-8');
    expect(await getWorkspace(OWNER)).toBeNull();
    const preserved = fs.readdirSync(dataDir).filter((name) => name.includes('.corrupt-'));
    expect(preserved).toHaveLength(1);
  });
});
