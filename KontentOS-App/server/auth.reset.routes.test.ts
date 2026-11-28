import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachSession, createAuthRouter, requireUser, type AuthRouterOptions } from './auth.js';
import * as db from './db.js';
import type { PasswordResetEmail } from './passwordResetMailer.js';

const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'auth-reset-routes');
process.env.KONTENTOS_DATA_DIR = dataDir;

const PASSWORD = 'a-creator-sized-passphrase';
const NEW_PASSWORD = 'a-new-creator-passphrase';
const BASE_TIME = Date.parse('2026-11-28T12:00:00.000Z');
const deliveries: PasswordResetEmail[] = [];
const mailer = vi.fn(async (email: PasswordResetEmail) => { deliveries.push(email); });
let currentTime = BASE_TIME;
let server: Server;
let base = '';
let fixtureNumber = 0;

const options: AuthRouterOptions = {
  mailer,
  appBaseUrl: 'https://studio.example.test',
  now: () => new Date(currentTime),
};

const CLIENT_IPS: Record<string, string> = {
  '/api/auth': '192.0.2.1',
  '/generic/auth': '192.0.2.2',
  '/reset/auth': '192.0.2.3',
  '/expired/auth': '192.0.2.4',
  '/cooldown/auth': '192.0.2.5',
  '/config/auth': '192.0.2.6',
  '/origin/auth': '192.0.2.7',
  '/rate/auth': '192.0.2.8',
  '/attempt/auth': '192.0.2.9',
};

function mount(app: express.Express, prefix: string, authOptions: AuthRouterOptions = options) {
  app.use(prefix, createAuthRouter(authOptions));
}

beforeAll(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.SMTP_URL = '';
  process.env.BREVO_API_KEY = '';
  process.env.MAIL_FROM = '';
  process.env.APP_BASE_URL = '';

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '16kb' }));
  app.use(attachSession);
  mount(app, '/api/auth');
  mount(app, '/generic/auth');
  mount(app, '/reset/auth');
  mount(app, '/expired/auth');
  mount(app, '/cooldown/auth');
  mount(app, '/config/auth', { now: () => new Date(currentTime) });
  mount(app, '/origin/auth');
  mount(app, '/rate/auth');
  mount(app, '/attempt/auth');
  app.get('/api/private', requireUser, (req, res) => res.json({ userId: req.userId }));

  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  deliveries.length = 0;
  mailer.mockClear();
  currentTime = BASE_TIME;
});

afterAll(() => {
  server?.close();
});

