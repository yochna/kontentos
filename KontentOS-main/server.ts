import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import * as db from './server/db.js';
import uploadRouter from './server/routes/upload.js';
import videosRouter from './server/routes/videos.js';
import transcribeRouter from './server/routes/transcribe.js';
import captionRouter from './server/routes/caption.js';
import publishRouter from './server/routes/publish.js';
import scriptRouter from './server/routes/script.js';
import editorRouter from './server/routes/editor.js';

dotenv.config();

const __dirname = process.cwd();

export function createApp() {
  const app = express();

  // CORS and Cross-Origin Isolation headers for WebAssembly SharedArrayBuffer
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Cross-Origin-Embedder-Policy', 'credentialless');
    res.header('Cross-Origin-Opener-Policy', 'same-origin');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Middleware for JSON & form parsing
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // Static serving for uploaded video and media files
  const uploadsDir = path.join(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsDir));

  // Health and DB diagnostic routes
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      app: 'KontentOS',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
    });
  });

  app.get('/api/db/status', async (req, res) => {
    const isSupabase = db.isSupabaseConnected();
    const videos = await db.listVideos();
    res.json({
      status: 'ok',
      provider: isSupabase ? 'supabase' : 'local_persistent_json',
      connected: true,
      video_count: videos.length,
    });
  });

  // Core API Routers
  app.use('/api/upload', uploadRouter);
  app.use('/api/videos', videosRouter);
  app.use('/api/transcribe', transcribeRouter);
  app.use('/api/caption', captionRouter);
  app.use('/api/publish', publishRouter);
  app.use('/api/script', scriptRouter);
  app.use('/api/editor', editorRouter);

  // User Profile endpoints
  app.get('/api/user', async (req, res) => {
    const user = await db.getUser();
    res.json({ success: true, data: user });
  });

  app.post('/api/user', async (req, res) => {
    const updated = await db.saveUser(req.body);
    res.json({ success: true, data: updated });
  });

  return app;
}

export const app = createApp();

// Local Dev / Container Runner (Bypassed automatically on Vercel)
if (!process.env.VERCEL) {
  const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
  
  if (process.env.NODE_ENV !== 'production') {
    createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    }).then((vite) => {
      app.use(vite.middlewares);
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`KontentOS dev server running on http://0.0.0.0:${PORT}`);
      });
    }).catch((err) => {
      console.error('Failed to start Vite dev server:', err);
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`KontentOS server running on http://0.0.0.0:${PORT}`);
    });
  }
}
