/**
 * KontentOS — Cutting Room · Standalone Application Server
 *
 * Runs the complete KontentOS creative studio, modern React application,
 * and unified backend API services on port 4111.
 *
 *  - Fully self-contained backend routes and SQLite/JSON database engine.
 *  - Local .data/ persistence and uploads/ media storage.
 *  - Direct Gemini AI ideation and multimodal audio transcription endpoints.
 */
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import rateLimit from 'express-rate-limit';
import { isValidGeminiKey, envGeminiKey } from './server/geminiKey.js';
import { asId } from './server/safeId.js';
import { cspOptions, noStoreApi } from './server/securityHeaders.js';
import { attachSession, createAuthRouter, requireUser } from './server/auth.js';

// Local backend routes and database
import * as db from './server/db.js';
import uploadRouter from './server/routes/upload.js';
import videosRouter from './server/routes/videos.js';
import transcribeRouter from './server/routes/transcribe.js';
import { generateCueScaffold } from './server/cueScaffold.js';
import { isEmptySpeechEnvelope, isSpokenTextUsable } from './server/spokenText.js';
import captionRouter from './server/routes/caption.js';
import publishRouter from './server/routes/publish.js';
import scriptRouter from './server/routes/script.js';
import editorRouter from './server/routes/editor.js';
import repurposeRouter from './server/routes/repurpose.js';
import staticCardAiRouter from './server/routes/staticCardAi.js';
import { safeMessage } from './server/errorText.js';
import { bucketMediaFallback, uploadAccessGate } from './server/mediaAccess.js';
import * as mediaStore from './server/mediaStore.js';
import * as workspace from './server/workspaceStore.js';

const __filename = fileURLToPath(import.meta.url);
const appRoot = path.dirname(__filename);

// Load env: read from this app's own .env (v3.0.2 static generator hot-reload)
dotenv.config({ path: path.join(appRoot, '.env') });

// Ensure an isolated data + uploads workspace inside this app folder.
const dataDir = path.join(appRoot, '.data');
const uploadsDir = path.join(appRoot, 'uploads');
for (const dir of [dataDir, uploadsDir]) if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const PORT = process.env.PORT ? Number(process.env.PORT) : 4111;
const IS_PROD = process.env.NODE_ENV === 'production';

