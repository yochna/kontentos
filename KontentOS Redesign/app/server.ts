/**
 * KontentOS — Editorial Studio (Redesign) · standalone dev server
 *
 * Runs the redesigned React app and a full /api backend on port 4111, WITHOUT
 * modifying or interfering with the original KontentOS-main app (which stays on 4110).
 *
 * How isolation works:
 *  - The backend routers/DB are imported read-only from ../../KontentOS-main/server.
 *  - The DB engine + uploads resolve paths via process.cwd(). Because this process
 *    is launched from THIS app folder, it writes its OWN ./.data and ./uploads —
 *    completely separate from the original app's data.
 *  - AI API keys are optionally read from the original .env (read-only) so GenAI
 *    features work; no original file is ever written.
 */
import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

// Original backend (imported, never modified).
import * as db from '../../KontentOS-main/server/db.js';
import uploadRouter from '../../KontentOS-main/server/routes/upload.js';
import videosRouter from '../../KontentOS-main/server/routes/videos.js';
import transcribeRouter from '../../KontentOS-main/server/routes/transcribe.js';
import captionRouter from '../../KontentOS-main/server/routes/caption.js';
import publishRouter from '../../KontentOS-main/server/routes/publish.js';
import scriptRouter from '../../KontentOS-main/server/routes/script.js';
import editorRouter from '../../KontentOS-main/server/routes/editor.js';

const __filename = fileURLToPath(import.meta.url);
const appRoot = path.dirname(__filename);

// Load env: prefer this app's own .env, then fall back to the original's keys (read-only).
dotenv.config({ path: path.join(appRoot, '.env') });
const originalEnv = path.resolve(appRoot, '../../KontentOS-main/.env');
if (fs.existsSync(originalEnv)) dotenv.config({ path: originalEnv });

// Ensure an isolated data + uploads workspace inside this app folder.
const dataDir = path.join(appRoot, '.data');
const uploadsDir = path.join(appRoot, 'uploads');
for (const dir of [dataDir, uploadsDir]) if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const PORT = process.env.PORT ? Number(process.env.PORT) : 4111;

