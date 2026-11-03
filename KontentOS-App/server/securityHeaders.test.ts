import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import helmet from 'helmet';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cspOptions, noStoreApi } from './securityHeaders.js';

let server: Server;
let base = '';

beforeAll(() => {
  const app = express();
  app.use(
    helmet({
      contentSecurityPolicy: cspOptions(),
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'deny' },
    }),
  );
  app.get('/api/thing', noStoreApi, (_req, res) => res.json({ ok: true }));
  app.get('/page', (_req, res) => res.send('ok'));

  server = app.listen(0, '127.0.0.1');
  return new Promise<void>((resolve) => server.once('listening', () => {
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    resolve();
  }));
});

afterAll(() => server.close());

const headersFor = async (path: string) => {
  const res = await fetch(base + path);
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()) };
};

describe('the headers a KontentOS page ships with', () => {
  it('keeps scripts to this origin, its workers and the two engines it loads', async () => {
    const { headers } = await headersFor('/page');
    const csp = headers['content-security-policy'] ?? '';
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/script-src [^;]*'self'/);
    expect(csp).toMatch(/'wasm-unsafe-eval'/);
    expect(csp).toMatch(/worker-src [^;]*blob:/);
    expect(csp).toMatch(/https:\/\/unpkg\.com/);
    expect(csp).toMatch(/https:\/\/huggingface\.co/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/object-src 'none'/);
    // The fonts the two front ends link, and the stock frames the picker shows.
    expect(csp).toMatch(/https:\/\/fonts\.gstatic\.com/);
    expect(csp).toMatch(/https:\/\/images\.unsplash\.com/);

    // The script source is the one worth reading back: 'wasm-unsafe-eval' is the only eval-shaped
    // thing allowed, and inline script is not. No remote origin may script this page either — the
    // CDN core the export worker falls back to is fetched and rewritten as a blob before it runs.
    const scriptSrc = /script-src ([^;]*)/.exec(csp)?.[1] ?? '';
    expect(scriptSrc).toMatch(/'wasm-unsafe-eval'/);
    expect(scriptSrc).not.toMatch(/'unsafe-eval'|'unsafe-inline'/);
    expect(scriptSrc).not.toMatch(/https?:\/\//);
    // ...though it still has to be fetchable.
    const connectSrc = /connect-src ([^;]*)/.exec(csp)?.[1] ?? '';
    expect(connectSrc).toMatch(/https:\/\/unpkg\.com/);
  });

  it('denies framing, sniffing and referrer leaks, and upgrades to https in production', async () => {
    const { headers } = await headersFor('/page');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['x-powered-by']).toBeUndefined();
    expect(headers['strict-transport-security']).toMatch(/max-age=\d{6,}/);
    expect(headers['content-security-policy']).toMatch(/upgrade-insecure-requests/);
  });

  it('leaves the ffmpeg workers their credentialless embed policy', async () => {
    const { headers } = await headersFor('/page');
    // helmet's require-corp would break the crossOriginIsolated ffmpeg path, so COEP is not its job.
    expect(headers['cross-origin-embedder-policy']).toBeUndefined();
    expect(headers['cross-origin-resource-policy']).toBeUndefined();
  });

  it('tells every cache to keep its hands off an API answer', async () => {
    const { headers } = await headersFor('/api/thing');
    expect(headers['cache-control']).toBe('no-store');
  });
});