async function createApp() {
  const app = express();

  // Behind Render/Railway there is one reverse proxy; trust it so req.ip is the real client.
  app.set('trust proxy', 1);

  // Headers first, so every response — including the ones that fail — carries them.
  // COEP/COOP/CORP are left to the middleware below: the ffmpeg workers need credentialless and
  // shared clips need cross-origin reads, which helmet's stricter defaults would refuse.
  app.use(
    helmet({
      // Development serves through Vite's middleware, which injects an inline module preamble; a
      // script-src that forbids inline would stop the dev server from booting at all.
      contentSecurityPolicy: IS_PROD ? cspOptions() : false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'deny' },
      hsts: { maxAge: 180 * 24 * 60 * 60, includeSubDomains: true, preload: true },
    }),
  );

  // CORS allow-list. Same-origin requests (the app talking to its own server) send no
  // Origin header and are always fine. Anything else must be listed in ALLOWED_ORIGINS
  // (comma-separated, e.g. "https://kontentos.onrender.com"). In dev, localhost is allowed.
  const allowedOrigins = new Set(
    (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
  const isDev = process.env.NODE_ENV !== 'production';
  const isOriginAllowed = (origin: string) =>
    allowedOrigins.has(origin) || (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));

  // Cross-origin isolation (SharedArrayBuffer for ffmpeg/wasm routes) + CORS.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isOriginAllowed(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
      res.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    }
    res.header('Cross-Origin-Embedder-Policy', 'credentialless');
    res.header('Cross-Origin-Opener-Policy', 'same-origin');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    if (req.method === 'OPTIONS') return res.sendStatus(origin && !isOriginAllowed(origin) ? 403 : 204);
    next();
  });

  // Rate limits. General: 300 requests / 15 min per IP across the API.
  // AI routes cost real money (Gemini), so they get a much tighter cap.
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.path === '/health' || req.path.startsWith('/upload') || req.path.startsWith('/workspace'),
    message: { error: 'Too many requests, please slow down and try again shortly.' },
  });
  // The workspace is the creator's own desk: the switches they flip, the cut they lit, the timeline
  // they are dragging. It saves on edit, so a long cutting session is a steady stream of small
  // writes. Under the general cap that would 429 every other endpoint in the studio and silently
  // stop persisting the edit — which is the opposite of what this store is for. Its own ceiling
  // still bounds one IP; the slot size caps in server/workspaceStore.ts bound one request.
  const workspaceLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 240,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.method === 'GET',
    message: { error: 'This desk is saving faster than the server can accept. Pause a moment.' },
  });
  // A clip is sent in 5 MB chunks and one clip may reach 2 GB, so the largest honest upload is 400
  // requests on its own. Counting those against the general cap would 429 a creator partway through
  // their own footage; this ceiling still bounds one IP, and the per-session byte cap bounds the disk.
  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 2000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many upload requests. Please restart this upload in a few minutes.' },
  });
  const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'AI request limit reached. Please wait a few minutes and try again.' },
  });
  app.use('/api', apiLimiter);
  app.use('/api/upload', uploadLimiter);
  app.use('/api/workspace', workspaceLimiter);
  app.use(['/api/script', '/api/caption', '/api/transcribe', '/api/static-card', '/api/editor'], aiLimiter);
  // Nothing under /api is a public page: a shared cache must not hold one creator's transcript,
  // caption or schedule where the next visitor could read it.
  app.use('/api', noStoreApi);

  // Two body sizes, because only the upload routes carry footage. The widest non-upload payload is
  // a full transcript (400k characters, and a Devanagari one is escaped to about six bytes a
  // character), so 4 MB covers real work while nothing else can make the server buffer 15.
  const uploadJson = express.json({ limit: '15mb' });
  const uploadUrlencoded = express.urlencoded({ extended: true, limit: '15mb' });
  const apiJson = express.json({ limit: '4mb' });
  const apiUrlencoded = express.urlencoded({ extended: true, limit: '4mb' });

  // Session cookie is read on every request; only /api/auth and /api/health work without it.
  // This runs BEFORE the body parsers on purpose: reading a cookie needs no body, and a caller who
  // cannot name a creator should not be able to make this server buffer up to 15 MB of footage
  // first. Preflight is answered further up, so OPTIONS never reaches this gate.
  app.use(attachSession);
  app.use('/api', (req, res, next) => {
    if (req.path === '/health' || req.path.startsWith('/auth/')) return next();
    return requireUser(req, res, next);
  });

  app.use((req, res, next) => {
    const isUpload = req.path === '/api/upload' || req.path.startsWith('/api/upload/');
    if (isUpload) return uploadJson(req, res, (err) => (err ? next(err) : uploadUrlencoded(req, res, next)));
    return apiJson(req, res, (err) => (err ? next(err) : apiUrlencoded(req, res, next)));
  });

  // Gracefully handle malformed JSON in request bodies so the server process never crashes
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
      return res.status(400).json({ error: 'Malformed JSON payload in request body' });
    }
    // A body over the limit is a normal outcome of working with footage, not a crash. Left for
    // Express to handle, it comes back as an HTML stack page the studio cannot read and which
    // names the size limit and the route.
    if (err && (err.status === 413 || err.type === 'entity.too.large')) {
      return res.status(413).json({ error: 'That payload is larger than this endpoint accepts.' });
    }
    next(err);
  });

  app.use('/api/auth', createAuthRouter());

  // Everything else under /api belongs to a signed-in creator, and req.userId scopes every
  // query below to their own rows. The gate already ran ahead of the body parsers.

  // Serve media uploaded by THIS app instance with explicit CORP and Accept-Ranges.
  // Signed-in only: a clip's URL used to be enough to read anyone's footage.
  // No Access-Control-Allow-Origin here: the allow-list middleware above already answers the
  // origins we trust, and a wildcard would let any site embed a creator's footage by URL alone.
  app.use(
    '/uploads',
    requireUser,
    // Being signed in is not the same as being the owner, and every clip sits in one shared
    // directory under predictable ids, so each file is checked against the row that names it.
    uploadAccessGate,
    (req, res, next) => {
      res.header('Cross-Origin-Resource-Policy', 'cross-origin');
      res.header('Access-Control-Allow-Headers', 'Range');
      res.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      next();
    },
    express.static(uploadsDir, {
      acceptRanges: true,
      setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    }),
    // Nothing on this disk: with a bucket configured that is normal, and the object is the clip.
    // A container that has been redeployed still plays every clip whose bytes outlived it.
    bucketMediaFallback
  );

  // Serve royalty-free B-Roll video loops with CORP and Range headers
  const brollDir = path.join(appRoot, 'public', 'broll');
  if (!fs.existsSync(brollDir)) fs.mkdirSync(brollDir, { recursive: true });

  app.use(
    '/broll',
    (req, res, next) => {
      res.header('Cross-Origin-Resource-Policy', 'cross-origin');
      res.header('Access-Control-Allow-Headers', 'Range');
      res.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      next();
    },
    express.static(brollDir, {
      acceptRanges: true,
      setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    }),
  );

  // Universal Media Proxy Cache & Fallback Image
  interface CachedMedia {
    buffer: Buffer;
    contentType: string;
    timestamp: number;
  }
  const mediaCache = new Map<string, CachedMedia>();
  /** The biggest answer worth holding. A picker thumbnail is a few hundred KB; a whole clip is not. */
  const MAX_CACHED_BYTES = 4 * 1024 * 1024;
  /**
   * Render's free instance gives the whole process a fraction of a gigabyte, so the cache has to be
   * sized in bytes rather than in entries. Counted eviction — 120 answers of any size — is how a
   * media proxy turns into an out-of-memory restart under a creator who opens a big library.
   */
  const MAX_CACHE_TOTAL_BYTES = 48 * 1024 * 1024;
  let mediaCacheBytes = 0;

  function rememberMedia(key: string, buffer: Buffer, contentType: string): void {
    if (buffer.length > MAX_CACHED_BYTES) return;
    const previous = mediaCache.get(key);
    if (previous) mediaCacheBytes -= previous.buffer.length;
    mediaCache.set(key, { buffer, contentType, timestamp: Date.now() });
    mediaCacheBytes += buffer.length;
    while (mediaCacheBytes > MAX_CACHE_TOTAL_BYTES && mediaCache.size > 0) {
      // Insertion order, so the first entry is the oldest answer nobody asked for lately.
      const oldestKey = mediaCache.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      const evicted = mediaCache.get(oldestKey);
      if (evicted) mediaCacheBytes -= evicted.buffer.length;
      mediaCache.delete(oldestKey);
    }
  }

  const FALLBACK_ATMOSPHERE_SVG = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <defs>
        <radialGradient id="atm" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stop-color="#1e293b"/>
          <stop offset="60%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#020617"/>
        </radialGradient>
        <linearGradient id="overlay" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="rgba(14,165,233,0.12)"/>
          <stop offset="100%" stop-color="rgba(99,102,241,0.06)"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#atm)"/>
      <rect width="100%" height="100%" fill="url(#overlay)"/>
    </svg>`.trim()
  );

  // ---- Media proxy hardening (SSRF protection) --------------------------------
  /** The plate a picker shows instead of a broken image. It carries no upstream bytes at all. */
  const sendAtmosphere = (res: express.Response, maxAgeSeconds: number) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', `private, max-age=${maxAgeSeconds}`);
    res.send(FALLBACK_ATMOSPHERE_SVG);
  };

  // Only these hosts may be fetched. Add more via PROXY_ALLOWED_HOSTS="cdn.example.com,other.com".
  const PROXY_ALLOWED_HOSTS = new Set<string>([
    'images.unsplash.com',
    'plus.unsplash.com',
    'images.pexels.com',
    'videos.pexels.com',
  ]);
  for (const h of (process.env.PROXY_ALLOWED_HOSTS || '').split(',')) {
    if (h.trim()) PROXY_ALLOWED_HOSTS.add(h.trim().toLowerCase());
  }
  const PROXY_MAX_BYTES = 100 * 1024 * 1024; // 100 MB hard cap per proxied file
  const PROXY_TIMEOUT_MS = 15000;
  const PROXY_MAX_REDIRECTS = 3;

  /**
   * The bytes a picker or an <img> actually needs. Anything else is refused even from an allow-listed
   * host, because the proxied answer is served from this origin: an upstream that replied
   * text/html or image/svg+xml would hand the browser a document that can script KontentOS itself.
   */
  const PROXY_ALLOWED_CONTENT_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
  ]);
  const isProxyableContentType = (value: string | null): boolean => {
    const type = (value || '').split(';')[0].trim().toLowerCase();
    return PROXY_ALLOWED_CONTENT_TYPES.has(type);
  };
  /** Shared cache entries outlive the creator who fetched them, so nothing here is public. */
  const PROXY_CACHE_CONTROL = 'private, max-age=86400, stale-while-revalidate=604800';

  const isAllowedProxyUrl = (u: URL): boolean =>
    (u.protocol === 'https:' || u.protocol === 'http:') &&
    !u.username && !u.password &&
    PROXY_ALLOWED_HOSTS.has(u.hostname.toLowerCase());

  /** fetch() that re-validates every redirect hop against the allowlist. */
  const safeProxyFetch = async (startUrl: string, headers: Record<string, string>): Promise<Response> => {
    let current = new URL(startUrl);
    for (let hop = 0; hop <= PROXY_MAX_REDIRECTS; hop++) {
      if (!isAllowedProxyUrl(current)) throw new Error(`Host not allowed: ${current.hostname}`);
      const resp = await fetch(current, {
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
      });
      if (resp.status >= 300 && resp.status < 400 && resp.headers.get('location')) {
        current = new URL(resp.headers.get('location')!, current);
        continue;
      }
      return resp;
    }
    throw new Error('Too many redirects');
  };

  // Universal Media Proxy Endpoint to bypass browser CORS / COEP restrictions for external media assets
  app.get('/api/proxy-media', async (req, res) => {
    let mediaUrl = req.query.url as string;
    const urlIdx = req.originalUrl.indexOf('url=');
    if (urlIdx !== -1) {
      const raw = req.originalUrl.slice(urlIdx + 4);
      try {
        mediaUrl = decodeURIComponent(raw);
      } catch {
        mediaUrl = raw;
      }
    }

    if (!mediaUrl) {
      return res.status(400).json({ error: 'Missing url query parameter' });
    }

    // Check fast in-memory cache
    const cached = mediaCache.get(mediaUrl);
    if (cached && Date.now() - cached.timestamp < 3600000 * 24) {
      // Reading an answer makes it the newest again, so the entry the budget evicts is the one
      // nobody has asked for, rather than whichever happened to be fetched first.
      mediaCache.delete(mediaUrl);
      mediaCache.set(mediaUrl, cached);
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', PROXY_CACHE_CONTROL);
      return res.send(cached.buffer);
    }

    try {
      const parsed = new URL(mediaUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ error: 'Invalid URL protocol' });
      }
      if (!isAllowedProxyUrl(parsed)) {
        console.warn(`[proxy-media] Blocked non-allowlisted host: ${parsed.hostname}`);
        return res.status(403).json({ error: 'Host not allowed' });
      }

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };
      if (req.headers.range) {
        headers.range = req.headers.range;
      }

      const upstream = await safeProxyFetch(mediaUrl, headers);
      const declaredLen = Number(upstream.headers.get('content-length') || 0);
      if (declaredLen > PROXY_MAX_BYTES) {
        return res.status(413).json({ error: 'Remote file too large' });
      }
      if (!upstream.ok && upstream.status !== 206) {
        console.warn(`[proxy-media] Upstream status ${upstream.status} for ${mediaUrl}. Serving atmosphere fallback.`);
        return sendAtmosphere(res, 3600);
      }

      // The answer is served from this origin, so only real media may pass through it.
      const ct = upstream.headers.get('content-type') || '';
      if (!isProxyableContentType(ct)) {
        console.warn(`[proxy-media] Blocked content type "${ct}" from ${parsed.hostname}. Serving atmosphere fallback.`);
        return sendAtmosphere(res, 3600);
      }

      const arrayBuffer = await upstream.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length > PROXY_MAX_BYTES) {
        return res.status(413).json({ error: 'Remote file too large' });
      }

      // Nothing above writes to the response, so every failure in this block — the size check and
      // the catch below — can still answer as itself. Committing the media status and Content-Type
      // first would have let the atmosphere plate be delivered as `video/mp4`, or as a 206 holding
      // a slice of a file that is no longer there.
      res.status(upstream.status);
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Cache-Control', PROXY_CACHE_CONTROL);
      res.setHeader('Content-Type', ct);

      const cr = upstream.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);
      res.setHeader('Accept-Ranges', 'bytes');

      // A 206 carries a slice of the file, and the key is the whole file. Kept under that key it
      // would be replayed to the next reader as the complete answer: a clip that stops halfway, for
      // a day. Only a full body that nobody asked a piece of may be remembered.
      if (upstream.status === 200 && !req.headers.range) {
        rememberMedia(mediaUrl, buffer, ct);
      }

      res.send(buffer);
    } catch (err: any) {
      console.warn('[proxy-media] Error fetching media URL:', mediaUrl, err?.message);
      // Once a byte of footage has reached the browser the answer is already decided; the plate
      // would arrive as garbage appended to a video. Return beautiful fallback atmosphere image
      // instead of failing with 502 JSON.
      if (res.headersSent) return res.end();
      return sendAtmosphere(res, 3600);
    }
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: 'KontentOS — Cutting Room',
      standalone: true,
      port: PORT,
      authRequired: true,
      timestamp: new Date().toISOString(),
      // Whether footage written here survives the container is the one durability question with no
      // other outside answer, and the creator should not have to sign in and read a banner for a
      // supporter to check it. Only the clause: not the bucket name, and never a key.
      media: {
        provider: mediaStore.provider(),
        durable: mediaStore.bytesAreDurable(),
        problem: mediaStore.bucketProblem(),
      },
    });
  });

  app.get('/api/db/status', async (req, res) => {
    // Express 4 does not catch a rejected async handler, so anything that can throw in here is
    // caught in here — otherwise the request hangs until the browser gives up.
    try {
      // Resolve the engine before reporting it: on the very first request the lazy connection
      // may still be opening, and "local JSON" would be a lie about a configured database.
      await db.initDatabase();
      const connected = db.isMongoConnected();
      res.json({
        status: 'ok',
        provider: db.storageProvider(),
        connected,
        // The JSON store keeps data only inside this container, so nothing is shared or durable.
        isolated: !connected,
        // Records and bytes are separate questions: Mongo can keep the row for a file that a
        // redeploy has already deleted, and only the second of them has an object store as an answer.
        media: mediaStore.mediaStatus(),
        video_count: await db.countVideos(req.userId),
      });
    } catch (err: any) {
      res.status(503).json({ status: 'unavailable', error: safeMessage(err, 'Storage is unavailable.') });
    }
  });

  // Helper to format seconds to SRT timestamp: "00:00:02,500"
  function formatSrtTime(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  function parseSrtToSegments(srt: string): Array<{ id: number; start: string; end: string; text: string }> {
    const segments: Array<{ id: number; start: string; end: string; text: string }> = [];
    const blocks = srt.trim().split(/\n\s*\n/);
    for (const block of blocks) {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length >= 2) {
        const id = parseInt(lines[0], 10) || segments.length + 1;
        const timeLine = lines[1];
        const match = timeLine.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
        if (match) {
          const text = lines.slice(2).join(' ');
          segments.push({
            id,
            start: match[1].replace('.', ','),
            end: match[2].replace('.', ','),
            text,
          });
        }
      }
    }
    return segments;
  }

  function srtToVtt(srt: string): string {
    let vtt = 'WEBVTT\n\n';
    vtt += srt
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
      .replace(/^\d+\r?\n/gm, '');
    return vtt.trim();
  }

  function buildSrtFromTranscript(transcriptText: string, durationSec: number = 10) {
    const clean = (transcriptText || '').trim();
    const words = clean.split(/\s+/).filter(Boolean);
    if (!words.length) {
      return { srt: '', vtt: '', transcript: '', segments: [] };
    }

    const dur = Math.max(durationSec || 10, 2);
    // Keep 2-4 words per segment for rapid-fire kinetic captions
    const wordsPerSegment = 3;
    const numSegments = Math.ceil(words.length / wordsPerSegment);
    const segDur = dur / numSegments;

    function fmt(sec: number): string {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      const ms = Math.floor((sec % 1) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    }

    const segments: Array<{ id: number; start: string; end: string; text: string }> = [];
    let srt = '';
    for (let i = 0; i < numSegments; i++) {
      const chunk = words.slice(i * wordsPerSegment, (i + 1) * wordsPerSegment).join(' ');
      const startSec = i * segDur;
      const endSec = Math.min((i + 1) * segDur, dur);
      const start = fmt(startSec);
      const end = fmt(endSec);
      segments.push({ id: i + 1, start, end, text: chunk });
      srt += `${i + 1}\n${start} --> ${end}\n${chunk}\n\n`;
    }
    const vtt = srtToVtt(srt);
    return { srt: srt.trim(), vtt, transcript: clean, segments };
  }

  // Live Speech-to-Text & Subtitle Synchronization API (Works automatically with or without API Key)
  app.post('/api/transcribe', async (req, res) => {
    try {
      const { videoId: sentVideoId, forceRefresh = false, targetLanguage = 'English' } = req.body || {};
      const videoId = asId(sentVideoId);
      if (!videoId) return res.status(400).json({ error: 'Missing videoId' });

      const video = await db.getVideo(videoId, req.userId);
      if (!video) return res.status(404).json({ error: 'Video not found' });

      // Cached subtitles check
      const existing = await db.getSubtitles(video.id, req.userId);
      if (existing && !forceRefresh && (existing.language === targetLanguage || (!existing.language && targetLanguage === 'English'))) {
        const segments = existing.segments || parseSrtToSegments(existing.srt_content || '');
        return res.json({
          success: true,
          data: { ...existing, segments },
          cached: true,
          message: 'Loaded cached subtitles',
        });
      }

      // The deployment's key only. A key the browser sent used to win over it, which meant a
      // creator's own Gemini key sat in localStorage and travelled on every request; with no key
      // at all we skip Gemini and use the offline captions below.
      const activeApiKey: string | null = envGeminiKey();

      let srt = '';
      let transcript = '';
      let segments: Array<{ id: number; start: string; end: string; text: string }> = [];
      let usedSource = 'auto_speech_cadence';
      let isFallback = false;

      // Attempt Google Gemini Multimodal STT
      if (activeApiKey) {
        try {
          let mediaBuffer: Buffer | null = null;
          let mimeType = 'video/mp4';

          const fileBase = path.basename(video.file_url || '');
          const candidates = [
            path.join(uploadsDir, fileBase),
            video.file_url && video.file_url.startsWith('/uploads/') ? path.join(appRoot, video.file_url) : null,
            video.file_name ? path.join(uploadsDir, video.file_name) : null,
          ].filter(Boolean) as string[];

          // With a bucket configured the clip has no file here at all, and the engine reads bytes,
          // not objects: this pulls it down the same way a cut does.
          const staged = await mediaStore.ensureLocalCopy(video.file_url);
          if (staged) candidates.unshift(staged);

          for (const cand of candidates) {
            if (fs.existsSync(cand)) {
              const stat = fs.statSync(cand);
              if (stat.size > 0 && stat.size <= 25 * 1024 * 1024) {
                mediaBuffer = fs.readFileSync(cand);
                const ext = path.extname(cand).toLowerCase();
                if (ext === '.webm') mimeType = 'video/webm';
                else if (ext === '.mov') mimeType = 'video/quicktime';
                else if (ext === '.mp3') mimeType = 'audio/mp3';
                else if (ext === '.wav') mimeType = 'audio/wav';
                else if (ext === '.m4a' || ext === '.aac') mimeType = 'audio/aac';
                else mimeType = 'video/mp4';
                break;
              }
            }
          }

          if (mediaBuffer) {
            let ai = new GoogleGenAI({
              apiKey: activeApiKey as string,
              httpOptions: { headers: { 'User-Agent': 'kontentos-editorial-studio' } },
            });

            const base64Media = mediaBuffer.toString('base64');
            const prompt = `You are an elite speech-to-text (STT) transcription and subtitle synchronization AI for viral short-form video (Instagram Reels / TikTok / YouTube Shorts).
