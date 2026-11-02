// KontentOS — Editorial Studio · representative data for all screens.
// Anything shown here is sample content: it is never a real creator's identity,
// and screens must prefer live store data over these constants.

/* ------------------------------- Command Center ------------------------------- */

export const quickActions = [
  { id: 'ideas', icon: 'lightbulb', title: 'Seed an angle', body: 'Decide what the cut is about before you shoot it.', tag: 'In · Seeds' },
  { id: 'raw-reel', icon: 'play_circle', title: 'Intake a take', body: 'Drop the footage, read the transcript, cut the first vertical pass.', tag: 'In · Intake' },
  { id: 'smart-editor', icon: 'tune', title: 'Cut it', body: 'Trim, zoom and caption on a frame-accurate timeline.', tag: 'Cut · Bench' },
  { id: 'publish-schedule', icon: 'send', title: 'Queue it', body: 'Write the caption once, set the date you will post.', tag: 'Out · Ship' },
];

export interface Idea {
  id: string;
  category: string;
  categoryTone: 'tertiary' | 'primary' | 'secondary' | 'neutral';
  title: string;
  excerpt: string;
  format: string;
  metric: string;
  thumb: string; // gradient key (image fallback)
  imageId: string; // hand-picked Unsplash photo id, chosen for THIS card's topic
  imageAlt: string; // descriptive alt, grounded in the idea's subject
  blueprint: {
    focus: string;
    why: string;
    formats: string[];
    hook: string;
    hookScore: number;
    beats: { label: string; time: string; body: string }[];
  };
}


/* ------------------------------ Raw → Reel ------------------------------ */

export const mediaClips = [
  { id: 'm1', label: 'Clip 1: Main Talking Head', sub: 'A-Roll Master · 4K 24fps', dur: '00:45', kind: 'a-roll' },
  { id: 'm2', label: 'Clip 2: Screen Capture', sub: 'B-Roll UI · 60fps', dur: '00:20', kind: 'b-roll' },
  { id: 'm3', label: 'Clip 3: Coffee / Desk Ambience', sub: 'B-Roll Cut · Atmospheric', dur: '00:15', kind: 'b-roll' },
  { id: 'm4', label: 'Clip 4: Reaction Insert', sub: 'Micro B-Roll · 120fps', dur: '00:08', kind: 'b-roll' },
];

export const smartAssist = [
  { icon: 'video_stable', label: '14 clips detected', value: 'Raw sync ok' },
  { icon: 'bolt', label: '6 strong moments', value: 'High Energy' },
  { icon: 'format_quote', label: '3 potential hooks', value: 'Ranked #1', highlight: true },
  { icon: 'content_cut', label: '1 long silence removed', value: '-3.4s cut', good: true },
];

export const aiActions = [
  { icon: 'content_cut', title: 'Remove Silence', sub: 'Threshold: -42dB', state: 'Applied' },
  { icon: 'bolt', title: 'Optimize Hook', sub: 'Retention booster', state: 'Active', note: 'Variant A: “The …+34% ret”', active: true },
  { icon: 'video_library', title: 'Auto B-Roll Pacing', sub: '3 switch points recommended', state: 'Apply' },
];

export const captionPresets = ['Clean', 'Bold', 'Kinetic', 'Minimal'];
export const captionAnim = ['None', 'Word-by-Word Highlight', 'Pop', 'Slide'];
export const captionPlacement = ['Top (15%)', 'Center', 'Bottom (80%)'];
export const brandPills = ['#285c4d', '#9dd2bf', '#c98a58', '#1e2522', '#ffffff'];
export const channelProfiles = ['Instagram Reels', 'TikTok', 'YouTube Shorts'];

/* ------------------------------ Smart Editor ------------------------------ */

export const editorTracks = [
  { id: 't1', name: 'Text', icon: 'title', blocks: [{ label: 'THE BEST VIEWS', start: 0, w: 22 }, { label: 'ARE THE ONES YOU', start: 24, w: 24 }, { label: 'EARN', start: 50, w: 12 }] },
  { id: 't2', name: 'Video', icon: 'movie', blocks: [{ label: 'Clip 1 · Talking', start: 0, w: 40 }, { label: 'Clip 2 · Demo', start: 42, w: 30 }, { label: 'Clip 3', start: 74, w: 20 }] },
  { id: 't3', name: 'Audio', icon: 'graphic_eq', waveform: true },
];

