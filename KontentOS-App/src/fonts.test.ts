import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

/**
 * The bench used to load its faces from Google's CDN. On a network that could not reach it the
 * icon font never arrived and every icon printed its own ligature name — the sign-in button read
 * "login Sign in". The faces are vendored now, so the failure left to guard is a file that is
 * referenced but not shipped.
 */
describe('the vendored fonts', () => {
  const css = read('src/fonts.css');
  const urls = [...css.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map((m) => m[1]);

  it('declares a face for every file it points at, and each one is a real woff2', () => {
    expect(urls.length).toBeGreaterThan(30);
    for (const name of urls) {
      const file = path.join(root, 'public/fonts', name);
      expect(existsSync(file), `public/fonts/${name} is missing`).toBe(true);
      expect(readFileSync(file).subarray(0, 4).toString('latin1'), `${name} is not woff2`).toBe('wOF2');
    }
  });

  it('keeps both entry pages off every third-party font host', () => {
    for (const entry of ['index.html', 'studio/index.html']) {
      const html = read(entry);
      expect(html, entry).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
      for (const m of html.matchAll(/href="\/fonts\/([^"]+)"/g)) {
        expect(existsSync(path.join(root, 'public/fonts', m[1])), `${entry} preloads a missing ${m[1]}`).toBe(true);
      }
    }
  });

  it('ships both icon weights and blocks rather than printing a ligature name', () => {
    expect(urls).toContain('material-symbols-outlined-400.woff2');
    expect(urls).toContain('material-symbols-outlined-600.woff2');
    const faces = [...css.matchAll(/@font-face\s*\{[^}]*Material Symbols Outlined[^}]*\}/g)].map((m) => m[0]);
    expect(faces).toHaveLength(2);
    // swap would show the icon's own name as text for as long as the file takes to arrive.
    for (const face of faces) expect(face).toMatch(/font-display: block;/);
  });
});