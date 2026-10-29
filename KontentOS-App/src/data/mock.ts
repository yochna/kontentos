// KontentOS — Editorial Studio · representative data for all screens.
// Anything shown here is sample content: it is never a real creator's identity,
// and screens must prefer live store data over these constants.

/* ------------------------------- Command Center ------------------------------- */

export const quickActions = [
  { id: 'ideas', icon: 'lightbulb', title: 'Find an idea', body: 'Discover what to create next & analyze trending publisher signals.', tag: '#FounderLed', tag2: '+12 tags' },
  { id: 'raw-reel', icon: 'play_circle', title: 'Make a Reel', body: 'Turn raw ingested clips into a finished, narrative vertical broadcast.', tag: 'Auto-stitch ready' },
  { id: 'smart-editor', icon: 'tune', title: 'Edit content', body: 'Refine existing compositions with our smart editorial assistance bar.', tag: 'Precision timeline · 60fps' },
  { id: 'publish-schedule', icon: 'send', title: 'Publish', body: 'Preview, package and schedule one dispatch for every channel you post to.', tag: 'Export bundle ready' },
];

/* ---------------------------------- Ideas ---------------------------------- */

export const ideaFilters = [
  { id: 'all', label: 'All Ideas', count: 24 },
  { id: 'trending', label: 'Trending Wave', icon: 'local_fire_department' },
  { id: 'niche', label: 'Your Niche (Studio & SaaS)', icon: 'target' },
  { id: 'saved', label: 'Saved Archetypes', count: 12, icon: 'bookmark' },
  { id: 'historical', label: 'From Historical Transcripts', icon: 'history' },
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

export const ideas: Idea[] = [
  {
    id: 'i1', category: 'Trending Sprint', categoryTone: 'tertiary',
    title: '5 AI tools that actually save small businesses time',
    excerpt: 'Exposing zero-productivity gimmickry and presenting 5 grounded agents that execute real back-office work.',
    format: 'Reel · 30 sec', metric: 'Hook: 94%', thumb: 'a',
    imageId: 'eGGFZ5X2LnA', imageAlt: 'Macro of an AI processor chip on a circuit board',
    blueprint: {
      focus: 'Trending Focus',
      why: 'Strong pain point + practical tangible outcome for founders. Addresses cynicism around generic AI hype by promising zero-friction utilitarian tools.',
      formats: ['Reel (30s)', 'Carousel', 'LinkedIn Post', 'YouTube Short'],
      hook: '“You’re probably wasting 3 hours every week doing manual reporting. Here’s what we do instead:”',
      hookScore: 94,
      beats: [
        { label: 'Beat 1: The Problem', time: '5 sec', body: 'Quick cut of overwhelming desktop spreadsheets with a red overlay timer.' },
        { label: 'Beat 2: 3 Tool Demos', time: '18 sec', body: 'Rapid 6s screen recordings showing one-click pipeline automations.' },
        { label: 'Beat 3: Key Takeaway', time: '7 sec', body: 'Founders checklist graphic displayed with bookmark prompt call to action.' },
      ],
    },
  },
  {
    id: 'i2', category: 'High Potential', categoryTone: 'primary',
    title: 'Why small businesses are replacing spreadsheets with automated ops',
    excerpt: 'A sharp breakdown of manual calculation fragility compared against modern autonomous systems.',
    format: 'Carousel · 8 slides', metric: 'Viral Resonance', thumb: 'b',
    imageId: 'Wpnoqo2plFA', imageAlt: 'Close-up of a spreadsheet full of figures on a screen',
    blueprint: {
      focus: 'Authority Builder',
      why: 'Contrarian framing that reframes a familiar tool as a liability — high save-intent for operators.',
      formats: ['Carousel', 'LinkedIn Post', 'Thread'],
      hook: '“Your spreadsheet isn’t saving you money. It’s quietly costing you 11 hours a week.”',
      hookScore: 88,
      beats: [
        { label: 'Slide 1: The myth', time: '—', body: 'Familiar green grid, then a red error cascade.' },
        { label: 'Slides 2–7: The cost', time: '—', body: 'One fragility example per slide with hard numbers.' },
        { label: 'Slide 8: The fix', time: '—', body: 'Architecture diagram + soft CTA.' },
      ],
    },
  },
  {
    id: 'i3', category: 'Your Niche', categoryTone: 'secondary',
    title: 'What nobody tells you about creator automation in 2025',
    excerpt: 'The uncomfortable reality: when everyone uses identical LLM chains, bespoke artisanal curation wins.',
    format: 'Reel / Short · 45 sec', metric: 'Direct Dialogue', thumb: 'c',
    imageId: 'DqmXihYx5UE', imageAlt: 'Videographer operating a cinema camera on a film set',
    blueprint: {
      focus: 'Contrarian',
      why: 'Pattern-interrupt honesty builds trust and differentiates your voice from AI-slop creators.',
      formats: ['Reel (45s)', 'Talking Head', 'Short'],
      hook: '“Everyone’s automation stack is identical. Let me prove it in 20 seconds.”',
      hookScore: 91,
      beats: [
        { label: 'Beat 1: Reveal', time: '8 sec', body: 'Side-by-side of five creators’ identical outputs.' },
        { label: 'Beat 2: Explain', time: '24 sec', body: 'Why sameness happens + the artisanal counter-move.' },
        { label: 'Beat 3: Invite', time: '13 sec', body: 'Prompt the audience to share their stack.' },
      ],
    },
  },
  {
    id: 'i4', category: 'Transparent Studio', categoryTone: 'neutral',
    title: 'Behind the scenes of our 4-person design studio workflow',
    excerpt: 'A documentary-style walk through asynchronous handoffs, Figma design tokens, and Notion ops.',
    format: 'Longform Thread · 6 parts', metric: 'Authority builder', thumb: 'd',
    imageId: 'qC2n6RQU4Vw', imageAlt: 'Design team collaborating over wireframe sketches and sticky notes',
    blueprint: {
      focus: 'BTS / Documentary',
      why: 'Process transparency is the highest-retention format for design-literate audiences.',
      formats: ['Thread', 'Longform Reel', 'Carousel'],
      hook: '“Four people. Zero stand-ups. Here’s the exact system that ships our work.”',
      hookScore: 85,
      beats: [
        { label: 'Part 1: Capture', time: '—', body: 'How an idea enters the board.' },
        { label: 'Parts 2–5: Handoffs', time: '—', body: 'Each discipline’s async pass.' },
        { label: 'Part 6: Ship', time: '—', body: 'Publish + feedback loop.' },
      ],
    },
  },
  {
    id: 'i5', category: 'Metric Runbook', categoryTone: 'primary',
    title: 'The 3 metrics every solo founder should track daily',
    excerpt: 'Cutting through vanity analytics: cash runway burn velocity, creator retention quotient, and…',
    format: 'Reel · 40 sec', metric: 'Evergreen', thumb: 'e',
    imageId: 'qwtCeJ5cLYs', imageAlt: 'Analytics dashboard showing CTR, cost-per-conversion and quality-score metrics',
    blueprint: {
      focus: 'Educational',
      why: 'Evergreen utility content that compounds saves and positions you as operator-grade.',
      formats: ['Reel (40s)', 'Short', 'Carousel'],
      hook: '“Ignore your follower count. Track these three instead.”',
      hookScore: 90,
      beats: [
        { label: 'Beat 1: Reframe', time: '6 sec', body: 'Dismiss vanity metrics on screen.' },
        { label: 'Beat 2: The 3', time: '26 sec', body: 'Each metric with a live dashboard peek.' },
        { label: 'Beat 3: Template', time: '8 sec', body: 'Offer the runbook template as a save trigger.' },
      ],
    },
  },
  {
    id: 'i6', category: 'Bespoke Angle', categoryTone: 'neutral',
    title: 'Generate a bespoke angle from your archives',
    excerpt: 'Mine historical newsletter archives for unfilmed core arguments worth reshaping into a reel.',
    format: 'AI Synthesis', metric: 'From your content', thumb: 'f',
    imageId: '1tCQcTjLoRQ', imageAlt: 'Vintage handwritten journal with an old photograph and pressed flowers',
    blueprint: {
      focus: 'Repurpose',
      why: 'Resurfacing proven writing de-risks new production and rewards existing subscribers.',
      formats: ['Reel', 'Short', 'Post'],
      hook: '“I wrote this two years ago and it’s even more true now.”',
      hookScore: 82,
      beats: [
        { label: 'Beat 1: Quote', time: '5 sec', body: 'Pull the strongest archived line.' },
        { label: 'Beat 2: Update', time: '20 sec', body: 'What changed since you wrote it.' },
        { label: 'Beat 3: Bridge', time: '9 sec', body: 'Link to the original piece.' },
      ],
    },
  },
];

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

export const dispatchModes = [
  { id: 'peak', title: 'Peak Audience Window', tag: 'Optimal', body: 'Calculated dynamic dispatch based on real-time viewer concurrency.', selected: true },
  { id: 'custom', title: 'Custom Scheduled Slot', body: 'Define bespoke publishing calendar coordinates.' },
  { id: 'now', title: 'Publish Immediately', body: 'Immediate webhook dispatch across all active platforms.' },
];

export const dispatchReadiness = [
  '9:16 Video normalized & encoded',
  'Safe-zone captions & stickers verified',
  'Thumbnails rendered for IG / YouTube',
  'Platform metadata schemas matched',
];

export const recommendedTags = ['#creatorops', '#solopreneur', '#aiworkflow', '#videotools'];

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