export const editorActions = [
  { icon: 'content_cut', title: 'Remove silence', desc: 'Trim dead air across all tracks' },
  { icon: 'bolt', title: 'Improve hook', desc: 'Reorder the first 3 seconds' },
  { icon: 'subtitles', title: 'Captions', desc: 'Kinetic word-by-word styling' },
  { icon: 'music_note', title: 'Music', desc: 'Auto-ducked background bed' },
  { icon: 'video_library', title: 'B-roll', desc: 'Insert suggested cutaways' },
  { icon: 'volume_up', title: 'Enhance voice', desc: 'Studio-grade vocal cleanup' },
];

/* ---------------------------- Publish & Schedule ---------------------------- */

// No OAuth is wired up, so no destination is verifiably connected and no handle is known
// until the creator fills in Settings — PublishSchedule substitutes the saved profile handle.
export const channels = [
  { id: 'ig', name: 'Instagram Reel', handle: '', icon: 'photo_camera', connected: false, on: true },
  { id: 'yt', name: 'YouTube Shorts', handle: '', icon: 'smart_display', connected: false, on: true },
  { id: 'tt', name: 'TikTok', handle: '', icon: 'music_note', connected: false, on: true },
  { id: 'li', name: 'LinkedIn Post', handle: '', icon: 'badge', connected: false, on: true },
  { id: 'x', name: 'X / Twitter', handle: 'Disconnected', icon: 'tag', connected: false, on: false },
  { id: 'fb', name: 'Facebook', handle: 'Inactive', icon: 'group', connected: false, on: false },
];

/* ------------------------------ Content Library ------------------------------ */

export const libraryFilters = [
  { id: 'all', label: 'All Assets', count: 128 },
  { id: 'reels', label: 'Finished Reels', count: 34 },
  { id: 'broll', label: 'Raw Video B-Roll', count: 62 },
  { id: 'audio', label: 'Audio & Voice Takes', count: 18 },
  { id: 'scripts', label: 'Draft Scripts', count: 14 },
];

export const libraryScope = ['Instagram', 'YouTube Shorts', 'LinkedIn', 'TikTok'];

export interface LibraryAsset {
  id: string;
  type: 'video' | 'audio' | 'script';
  status: string;
  statusTone: 'primary' | 'tertiary' | 'secondary' | 'neutral';
  title: string;
  body: string;
  metaLeft: string;
  metaRight: string;
  thumb: string;
  duration?: string;
  tags?: string[];
}

export const libraryAssets: LibraryAsset[] = [
  { id: 'l1', type: 'video', status: 'Published', statusTone: 'primary', title: '5 AI tools for busy founders', body: 'Pacing breakdown covering intelligent scheduling, context retrieval synthesis, and…', metaLeft: '48.2K views', metaRight: '3.8K saves', thumb: 'a', duration: '00:32' },
  { id: 'l2', type: 'video', status: 'In Polish (72%)', statusTone: 'tertiary', title: 'Travel Vlog: Architecture of…', body: 'Visual essay analyzing spatial acoustics in modern Nordic libraries. Color grading pass…', metaLeft: '#cinematic', metaRight: '#essay', thumb: 'c', duration: '00:48' },
  { id: 'l3', type: 'video', status: 'Ready to Cut', statusTone: 'secondary', title: 'Desk Setup & Mechanical…', body: 'Ingested 2h ago · 14.8 GB', metaLeft: 'Sony A7SIII', metaRight: 'Raw 4K 120fps · SLOG3', thumb: 'e' },
  { id: 'l4', type: 'video', status: 'Published', statusTone: 'primary', title: 'Why spreadsheets are dead in…', body: 'Contrarian thesis examining canvas databases vs tabular layouts. Highest organi…', metaLeft: '112.4K views', metaRight: 'Resonance 94/100', thumb: 'b', duration: '00:28' },
  { id: 'l5', type: 'audio', status: 'Mastered', statusTone: 'neutral', title: 'Solitude in Copenhagen — Ep…', body: 'Studio microphone master take with room impulse response subtraction applied. Clean…', metaLeft: '32-bit Float', metaRight: 'Auto-Denoised', thumb: 'd', duration: '08:45' },
  { id: 'l6', type: 'script', status: 'Draft (48%)', statusTone: 'secondary', title: 'Stop building boring AI apps', body: 'Screen recording narrative breaking down tactile interfaces and skeuomorphic…', metaLeft: 'Kinetic Typo Sync', metaRight: 'Paper Editorial', thumb: 'f' },
];