Transcribe every spoken sentence verbatim into target language: "${targetLanguage}".
Provide exact millisecond-accurate timestamps in SRT format ("00:00:01,200 --> 00:00:03,450").
Split into short, punchy segments (2 to 5 words each).
Output valid JSON:
{
  "language": "${targetLanguage}",
  "transcript": "Full text in ${targetLanguage}",
  "srt": "1\\n00:00:00,150 --> 00:00:02,300\\nFirst phrase\\n",
  "segments": [{ "id": 1, "start": "00:00:00,150", "end": "00:00:02,300", "text": "First phrase" }]
}`;

            // A saturated model used to leave intake on "Reading the audio…" indefinitely, because
            // each candidate was awaited with no deadline at all. Every attempt now gets one, inside
            // a shared budget, so the honest "nothing was transcribed" answer always arrives.
            const TRANSCRIBE_BUDGET_MS = 45_000;
            const budgetEndsAt = Date.now() + TRANSCRIBE_BUDGET_MS;
            const withinBudget = () => Date.now() < budgetEndsAt;
            function raceBudget<T>(work: Promise<T>, label: string): Promise<T> {
              const left = budgetEndsAt - Date.now();
              if (left <= 0) return Promise.reject(new Error(`${label}: transcription budget spent`));
              return Promise.race([
                work,
                new Promise<T>((_, reject) => {
                  const timer = setTimeout(() => reject(new Error(`${label}: no answer in ${left}ms`)), left);
                  timer.unref?.();
                }),
              ]);
            }

            const modelsToTry = [
              'gemini-3.5-transcribe',
              'gemini-3.8-flash',
              'gemini-3.5-flash',
              'gemini-3.5-flash-lite',
            ];

            for (const model of modelsToTry) {
              if (!withinBudget()) {
                console.warn(`[KontentOS AI CC] Stopping transcription at ${model}: the whole call ran out of time.`);
                break;
              }
              try {
                // gemini-3.5-transcribe is an audio-only model; map video containers to audio containers
                const effectiveMime = model.includes('transcribe') && mimeType.startsWith('video/')
                  ? (mimeType === 'video/webm' ? 'audio/webm' : 'audio/mp4')
                  : mimeType;

                const isDedicatedTranscribe = model.includes('transcribe');
                const contents = isDedicatedTranscribe
                  ? [{ inlineData: { data: base64Media, mimeType: effectiveMime } }]
                  : [{ inlineData: { data: base64Media, mimeType: effectiveMime } }, prompt];

                const response = await raceBudget(
                  ai.models.generateContent({
                    model,
                    contents,
                    config: isDedicatedTranscribe ? undefined : { responseMimeType: 'application/json' },
                  }),
                  `transcribe via ${model}`
                );

                // Extract verbatim audio transcription from audioTranscription parts or text parts
                let extractedText = '';
                const candidate = response.candidates?.[0];
                const parts = candidate?.content?.parts || [];
                for (const part of parts) {
                  if ((part as any).audioTranscription?.text) {
                    extractedText += (extractedText ? ' ' : '') + (part as any).audioTranscription.text;
                  } else if (part.text) {
                    extractedText += (extractedText ? ' ' : '') + part.text;
                  }
                }
                if (!extractedText) {
                  // `text` is a getter on GenerateContentResponse, not a method.
                  const directText = response.text;
                  if (directText && typeof directText === 'string') extractedText = directText;
                }

                if (extractedText && extractedText.trim()) {
                  let parsed: any = null;
                  try {
                    const cleanedText = extractedText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
                    parsed = JSON.parse(cleanedText);
                  } catch {}

                  if (parsed && (parsed.srt || parsed.segments?.length || parsed.transcript)) {
                    srt = parsed.srt || '';
                    transcript = parsed.transcript || '';
                    segments = parsed.segments || [];
                    usedSource = `gemini_multimodal_${model}`;
                    break;
                  } else if (isEmptySpeechEnvelope(parsed)) {
                    // The model looked at the take and reported no speech. That is an answer, and it
                    // is not a transcript: keep trying, then fall through to the unsaved scaffold.
                    console.warn(`[KontentOS AI CC] ${model} found no speech in "${video.title}".`);
                    continue;
                  } else if (!isSpokenTextUsable(extractedText)) {
                    console.warn(
                      `[KontentOS AI CC] ${model} answered about the job instead of the take; not stored:`,
                      extractedText.trim().slice(0, 90)
                    );
                    continue;
                  } else {
                    // Verbatim transcription returned directly by speech model
                    transcript = extractedText.trim();

                    // If a non-English target language was requested, translate the verbatim text
                    if (targetLanguage && targetLanguage.toLowerCase() !== 'english') {
                      try {
                        const trRes = await raceBudget(
                          ai.models.generateContent({
                            model: 'gemini-3.5-flash',
                            contents: `Translate this spoken video transcript accurately into ${targetLanguage}. Output ONLY the translated text without markdown or commentary:\n\n${transcript}`,
                          }),
                          `translate to ${targetLanguage}`
                        );
                        const trText = trRes.text?.trim();
                        if (trText) transcript = trText;
                      } catch (trErr: any) {
                        console.warn(`[KontentOS AI CC] Translation to ${targetLanguage} skipped:`, trErr?.message);
                      }
                    }

                    const built = buildSrtFromTranscript(transcript, video.duration || 10);
                    srt = built.srt;
                    segments = built.segments;
                    usedSource = `gemini_transcribe_${model}`;
                    break;
                  }
                }
              } catch (mErr: any) {
                const errMsg = mErr?.message || '';
                const isKeyError = errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid');
                console.warn(
                  `[KontentOS AI CC] Model ${model} failed${isKeyError ? ' (API key rejected)' : ''}, trying next candidate:`,
                  errMsg.slice(0, 100),
                );
              }
            }
          }
        } catch (geminiErr: any) {
          console.warn('[KontentOS AI CC] Gemini STT error, falling back to auto-cadence:', geminiErr?.message);
        }
      }

      // Seamless fallback: If no API key or Gemini failed/timed out, automatically generate smart synchronized subtitles
      if (!srt || !segments.length) {
        console.log(`[KontentOS AI CC] Generating automatic synchronized captions for "${video.title}" in ${targetLanguage}...`);
        const autoData = generateCueScaffold(video.title, video.duration || 10, targetLanguage);
        srt = autoData.srt;
        transcript = autoData.transcript;
        segments = autoData.segments;
        usedSource = 'auto_speech_cadence';
        isFallback = true;
      }

      if (!segments.length && srt) {
        segments = parseSrtToSegments(srt);
      }
      if (!srt && segments.length) {
        srt = segments.map((s: any) => `${s.id}\n${s.start} --> ${s.end}\n${s.text}\n`).join('\n');
      }
      if (!transcript && segments.length) {
        transcript = segments.map((s: any) => s.text).join(' ');
      }

      const vtt = srtToVtt(srt);
      let saved: any = null;
      if (!isFallback) {
        saved = await db.saveSubtitles({
          video_id: video.id,
          language: targetLanguage,
          srt_content: srt,
          vtt_content: vtt,
          transcript_text: transcript,
          segments,
        }, req.userId);
      }

      res.json({
        success: true,
        data: {
          ...(saved || {}),
          id: saved?.id || `temp_${Date.now()}`,
          video_id: video.id,
          language: targetLanguage,
          segments,
          srt_content: srt,
          vtt_content: vtt,
          transcript,
          persisted: !isFallback,
        },
        source: usedSource,
        persisted: !isFallback,
        message: usedSource.startsWith('gemini')
          ? `Transcribed audio via Gemini LLM (${usedSource})`
          : `No speech-to-text available, so these ${segments.length} cues are placeholder copy for layout only — they are not your words and are not saved.`,
      });
    } catch (err: any) {
      console.error('Error in /api/transcribe:', err);
      res.status(500).json({ error: safeMessage(err, 'Failed to transcribe audio with LLM model') });
    }
  });

  app.get('/api/transcribe/:videoId', async (req, res) => {
    try {
      const { videoId } = req.params;
      let existing = await db.getSubtitles(videoId, req.userId);
      if (!existing) {
        const all = await db.listVideos(req.userId);
        const v = all.find((item: any) => item.id === videoId || item.title === videoId);
        if (v) existing = await db.getSubtitles(v.id, req.userId);
      }
      // A clip nobody has captioned yet is the normal state of a fresh take, not a failed request.
      // Answering 404 made the browser log a network error for every uncaptioned clip the bench opens.
      if (!existing) return res.json({ success: true, data: null });
      const segments = existing.segments || parseSrtToSegments(existing.srt_content || '');
      res.json({ success: true, data: { ...existing, segments } });
    } catch (err: any) {
      res.status(500).json({ error: safeMessage(err, 'Failed to get captions') });
    }
  });

  // Core API routers (shared implementation, isolated data store).
  app.use('/api/upload', uploadRouter);
  app.use('/api/videos', videosRouter);
  app.use('/api/transcribe', transcribeRouter);
  app.use('/api/caption', captionRouter);
  app.use('/api/publish', publishRouter);
  app.use('/api/static-card', staticCardAiRouter);

  // Ideas & Spark Engine API (persistent saved ideas + AI/procedural generation)
  app.get('/api/script/saved-ideas', async (req, res) => {
    try {
      res.json({ success: true, data: await db.listSavedIdeas(req.userId) });
    } catch (err: any) {
      res.status(500).json({ error: safeMessage(err, 'Could not load saved ideas') });
    }
  });

  app.post('/api/script/saved-ideas', async (req, res) => {
    const idea = req.body;
    if (!idea || !idea.id) return res.status(400).json({ error: 'Missing idea data' });
    try {
      res.json({ success: true, data: await db.saveSavedIdea(req.userId, idea) });
    } catch (err: any) {
      res.status(500).json({ error: safeMessage(err, 'Could not save this idea') });
    }
  });

  app.delete('/api/script/saved-ideas/:id', async (req, res) => {
    try {
      res.json({ success: true, data: await db.deleteSavedIdea(req.userId, req.params.id) });
    } catch (err: any) {
      res.status(500).json({ error: safeMessage(err, 'Could not delete this idea') });
    }
  });

  // The creator's own desk: the Room switches, the Brand Kit, which cut is lit, which station was
  // last open, the timeline being edited and the draft in progress. Every one of these lived in
  // this browser's localStorage, so clearing site data — or working on a second machine — cost the
  // creator their settings and their unfinished edit. They are rows now, scoped to req.userId by
  // the gate that runs ahead of the body parsers.
  app.get('/api/workspace', async (req, res) => {
    try {
      res.json({ success: true, data: await workspace.getWorkspace(req.userId) });
    } catch (err: any) {
      res.status(503).json({ error: safeMessage(err, 'Could not read your workspace. Please try again.') });
    }
  });

  app.patch('/api/workspace', async (req, res) => {
    const patch = req.body;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'Send the workspace slots to save as an object.' });
    }
    try {
      res.json({ success: true, data: await workspace.patchWorkspace(req.userId, patch) });
    } catch (err: any) {
      // An un-storable slot is the client's mistake and is answered as one, because a workspace that
      // reports 503 for a payload it will never accept tells the creator to retry forever.
      const status = err instanceof workspace.RefusedWorkspaceWrite ? 400 : 503;
      res.status(status).json({ error: safeMessage(err, 'Could not save your workspace.') });
    }
  });

  app.post('/api/script/ideas', async (req, res) => {
    try {
      const { topic, niche, tone, context, temperature, model } = req.body || {};
      const { generateIdeas } = await import('./server/ideasEngine.js');
      const generated = await generateIdeas(topic, niche, { tone, context, temperature, model });
      res.json({ success: true, data: generated });
    } catch (err: any) {
      console.error('Error generating ideas:', err);
      const { generateScaffoldIdeas } = await import('./server/ideasEngine.js');
      res.json({ success: true, data: generateScaffoldIdeas(req.body?.topic, req.body?.niche), fallback: true });
    }
  });

  app.use('/api/script', scriptRouter);
  app.use('/api/editor', editorRouter);
  // Studio's repurpose engine: one recording in, several shorts out.
  app.use('/api/repurpose', repurposeRouter);

  // User profile — the signed-in creator, never another account.
  app.get('/api/user', async (req, res) => {
    try {
      const user = await db.getUser(req.userId);
      res.json({ success: true, data: user });
    } catch (err: any) {
      res.status(503).json({ error: safeMessage(err, 'Could not read your profile. Please try again.') });
    }
  });
  app.post('/api/user', async (req, res) => {
    try {
      // Email and the password hash are changed through /api/auth, not here.
      const updated = await db.updateUserProfile(req.userId, req.body || {});
      res.json({ success: true, data: db.publicUser(updated) });
    } catch (err: any) {
      res.status(503).json({ error: safeMessage(err, 'Could not save your profile. Please try again.') });
    }
  });

  // AI & Model Settings
  app.get('/api/settings/ai-status', (_req, res) => {
    const key = (process.env.GEMINI_API_KEY || '').trim();
    res.json({
      success: true,
      hasGeminiKey: !!key,
      keyMasked: key ? `••••••••••••${key.slice(-4)}` : null,
      // The screen offers a key field only where posting one can actually work; elsewhere it says
      // where the key does get set instead of sending the creator to a 403.
      editable: process.env.NODE_ENV !== 'production',
      model: 'gemini-2.0-flash',
    });
  });

  app.post('/api/settings/api-key', (req, res) => {
    // Anyone who can reach this URL could replace the server's key, so it only works on a
    // local dev machine. In production set GEMINI_API_KEY in the host's environment settings.
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        error: 'Changing the API key from the app is disabled in production. Set GEMINI_API_KEY in your host environment variables.',
      });
    }
    const { apiKey } = req.body || {};
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(400).json({ error: 'API key string is required' });
    }
    const cleanKey = apiKey.trim();
    process.env.GEMINI_API_KEY = cleanKey;
    try {
      const envFile = path.join(appRoot, '.env');
      let envContent = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf-8') : '';
      // Anchored to the start of a line: an unanchored search also matches a comment or another
      // variable that ends in the same name, and would rewrite that instead of the key.
      if (/^GEMINI_API_KEY=/m.test(envContent)) {
        envContent = envContent.replace(/^GEMINI_API_KEY=.*/gm, `GEMINI_API_KEY=${cleanKey}`);
      } else {
        envContent += `\nGEMINI_API_KEY=${cleanKey}\n`;
      }
      fs.writeFileSync(envFile, envContent, 'utf-8');
    } catch (err) {
      console.warn('Could not persist GEMINI_API_KEY to .env:', err);
    }
    res.json({
      success: true,
      message: 'Google Gemini API Key securely saved',
      keyMasked: `••••••••••••${cleanKey.slice(-4)}`,
    });
  });

  if (process.env.NODE_ENV === 'production') {
    // Production: serve the prebuilt bundle from dist/ (created by `npm run build`).
    // Vite is NOT loaded here. FFmpeg.wasm needs the same cross-origin isolation
    // headers that vite.config.ts sets for the dev server.
    const distDir = path.join(appRoot, 'dist');
    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
      throw new Error(`Production build not found at ${distDir}. Run "npm run build" first.`);
    }
    app.use((_req, res, next) => {
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      next();
    });
    // The Studio ships as a second entry, so it needs its own document. Ahead of the static mount
    // so `/studio` is answered instead of being 301'd to `/studio/` — a permanent redirect is cached
    // by browsers and outlives the routing that produced it. It also has to come before the fallback
    // below, which would otherwise answer every /studio path with the bench's index.html.
    app.get(/^\/studio\/?(?:index\.html)?$/, (_req, res) => {
      res.sendFile(path.join(distDir, 'studio', 'index.html'));
    });
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    // SPA fallback for client-side navigation. Never swallow API/media routes or the Studio entry.
    app.get(/^\/(?!api\/|uploads\/|broll\/|studio\/).*/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    // Development: Vite (React + Tailwind) in middleware mode, loaded lazily.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      configFile: path.join(appRoot, 'vite.config.ts'),
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            '**/.data/**',
            '**/uploads/**',
            '**/server/**',
            '**/server.ts',
            '**/.env*',
            '**/dist/**',
            /[\\/]\.data[\\/]/,
            /[\\/]uploads[\\/]/,
          ],
        },
      },
      appType: 'spa',
    });
    // /studio is the Studio's public address in production as well, so the same URL has to work
    // here — otherwise Vite's SPA fallback answers it with the bench and the two builds disagree.
    app.get(/^\/studio\/?$/, (req, _res, next) => {
      req.url = '/studio/index.html';
      next();
    });
    app.use(vite.middlewares);
  }

  await db.initDatabase();

  // Ideas saved by the old shared file move into the legacy bucket, which the first account
  // to sign up adopts along with the rest of the passcode-era workspace.
  const legacyIdeasFile = path.join(dataDir, 'saved_ideas.json');
  try {
    if (fs.existsSync(legacyIdeasFile)) {
      const parsed = JSON.parse(fs.readFileSync(legacyIdeasFile, 'utf-8'));
      if (Array.isArray(parsed) && parsed.length) {
        const moved = await db.importLegacySavedIdeas(parsed);
        fs.renameSync(legacyIdeasFile, `${legacyIdeasFile}.migrated`);
        console.log(`  ▸ Imported ${moved} saved idea(s) from .data/saved_ideas.json`);
      } else {
        fs.renameSync(legacyIdeasFile, `${legacyIdeasFile}.migrated`);
      }
    }
  } catch (err) {
    console.error('Could not import the legacy saved-ideas file:', err);
  }

  // Four keys in a dashboard say what this server means to do. Only the bucket gets to say what it
  // will accept, so the promise that footage survives a redeploy is made after the answer, not before.
  const bucketProbe = mediaStore.provider() === 'bucket' ? mediaStore.probeBucket() : Promise.resolve(null);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  KontentOS Cutting Room — standalone`);
    console.log(`  ▸ App + API : http://localhost:${PORT}`);
    console.log(`  ▸ Data       : ${db.isMongoConnected() ? 'MongoDB' : `${db.localDataDir()}  (isolated from the original app)`}`);
    console.log(`  ▸ Uploads    : ${uploadsDir}`);
    console.log(`  ▸ Media      : ${mediaStore.mediaStatus().note}`);
    if (mediaStore.provider() === 'local' && !mediaStore.bytesAreDurable()) {
      console.log(
        `\n  ⚠️  Clip bytes live on this container's disk: a redeploy or a free-tier sleep erases every clip\n` +
          `      and every server cut. Any S3-compatible bucket (Cloudflare R2,\n` +
          `      Backblaze B2, S3) holds them durably — set MEDIA_ENDPOINT, MEDIA_BUCKET,\n` +
          `      MEDIA_ACCESS_KEY_ID and MEDIA_SECRET_ACCESS_KEY.\n`,
      );
    } else if (mediaStore.provider() === 'local' && mediaStore.missingBucketKeys().length < 4) {
      // Half a bucket configuration is the dangerous one: it looks like the app chose the disk.
      console.log(
        `\n  ⚠️  The media bucket is incomplete (${mediaStore.missingBucketKeys().join(', ')} not set).\n` +
          `      Clip bytes are going to this container's disk instead.\n`,
      );
    } else {
      console.log('');
    }
    void bucketProbe.then((answer) => {
      if (!answer) return;
      console.log(
        answer.ok
          ? `  ▸ Bucket     : reachable. Clips written here outlive this container.\n`
          : `\n  ⚠️  The media bucket did not accept this server (${answer.reason}).\n` +
            `      Every upload that tries to store footage there will fail. Check MEDIA_BUCKET,\n` +
            `      MEDIA_ENDPOINT and the two key values in the Render dashboard, then restart.\n` +
            `      Until the bucket answers, the Vault says your clips are not durable — which is true.\n`,
      );
    });
    if (!db.isMongoConnected() && IS_PROD) {
      console.log(
        '  ⚠️  MONGODB_URI is not set: uploads, schedules and history live only in this container and\n' +
          '      are erased on the next redeploy or when the free plan sleeps the service.\n',
      );
    }
  });
}

createApp().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Express 4 does not await async handlers and Node terminates on an unhandled rejection, so
// one failed request (e.g. the local DB rejecting a write) would take the container down.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection — request failed, server kept alive:', reason);
});

// An uncaught exception means in-process state is no longer trustworthy: log it and let the
// platform restart the service rather than continue serving from a corrupted process.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception — shutting down for a clean restart:', err);
  process.exit(1);
});