async function post(route: string, body: unknown, headers: Record<string, string> = {}) {
  const prefix = `/${route.split('/')[1]}/auth`;
  return fetch(base + route, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': CLIENT_IPS[prefix] || '192.0.2.99',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function get(route: string, cookie?: string) {
  return fetch(base + route, { headers: cookie ? { Cookie: cookie } : {} });
}

async function body(res: Response): Promise<any> {
  return res.json();
}

async function fixture(tag: string) {
  fixtureNumber += 1;
  return db.createAccount({
    email: `${tag}-${fixtureNumber}@example.test`,
    full_name: 'Synthetic Creator',
    password_hash: await db.hashPassword(PASSWORD),
  });
}

async function requestToken(prefix: string, email: string, deliveryIndex = 0): Promise<string> {
  const res = await post(`${prefix}/forgot-password`, { email });
  expect(res.status).toBe(200);
  await vi.waitFor(() => expect(deliveries).toHaveLength(deliveryIndex + 1));
  const token = new URL(deliveries[deliveryIndex].resetUrl).searchParams.get('token');
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return token!;
}

describe('password reset security', () => {
  it('reports missing mail configuration without claiming delivery', async () => {
    const res = await post('/config/auth/forgot-password', { email: 'creator@example.test' });
    expect(res.status).toBe(503);
    expect((await body(res)).error).toMatch(/not configured/i);
    expect(deliveries).toHaveLength(0);
  });

  it('gives the same response for known and unknown emails and stores only the token hash', async () => {
    const account = await fixture('generic');
    const known = await post('/generic/auth/forgot-password', { email: account.email.toUpperCase() });
    const unknown = await post('/generic/auth/forgot-password', { email: 'nobody@example.test' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await body(known)).toEqual(await body(unknown));

    await vi.waitFor(() => expect(deliveries).toHaveLength(1));
    expect(deliveries[0].to).toBe(account.email);
    const token = new URL(deliveries[0].resetUrl).searchParams.get('token')!;
    const stored = fs.readFileSync(path.join(dataDir, 'kontentos-db.json'), 'utf-8');
    expect(stored).not.toContain(token);
    expect(stored).toContain(db.hashPasswordResetToken(token));
  });

  it('resets once, revokes every old session, and requires the new password', async () => {
    const account = await fixture('reset');
    const oldToken = db.newSessionToken();
    const otherToken = db.newSessionToken();
    await db.createSession(db.hashSessionToken(oldToken), account.id, 3600);
    await db.createSession(db.hashSessionToken(otherToken), account.id, 3600);
    const oldCookie = `kt_session=${oldToken}`;
    const otherCookie = `kt_session=${otherToken}`;
    expect((await get('/api/private', oldCookie)).status).toBe(200);

    const token = await requestToken('/reset/auth', account.email);
    const reset = await post('/reset/auth/reset-password', { token, password: NEW_PASSWORD });
    expect(reset.status).toBe(200);
    expect((await get('/api/private', oldCookie)).status).toBe(401);
    expect((await get('/api/private', otherCookie)).status).toBe(401);
    expect(await db.verifyPassword(PASSWORD, (await db.getAccountById(account.id))!.password_hash)).toBe(false);
    expect(await db.verifyPassword(NEW_PASSWORD, (await db.getAccountById(account.id))!.password_hash)).toBe(true);

    const replay = await post('/reset/auth/reset-password', { token, password: NEW_PASSWORD });
    expect(replay.status).toBe(400);
    expect((await body(replay)).error).toMatch(/invalid, expired, or already used/i);
    expect((await post('/api/auth/login', { email: account.email, password: PASSWORD })).status).toBe(401);
    expect((await post('/api/auth/login', { email: account.email, password: NEW_PASSWORD })).status).toBe(200);
  });

  it('invalidates an outstanding reset link when the password changes', async () => {
    const account = await fixture('changed');
    const token = await requestToken('/reset/auth', account.email);
    const sessionToken = db.newSessionToken();
    await db.createSession(db.hashSessionToken(sessionToken), account.id, 3600);
    const cookie = `kt_session=${sessionToken}`;

    const changed = await post('/api/auth/change-password', { current: PASSWORD, next: NEW_PASSWORD }, { Cookie: cookie });
    expect(changed.status).toBe(200);
    expect((await get('/api/private', cookie)).status).toBe(401);

    const stale = await post('/reset/auth/reset-password', { token, password: 'stale-link-passphrase' });
    expect(stale.status).toBe(400);
    expect(await db.verifyPassword(PASSWORD, (await db.getAccountById(account.id))!.password_hash)).toBe(false);
    expect(await db.verifyPassword(NEW_PASSWORD, (await db.getAccountById(account.id))!.password_hash)).toBe(true);
  });

  it('refuses an expired token without changing the password or sessions', async () => {
    const account = await fixture('expired');
    const token = await requestToken('/expired/auth', account.email);
    const sessionToken = db.newSessionToken();
    await db.createSession(db.hashSessionToken(sessionToken), account.id, 3600);
    currentTime += 31 * 60 * 1000;

    const res = await post('/expired/auth/reset-password', { token, password: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(await db.verifyPassword(PASSWORD, (await db.getAccountById(account.id))!.password_hash)).toBe(true);
    expect((await get('/api/private', `kt_session=${sessionToken}`)).status).toBe(200);
  });

  it('throttles repeated requests per account and rotates the token after the cooldown', async () => {
    const account = await fixture('cooldown');
    const first = await requestToken('/cooldown/auth', account.email);
    const repeated = await post('/cooldown/auth/forgot-password', { email: account.email });
    expect(repeated.status).toBe(200);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(deliveries).toHaveLength(1);

    currentTime += 61_000;
    const second = await requestToken('/cooldown/auth', account.email, 1);
    expect(second).not.toBe(first);
  });

  it('rate-limits reset requests even for unknown addresses', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await post('/rate/auth/forgot-password', { email: `unknown-${i}@example.test` })).status).toBe(200);
    }
    const limited = await post('/rate/auth/forgot-password', { email: 'unknown-6@example.test' });
    expect(limited.status).toBe(429);
  });

  it('rate-limits reset attempts with invalid tokens', async () => {
    for (let i = 0; i < 12; i += 1) {
      const res = await post('/attempt/auth/reset-password', {
        token: 'a'.repeat(43),
        password: NEW_PASSWORD,
      });
      expect(res.status).toBe(400);
    }
    const limited = await post('/attempt/auth/reset-password', {
      token: 'a'.repeat(43),
      password: NEW_PASSWORD,
    });
    expect(limited.status).toBe(429);
  });

  it('rejects non-string credentials instead of coercing objects into passwords', async () => {
    const badPassword = await post('/api/auth/signup', {
      email: 'strict@example.test',
      full_name: 'Strict',
      password: { value: 'a-creator-sized-passphrase' },
    });
    expect(badPassword.status).toBe(400);
    const badLogin = await post('/api/auth/login', { email: 'strict@example.test', password: ['a-creator-sized-passphrase'] });
    expect(badLogin.status).toBe(400);
  });

  it('accepts same-origin account requests', async () => {
    const res = await post('/origin/auth/login', { email: 'creator@example.test', password: PASSWORD }, {
      Origin: base,
    });
    expect(res.status).toBe(401);
    expect((await body(res)).error).toMatch(/email or password is wrong/i);
  });

  it('rejects cross-origin account requests', async () => {
    const res = await post('/origin/auth/login', { email: 'creator@example.test', password: PASSWORD }, {
      Origin: 'https://attacker.example',
    });
    expect(res.status).toBe(403);
  });
});