export const ingestFeatures = ['Automatic silence removal', 'Whisper-3 speech transcription', 'Multi-cam take clustering'];

/* --------------------------------- Calendar --------------------------------- */

export const calendarEvents = [
  { id: 'e1', date: '2026-09-21', time: '17:00', title: '5 AI Tools for busy founders', platform: 'Instagram', kind: 'Reel', state: 'Ready' },
  { id: 'e2', date: '2026-09-22', time: '08:30', title: 'Founder Thought of the Day', platform: 'LinkedIn', kind: 'Post', state: 'Scheduled' },
  { id: 'e3', date: '2026-09-23', time: '11:15', title: 'Weekly Brand Recap', platform: 'YouTube', kind: 'Short', state: 'Scheduled' },
  { id: 'e4', date: '2026-09-25', time: '10:15', title: 'Weekend Founder Thoughts', platform: 'TikTok', kind: 'Reel', state: 'Queued' },
  { id: 'e5', date: '2026-09-19', time: '09:00', title: 'Systems That Sell', platform: 'Instagram', kind: 'Reel', state: 'Published' },
];

/* --------------------------------- Analytics --------------------------------- */

// Intentionally empty: the Analytics screen computes every figure from live store data
// (videos, scheduled posts, publish history). Fabricated performance numbers used to live here.

/* --------------------------------- Brand Kit --------------------------------- */

export const brandKit = {
  // A new creator has no voice profile yet. These stay empty so the Brand Kit never shows
  // someone else's persona; the palette, fonts and hook formulas below are product defaults.
  voiceArchetype: '',
  catchphrase: '',
  bannedWords: '',
  tone: '',
  palette: ['#285c4d', '#4d7365', '#c98a58', '#1e2522', '#faf9f5'],
  fonts: ['Newsreader', 'Hanken Grotesk'],
  hooks: [
    'Curiosity Gap — “Nobody is talking about…”',
    'Negative Frame — “Stop paying for this…”',
    'Direct Address — “You’re probably wasting…”',
  ],
  avatar: '',
};

/* ---------------------------------- Settings ---------------------------------- */

export const settingsSections = [
  { id: 'account', title: 'Account & Profile', icon: 'person', desc: 'Name, handle, avatar, connected publisher accounts.' },
  { id: 'ai', title: 'AI Engine', icon: 'smart_toy', desc: 'Default model, temperature, and generation limits.' },
  { id: 'appearance', title: 'Appearance', icon: 'dark_mode', desc: 'Theme, density, and reduced-motion preferences.' },
  { id: 'keys', title: 'API Keys', icon: 'vpn_key', desc: 'Database, Google GenAI, and platform tokens.' },
  { id: 'exports', title: 'Exports', icon: 'download', desc: 'Default resolution, codec, and watermark options.' },
];

export const thumbGradient: Record<string, string> = {
  a: 'linear-gradient(135deg,#285c4d,#4d7365)',
  b: 'linear-gradient(135deg,#3c6e7a,#5b8a9c)',
  c: 'linear-gradient(135deg,#6b5b95,#7d6b8f)',
  d: 'linear-gradient(135deg,#b08233,#c98a58)',
  e: 'linear-gradient(135deg,#4d7c5f,#6e9c88)',
  f: 'linear-gradient(135deg,#a86a4a,#c98a58)',
};
