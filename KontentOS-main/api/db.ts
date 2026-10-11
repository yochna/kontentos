import * as db from '../server/db.js';

export default async function handler(req: any, res: any) {
  try {
    const isSupabase = db.isSupabaseConnected();
    const videos = await db.listVideos();
    res.status(200).json({
      status: 'ok',
      provider: isSupabase ? 'supabase' : 'local_persistent_json',
      connected: true,
      video_count: videos.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Database status check failed' });
  }
}
