import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachSession, createAuthRouter, requireUser, SESSION_COOKIE } from './auth.js';
import captionRouter from './routes/caption.js';
import staticCardAiRouter from './routes/staticCardAi.js';

// Own scratch directory: the local JSON store is a whole-file read-modify-write, so two test
// files sharing it would race and lose each other's writes.
const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'copy-honesty');
process.env.KONTENTOS_DATA_DIR = dataDir;

let server: Server;
let base = '';
let cookie = '';

const PASSWORD = 'a-creator-sized-passphrase';
const PROMPT = 'Why most creator calendars collapse in week three';

beforeAll(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  // No key on the deployment: every engine call below has to fail rather than invent something.
  process.env.GEMINI_API_KEY = '';

  const app = express();
  app.use(express.json());
  app.use(attachSession);
  app.use('/api/auth', createAuthRouter());
  app.use('/api', requireUser);
  app.use('/api/caption', captionRouter);
  app.use('/api/static-card', staticCardAiRouter);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const res = await fetch(`${base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'copy-honest@creator.test', full_name: 'Copy Tester', password: PASSWORD }),
  });
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  cookie = raw ? raw.split(';')[0] : '';
});

afterAll(() => {
  server.close();
});

function post(route: string, body: Record<string, unknown>) {
  return fetch(base + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

describe('copy endpoints when no engine answers', () => {
  it('says nothing was generated instead of handing back the prompt', async () => {
    const res = await post('/api/caption/text-gen', { prompt: PROMPT });
    const json = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(json.error).toMatch(/no copy engine answered/i);
    // The old behaviour returned the creator's own question as the "generated" text.
    expect(JSON.stringify(json)).not.toContain(PROMPT);
  });

  it('refuses static card copy rather than filling the card itself', async () => {
    const res = await post('/api/static-card/generate-copy', { prompt: PROMPT });
    const json = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(json.error).toMatch(/no copy engine answered/i);
    expect(json.copy?.headline).toBeUndefined();
  });

  it('refuses a carousel deck rather than writing a fake one', async () => {
    const res = await post('/api/static-card/generate-deck', { prompt: PROMPT, slideCount: 5 });
    const json = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(json.error).toMatch(/no copy engine answered/i);
    expect(json.slides || json.deck).toBeUndefined();
  });

  it('refuses a regenerated slide instead of inventing a metric for it', async () => {
    const res = await post('/api/static-card/regenerate-slide', {
      slideIndex: 2,
      totalSlides: 5,
      topic: PROMPT,
      currentSlide: { headline: 'Something already on the card', supportingText: 'Body text.' },
    });
    const json = (await res.json()) as any;

    expect(res.status).toBe(502);
    expect(json.error).toMatch(/no copy engine answered/i);
    // The deleted fallback printed this invented figure on a creator's slide.
    expect(JSON.stringify(json)).not.toMatch(/300%/);
  });

  it('still asks for a topic before it bothers the engine', async () => {
    expect((await post('/api/static-card/generate-copy', {})).status).toBe(400);
    expect((await post('/api/caption/text-gen', {})).status).toBe(400);
  });
});
