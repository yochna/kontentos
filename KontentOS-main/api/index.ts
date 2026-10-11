import express from 'express';
import dotenv from 'dotenv';
import * as db from '../server/db.js';
import uploadRouter from '../server/routes/upload.js';
import videosRouter from '../server/routes/videos.js';
import transcribeRouter from '../server/routes/transcribe.js';
import captionRouter from '../server/routes/caption.js';
import publishRouter from '../server/routes/publish.js';
import scriptRouter from '../server/routes/script.js';
import editorRouter from '../server/routes/editor.js';

dotenv.config();

const app = express();

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Health and DB diagnostic routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'KontentOS',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'production',
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

// Privacy Policy & Data Deletion handlers
const servePrivacy = (req: express.Request, res: express.Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>KontentOS - Privacy Policy</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #090d16; color: #f1f5f9; padding: 2.5rem 1.5rem; max-width: 800px; margin: 0 auto; line-height: 1.6; }
          h1 { color: #38bdf8; border-bottom: 1px solid rgba(56,189,248,0.2); padding-bottom: 0.5rem; }
          h2 { color: #a855f7; margin-top: 1.5rem; }
          .card { background: #111827; border: 1px solid #1f2937; padding: 1.5rem; border-radius: 12px; margin-top: 1rem; }
          a { color: #38bdf8; }
        </style>
      </head>
      <body>
        <h1>KontentOS Privacy Policy</h1>
        <p><em>Last updated: September 2026</em></p>
        <div class="card">
          <h2>1. Standalone, Account-Free Creator Suite</h2>
          <p>KontentOS is designed as a direct-to-creator editing, teleprompter, and scripting studio. It does not require login, account registration, or third-party OAuth access.</p>
          
          <h2>2. Media Storage & Privacy</h2>
          <p>All recorded and uploaded footage is processed within your private studio session. We never sell, track, or share your content with external ad networks.</p>

          <h2>3. Contact Us</h2>
          <p>For questions or privacy inquiries, contact: <a href="mailto:spicychipsind@gmail.com">spicychipsind@gmail.com</a></p>
        </div>
      </body>
    </html>
  `);
};

const serveDeletion = (req: express.Request, res: express.Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>KontentOS - User Data Management</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #090d16; color: #f1f5f9; padding: 2.5rem 1.5rem; max-width: 800px; margin: 0 auto; line-height: 1.6; }
          h1 { color: #38bdf8; border-bottom: 1px solid rgba(56,189,248,0.2); padding-bottom: 0.5rem; }
          .card { background: #111827; border: 1px solid #1f2937; padding: 1.5rem; border-radius: 12px; margin-top: 1rem; }
        </style>
      </head>
      <body>
        <h1>User Data Management</h1>
        <div class="card">
          <p>KontentOS does not connect to external social platform OAuth accounts or retain tracking cookies. All local video drafts and generated scripts can be cleared at any time directly from your browser storage or video gallery.</p>
          <p>For explicit manual deletion inquiries, contact <a href="mailto:spicychipsind@gmail.com" style="color:#38bdf8;">spicychipsind@gmail.com</a>.</p>
        </div>
      </body>
    </html>
  `);
};

app.get('/privacy-policy', servePrivacy);
app.head('/privacy-policy', servePrivacy);
app.get('/data-deletion', serveDeletion);
app.head('/data-deletion', serveDeletion);

// User Profile endpoints
app.get('/api/user', async (req, res) => {
  const user = await db.getUser();
  res.json({ success: true, data: user });
});

app.post('/api/user', async (req, res) => {
  const updated = await db.saveUser(req.body);
  res.json({ success: true, data: updated });
});

export default app;
