import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachSession, createAuthRouter, requireUser, SESSION_COOKIE } from './auth.js';

// Own scratch directory: the local JSON store is a whole-file read-modify-write, so two test
// files sharing it would race and lose each other's writes.
const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'auth-routes');
process.env.KONTENTOS_DATA_DIR = dataDir;

// The real router, the real middleware and the real JSON store — but never the whole
// server.ts, which boots ffmpeg, model loaders and listeners.
let server: Server;
let base = '';

const PASSWORD = 'a-creator-sized-passphrase';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(attachSession);
  app.use('/api/auth', createAuthRouter());
  app.get('/api/private', requireUser, (req, res) => res.json({ userId: req.userId }));
  return app;
}

beforeAll(async () => {
  // Start from an empty store every run, otherwise the first signup is a 409 against last
  // run's leftover account.
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });

  server = buildApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

function cookieFrom(res: Response): string | null {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return raw ? raw.split(';')[0] : null;
}

interface Envelope {
  success?: boolean;
  data?: any;
  error?: string;
  userId?: string;
}

async function json(res: Response): Promise<Envelope> {
  return (await res.json()) as Envelope;
}

async function post(path: string, body: unknown, cookie?: string | null) {
  return fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function get(path: string, cookie?: string | null) {
  return fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} });
}

// authLimiter allows 12 signup/login calls per IP per 15 minutes and this file is one process,
// so the suite stays under that ceiling — adding more auth traffic needs a second test file.
describe('account endpoints', () => {
  let cookie: string | null = null;

  it('signs a new creator up and hands back an HttpOnly session cookie', async () => {
    const res = await post('/api/auth/signup', {
      email: 'Creator@Test.Example',
      full_name: 'Creator One',
      password: PASSWORD,
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data.email).toBe('creator@test.example');
    expect(body.data).not.toHaveProperty('password_hash');

    cookie = cookieFrom(res);
    expect(cookie).toBeTruthy();
    const raw = res.headers.getSetCookie().join(';');
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('SameSite=Strict');
    expect(raw).toContain(`Path=/`);
  });

  it('rejects a malformed email and a short password', async () => {
    expect((await post('/api/auth/signup', { email: 'not-an-email', full_name: 'X', password: PASSWORD })).status).toBe(400);
    const tooShort = await post('/api/auth/signup', { email: 'ok@example.test', full_name: 'X', password: 'short' });
    expect(tooShort.status).toBe(400);
    expect((await json(tooShort)).error).toMatch(/at least 8 characters/i);
  });

  it('answers a repeated email with 409, not with a silent second account', async () => {
    const res = await post('/api/auth/signup', {
      email: 'creator@test.example',
      full_name: 'Impostor',
      password: PASSWORD,
    });
    expect(res.status).toBe(409);
  });

  it('uses one identical message for a wrong password and an unknown address', async () => {
    const wrongPassword = await post('/api/auth/login', { email: 'creator@test.example', password: 'wrong-password' });
    const unknownEmail = await post('/api/auth/login', { email: 'nobody@nowhere.example', password: PASSWORD });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect((await json(wrongPassword)).error).toBe((await json(unknownEmail)).error);
  });

  it('logs the real credentials in and resolves the session', async () => {
    const res = await post('/api/auth/login', { email: 'creator@test.example', password: PASSWORD });
    expect(res.status).toBe(200);
    cookie = cookieFrom(res);

    const me = await json(await get('/api/auth/me', cookie));
    expect(me.data.email).toBe('creator@test.example');
    const shared = await json(await get('/api/private', cookie));
    expect(shared.userId).toBe(me.data.id);
  });

  it('ends the session immediately on sign-out', async () => {
    const before = await json(await get('/api/private', cookie));
    expect(before.userId).toBeTruthy();

    const out = await post('/api/auth/logout', {}, cookie);
    expect(out.status).toBe(200);
    expect(cookieFrom(out)).toBe(`${SESSION_COOKIE}=`);

    // The resolver caches sessions for a minute; revocation has to beat that cache.
    expect((await get('/api/private', cookie)).status).toBe(401);
    expect((await json(await get('/api/auth/me', cookie))).data).toBeNull();
  });

  it('treats an anonymous request as signed out rather than as an error', async () => {
    expect((await get('/api/private')).status).toBe(401);
    expect((await json(await get('/api/auth/me'))).data).toBeNull();
  });

  it('changes the password only for the right current one, and signs out on success', async () => {
    const login = await post('/api/auth/login', { email: 'creator@test.example', password: PASSWORD });
    const fresh = cookieFrom(login);

    expect((await post('/api/auth/change-password', { current: 'nope', next: 'brand-new-passphrase' }, fresh)).status).toBe(401);
    expect(
      (await post('/api/auth/change-password', { current: PASSWORD, next: 'tiny' }, fresh)).status,
    ).toBe(400);

    const ok = await post('/api/auth/change-password', { current: PASSWORD, next: 'brand-new-passphrase' }, fresh);
    expect(ok.status).toBe(200);
    expect((await get('/api/private', fresh)).status).toBe(401);

    expect((await post('/api/auth/login', { email: 'creator@test.example', password: PASSWORD })).status).toBe(401);
    expect((await post('/api/auth/login', { email: 'creator@test.example', password: 'brand-new-passphrase' })).status).toBe(200);
  });
});
