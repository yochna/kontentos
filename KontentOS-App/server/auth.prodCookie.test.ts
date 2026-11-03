import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The cookie prefix only exists in the production build, so this file is the one place that boots the
 * auth router with NODE_ENV=production. A fresh module graph is needed because the name and its
 * attributes are decided when the module is first evaluated.
 */
const dataDir = path.join(os.tmpdir(), 'kontentos-vitest-db', 'auth-prod-cookie');

let server: Server;
let base = '';
let SESSION_COOKIE = '';

beforeAll(async () => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.KONTENTOS_DATA_DIR = dataDir;
  process.env.GEMINI_API_KEY = '';

  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  const auth = await import('./auth.js');
  SESSION_COOKIE = auth.SESSION_COOKIE;

  const app = express();
  app.use(express.json());
  app.use(auth.attachSession);
  app.use('/api/auth', auth.createAuthRouter());
  app.get('/api/private', auth.requireUser, (req, res) => res.json({ userId: req.userId }));

  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => {
  server?.close();
});

let accounts = 0;
const signup = async () => {
  accounts += 1;
  const res = await fetch(`${base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `host${accounts}@studio.test`,
      full_name: 'Host',
      password: 'a-creator-sized-passphrase',
    }),
  });
  return res.headers.getSetCookie()[0] ?? '';
};

describe('the session cookie on the https deployment', () => {
  it('carries the __Host- prefix', () => {
    expect(SESSION_COOKIE).toBe('__Host-kt_session');
  });

  it('is set with every attribute the prefix demands, and no Domain', async () => {
    const cookie = await signup();
    expect(cookie.startsWith('__Host-kt_session=')).toBe(true);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).not.toMatch(/Domain=/);
  });

  it('reads only the prefixed name, so a tossed plain cookie is not a session', async () => {
    const issued = await signup();
    const token = issued.split(';')[0].split('=').slice(1).join('=');

    const good = await fetch(`${base}/api/private`, { headers: { Cookie: `__Host-kt_session=${token}` } });
    expect(good.status).toBe(200);

    // The unprefixed name is what any origin that can set a cookie for this host would plant.
    const tossed = await fetch(`${base}/api/private`, { headers: { Cookie: `kt_session=${token}` } });
    expect(tossed.status).toBe(401);
  });
});