async function createApp() {
  const app = express();

  // CORS + cross-origin isolation (SharedArrayBuffer for ffmpeg/wasm routes).
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range');
    res.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    res.header('Cross-Origin-Embedder-Policy', 'credentialless');
    res.header('Cross-Origin-Opener-Policy', 'same-origin');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // Gracefully handle malformed JSON in request bodies so the server process never crashes
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
      return res.status(400).json({ error: 'Malformed JSON payload in request body' });
    }
    next(err);
  });

  // Serve media uploaded by THIS app instance with explicit CORP and Accept-Ranges.
  app.use(
    '/uploads',
    (req, res, next) => {
      res.header('Cross-Origin-Resource-Policy', 'cross-origin');
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Range');
      res.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      next();
    },
    express.static(uploadsDir, {
      acceptRanges: true,
      setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
      },
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: 'KontentOS — Editorial Studio (Redesign)',
      standalone: true,
      port: PORT,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/db/status', async (_req, res) => {
    const isSupabase = db.isSupabaseConnected();
    const videos = await db.listVideos();
    res.json({
      status: 'ok',
      provider: isSupabase ? 'supabase' : 'local_persistent_json',
      connected: true,
      isolated: true,
      video_count: videos.length,
    });
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

  // Live Speech-to-Text & Subtitle Synchronization API
  app.post('/api/transcribe', async (req, res) => {
    try {
      const { videoId, forceRefresh = false, targetLanguage = 'English', apiKey: clientKey } = req.body || {};
      if (!videoId) return res.status(400).json({ error: 'Missing videoId' });

      let video = await db.getVideo(videoId);
      if (!video) {
        const all = await db.listVideos();
        video =
          all.find((v: any) => v.id === videoId || v.title === videoId || (v.file_url && v.file_url.includes(videoId))) ||
          (all.length > 0 ? all[0] : null);
      }
      if (!video) return res.status(404).json({ error: 'Video not found' });

      // Cached subtitles check
      const existing = (await db.getSubtitles(video.id)) || (videoId !== video.id ? await db.getSubtitles(videoId) : null);
      if (existing && !forceRefresh && (existing.language === targetLanguage || (!existing.language && targetLanguage === 'English'))) {
        const segments = existing.segments || parseSrtToSegments(existing.srt_content || '');
        return res.json({
          success: true,
          data: { ...existing, segments },
          cached: true,
          message: 'Loaded cached subtitles',
        });
      }

      const activeApiKey = (clientKey || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
      if (!activeApiKey) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_GEMINI_API_KEY',
          message: 'Google Gemini API Key is required to connect to the LLM model and transcribe audio from your video.',
        });
      }

      // Persist key to process.env and .env if provided by client
      if (clientKey && clientKey.trim()) {
        process.env.GEMINI_API_KEY = clientKey.trim();
        try {
          const envFile = path.join(appRoot, '.env');
          let envContent = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf-8') : '';
          if (envContent.includes('GEMINI_API_KEY=')) {
            envContent = envContent.replace(/GEMINI_API_KEY=.*/g, `GEMINI_API_KEY=${clientKey.trim()}`);
          } else {
            envContent += `\nGEMINI_API_KEY=${clientKey.trim()}\n`;
          }
          fs.writeFileSync(envFile, envContent, 'utf-8');
        } catch (envErr) {
          console.warn('Could not persist GEMINI_API_KEY to .env:', envErr);
        }
      }

      // Resolve the actual media file from disk
      let mediaBuffer: Buffer | null = null;
      let mimeType = 'video/mp4';

      const fileBase = path.basename(video.file_url || '');
      const candidates = [
        path.join(uploadsDir, fileBase),
        path.resolve(appRoot, '../../KontentOS-main/uploads', fileBase),
        video.file_url && video.file_url.startsWith('/uploads/') ? path.join(appRoot, video.file_url) : null,
        video.file_name ? path.join(uploadsDir, video.file_name) : null,
        video.file_name ? path.resolve(appRoot, '../../KontentOS-main/uploads', video.file_name) : null,
      ].filter(Boolean) as string[];

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

      if (!mediaBuffer) {
        return res.status(404).json({
          success: false,
          error: 'MEDIA_FILE_NOT_FOUND',
          message: 'Video file could not be located on the server for audio extraction.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey: activeApiKey,
        httpOptions: { headers: { 'User-Agent': 'kontentos-editorial-studio' } },
      });

      const base64Media = mediaBuffer.toString('base64');
      const prompt = `You are an elite speech-to-text (STT) transcription and subtitle synchronization AI for viral short-form video (Instagram Reels / TikTok / YouTube Shorts).

TASK:
1. Listen carefully to the spoken voice / dialogue audio in this media file.
2. Transcribe every spoken sentence verbatim into target language: "${targetLanguage}".
3. Provide exact millisecond-accurate timestamps in SRT format ("00:00:01,200 --> 00:00:03,450").
4. Split the speech into short, punchy kinetic segments (2 to 5 words each) suitable for high-retention social captions.
5. If the video contains background music or ambient noise without dialogue, transcribe any detectable words or synthesize a high-converting 9:16 creator voiceover caption sequence tailored to: "${video.title || 'Creator Reel'}".

OUTPUT FORMAT:
Return strictly a valid JSON object with no surrounding markdown or explanation:
{
  "language": "${targetLanguage}",
  "transcript": "Full verbatim transcribed text in ${targetLanguage}",
  "srt": "1\\n00:00:00,150 --> 00:00:02,300\\nFirst phrase\\n\\n2\\n00:00:02,350 --> 00:00:04,500\\nSecond phrase\\n",
  "segments": [
    { "id": 1, "start": "00:00:00,150", "end": "00:00:02,300", "text": "First phrase" },
    { "id": 2, "start": "00:00:02,350", "end": "00:00:04,500", "text": "Second phrase" }
  ]
}`;

      const contents = [
        {
          inlineData: {
            data: base64Media,
            mimeType,
          },
        },
        prompt,
      ];

      // Official Google Gemini multimodal models in cascade order
      const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro'];
      let parsed: any = null;
      let usedModel = 'gemini-2.0-flash';
      let lastErr: any = null;

      for (const model of modelsToTry) {
        try {
          console.log(`[KontentOS AI CC] Transcribing via LLM model: ${model}...`);
          const response = await ai.models.generateContent({
            model,
            contents,
            config: { responseMimeType: 'application/json' },
          });

          const rawText = response.text || '';
          const cleanedText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          parsed = JSON.parse(cleanedText);
          if (parsed && (parsed.srt || parsed.segments?.length || parsed.transcript)) {
            usedModel = model;
            console.log(`[KontentOS AI CC] ✓ Successfully transcribed using ${model}`);
            break;
          }
        } catch (mErr: any) {
          console.warn(`[KontentOS AI CC] Model ${model} failed:`, mErr?.message || mErr);
          lastErr = mErr;
        }
      }

      if (!parsed) {
        throw new Error(lastErr?.message || 'Failed to generate transcription from Gemini LLM');
      }

      let srt = parsed.srt || '';
      let transcript = parsed.transcript || '';
      let segments: Array<{ id: number; start: string; end: string; text: string }> = parsed.segments || [];

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
      const saved = await db.saveSubtitles({
        video_id: video.id,
        language: targetLanguage,
        srt_content: srt,
        vtt_content: vtt,
        transcript_text: transcript,
        segments,
      });

      res.json({
        success: true,
        data: {
          ...saved,
          segments,
          srt_content: srt,
          vtt_content: vtt,
          transcript,
        },
        source: `gemini_multimodal_${usedModel}`,
        message: `Transcribed audio via Gemini LLM (${usedModel})`,
      });
    } catch (err: any) {
      console.error('Error in /api/transcribe:', err);
      res.status(500).json({ error: err?.message || 'Failed to transcribe audio with LLM model' });
    }
  });

  app.get('/api/transcribe/:videoId', async (req, res) => {
    try {
      const { videoId } = req.params;
      let existing = await db.getSubtitles(videoId);
      if (!existing) {
        const all = await db.listVideos();
        const v = all.find((item: any) => item.id === videoId || item.title === videoId);
        if (v) existing = await db.getSubtitles(v.id);
      }
      if (!existing) return res.status(404).json({ error: 'No captions found for video' });
      const segments = existing.segments || parseSrtToSegments(existing.srt_content || '');
      res.json({ success: true, data: { ...existing, segments } });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to get captions' });
    }
  });

  // Core API routers (shared implementation, isolated data store).
  app.use('/api/upload', uploadRouter);
  app.use('/api/videos', videosRouter);
  app.use('/api/transcribe', transcribeRouter);
  app.use('/api/caption', captionRouter);
  app.use('/api/publish', publishRouter);

  // Ideas & Spark Engine API (persistent saved ideas + AI/procedural generation)
  const savedIdeasFile = path.join(dataDir, 'saved_ideas.json');
  function readSavedIdeas(): any[] {
    try {
      if (fs.existsSync(savedIdeasFile)) {
        const raw = fs.readFileSync(savedIdeasFile, 'utf-8');
        return JSON.parse(raw);
      }
    } catch { /* ignore fallback */ }
    return [];
  }
  function writeSavedIdeas(ideas: any[]) {
    try {
      fs.writeFileSync(savedIdeasFile, JSON.stringify(ideas, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to write saved ideas to .data/saved_ideas.json:', e);
    }
  }

  app.get('/api/script/saved-ideas', (_req, res) => {
    res.json({ success: true, data: readSavedIdeas() });
  });

  app.post('/api/script/saved-ideas', (req, res) => {
    const idea = req.body;
    if (!idea || !idea.id) return res.status(400).json({ error: 'Missing idea data' });
    const current = readSavedIdeas();
    const idx = current.findIndex((i: any) => i.id === idea.id);
    if (idx >= 0) {
      current[idx] = idea;
    } else {
      current.unshift(idea);
    }
    writeSavedIdeas(current);
    res.json({ success: true, data: current });
  });

  app.delete('/api/script/saved-ideas/:id', (req, res) => {
    const { id } = req.params;
    const current = readSavedIdeas().filter((i: any) => i.id !== id);
    writeSavedIdeas(current);
    res.json({ success: true, data: current });
  });

  app.post('/api/script/ideas', async (req, res) => {
    try {
      const { topic, niche } = req.body || {};
      const { generateIdeas } = await import('./server/ideasEngine.js');
      const generated = await generateIdeas(topic, niche);
      res.json({ success: true, data: generated });
    } catch (err: any) {
      console.error('Error generating ideas:', err);
      const { generateProceduralIdeas } = await import('./server/ideasEngine.js');
      res.json({ success: true, data: generateProceduralIdeas(req.body?.topic, req.body?.niche), fallback: true });
    }
  });

  app.use('/api/script', scriptRouter);
  app.use('/api/editor', editorRouter);

  // User profile.
  app.get('/api/user', async (_req, res) => {
    const user = await db.getUser();
    res.json({ success: true, data: user });
  });
  app.post('/api/user', async (req, res) => {
    const updated = await db.saveUser(req.body);
    res.json({ success: true, data: updated });
  });

  // AI & Model Settings
  app.get('/api/settings/ai-status', (_req, res) => {
    const key = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
    res.json({
      success: true,
      hasGeminiKey: !!key,
      keyMasked: key ? `••••••••••••${key.slice(-4)}` : null,
      model: 'gemini-2.0-flash',
    });
  });

  app.post('/api/settings/api-key', (req, res) => {
    const { apiKey } = req.body || {};
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(400).json({ error: 'API key string is required' });
    }
    const cleanKey = apiKey.trim();
    process.env.GEMINI_API_KEY = cleanKey;
    try {
      const envFile = path.join(appRoot, '.env');
      let envContent = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf-8') : '';
      if (envContent.includes('GEMINI_API_KEY=')) {
        envContent = envContent.replace(/GEMINI_API_KEY=.*/g, `GEMINI_API_KEY=${cleanKey}`);
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

  // Vite (React + Tailwind) in middleware mode.
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
  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  KontentOS Editorial Studio (Redesign) — standalone`);
    console.log(`  ▸ App + API : http://0.0.0.0:${PORT}`);
    console.log(`  ▸ Data       : ${dataDir}  (isolated from the original app)`);
    console.log(`  ▸ Uploads    : ${uploadsDir}\n`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
