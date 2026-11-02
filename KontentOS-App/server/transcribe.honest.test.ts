import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import transcribeRouter from './routes/transcribe';

// Own scratch directory: the local JSON store is a whole-file read-modify-write, so two test
// files sharing it would race and lose each other's writes.
const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'transcribe-honest');
process.env.KONTENTOS_DATA_DIR = dataDir;

let server: Server;
let base = '';

beforeAll(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  // No key: the only honest answer this route can give without an engine is a refusal.
  process.env.GEMINI_API_KEY = '';

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = 'user_owner';
    next();
  });
  app.use('/api/transcribe', transcribeRouter);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

const post = async (body: Record<string, unknown>) => {
  const res = await fetch(`${base}/api/transcribe/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
};

const realCue = '1\n00:00:00,000 --> 00:00:02,500\nGolden hour hits the glass at 18:40.\n';

describe('subtitle translation with no engine behind it', () => {
  it('refuses to translate a clip that has no spoken words stored', async () => {
    const { status, json } = await post({ videoId: 'clip_never_transcribed', targetLanguage: 'Spanish' });
    expect(status).toBe(409);
    expect(json.error).toMatch(/nothing real to translate/i);
  });

  it('refuses rather than writing its own script in another language', async () => {
    const { status, json } = await post({ videoId: 'clip_never_transcribed', srt: realCue, targetLanguage: 'Spanish' });
    expect(status).toBe(502);
    expect(json.error).toMatch(/will not write|untouched/i);
    // The lines it used to store: invented creator copy, translated.
    expect(JSON.stringify(json)).not.toMatch(/scroll|30 horas|ahorrar/i);
  });

  it('leaves the clip with no subtitles at all', async () => {
    const mine = 'clip_without_cues';
    await post({ videoId: mine, targetLanguage: 'German' }).catch(() => {});
    const res = await fetch(`${base}/api/transcribe/${mine}/download/srt`);
    expect(res.status).toBe(404);
  });
});
