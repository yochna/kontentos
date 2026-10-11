// KontentOS — Editorial Studio · timeline model shared by Raw → Reel + Smart Editor.
// Types mirror the backend `TimelineProject` EDL the /api/editor/auto-edit engine emits
// (KontentOS-main/src/types/timeline.ts) so a project round-trips with the server unchanged.

export type MediaType = 'video' | 'audio' | 'sfx' | 'text' | 'adjustment';
export type KeyframeEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'instant';

export interface Vector2D {
  x: number;
  y: number;
}

export interface TransformKeyframe {
  timeOffset: number;
  scale: number;
  position: Vector2D;
  rotation?: number;
  opacity?: number;
  easing: KeyframeEasing;
}

export interface AudioFX {
  pitchShiftCents: number;
  volume: number;
  fadeInSec: number;
  fadeOutSec: number;
}

export interface BaseClip {
  id: string;
  name: string;
  type: MediaType;
  startOnTimeline: number;
  duration: number;
  sourceStartOffset: number;
}

export interface VideoClip extends BaseClip {
  type: 'video';
  sourceFileId: string;
  sourceUrl?: string;
  speedMultiplier: number;
  keyframes: TransformKeyframe[];
  audioModifiers: AudioFX;
}

export interface SFXClip extends BaseClip {
  type: 'sfx';
  sfxAssetId: string;
  sourceUrl?: string;
  audioModifiers: AudioFX;
}

export interface AudioClip extends BaseClip {
  type: 'audio';
  sourceFileId: string;
  sourceUrl?: string;
  audioModifiers: AudioFX;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export type CaptionAnimation =
  | 'popIn'
  | 'fade'
  | 'kineticWave'
  | 'karaoke'
  | 'bouncePop'
  | 'typewriter'
  | 'neonPulse'
  | 'bannerPill'
  | 'none';

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface TextClip extends BaseClip {
  type: 'text';
  content: string;
  style: {
    fontFamily: string;
    fontSize: number;
    colorHex: string;
    activeWordColorHex?: string;
    strokeColorHex?: string;
    strokeWidth?: number;
    shadowColorHex?: string;
    glowIntensity?: number;
    backgroundColorHex?: string;
    bannerPillColorHex?: string;
    position: 'top' | 'middle' | 'bottom' | 'custom';
    customCoord?: Vector2D;
    animation: CaptionAnimation;
    words?: WordTimestamp[];
  };
}

export type CaptionStyle = TextClip['style'];

export interface AudioClip extends BaseClip {
  type: 'audio';
  sourceFileId: string;
  sourceUrl?: string;
  audioModifiers: AudioFX;
}

export type TimelineClip = VideoClip | SFXClip | TextClip | AudioClip;

export interface TimelineTrack {
  id: string;
  name: string;
  type: MediaType;
  isMuted: boolean;
  isLocked: boolean;
  volume?: number;
  zIndex: number;
  clips: TimelineClip[];
}

export interface ProjectMetadata {
  id: string;
  title: string;
  targetAspectRatio: '9:16' | '16:9' | '1:1';
  width: number;
  height: number;
  frameRate: number;
  totalDuration: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface GlobalAudioSettings {
  backgroundMusicAssetId?: string;
  backgroundMusicUrl?: string;
  bgmVolume: number;
  duckingEnabled: boolean;
}

export interface TimelineProject {
  schemaVersion: '1.0.0';
  projectMetadata: ProjectMetadata;
  globalAudioTracks: GlobalAudioSettings;
  tracks: TimelineTrack[];
}

// ---------------------------------------------------------------------------
// One-click presets (Raw → Reel). Each preset tunes the deterministic auto-edit
// engine options + the kinetic-caption look. No API key required to produce a real EDL.
// ---------------------------------------------------------------------------

export interface EditPreset {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  accent: 'primary' | 'secondary' | 'tertiary';
  options: {
    silenceThresholdSec: number;
    sfxEnabled: boolean;
    punchZoomEnabled: boolean;
    captionsEnabled: boolean;
  };
  caption: {
    animation: CaptionAnimation;
    position: 'top' | 'middle' | 'bottom';
    fontSize: number;
    colorHex: string;
    activeWordColorHex: string;
    wordsPerCue: number;
  };
  tone: string; // caption/copy tone hint sent to generate-from-title
}

export const PRESETS: EditPreset[] = [
  {
    id: 'punchy',
    name: 'Punchy Hook',
    tagline: 'Hard silence cuts, punch-zooms, viral SFX, word-pop captions.',
    icon: 'bolt',
    accent: 'tertiary',
    options: { silenceThresholdSec: 0.35, sfxEnabled: true, punchZoomEnabled: true, captionsEnabled: true },
    caption: { animation: 'popIn', position: 'middle', fontSize: 52, colorHex: '#FFFFFF', activeWordColorHex: '#FFE86F', wordsPerCue: 2 },
    tone: 'Viral & Punchy',
  },
  {
    id: 'clean',
    name: 'Clean Talking Head',
    tagline: 'Gentle deadwood trim, subtle zoom, tidy lower-third captions.',
    icon: 'graphic_eq',
    accent: 'primary',
    options: { silenceThresholdSec: 0.6, sfxEnabled: false, punchZoomEnabled: true, captionsEnabled: true },
    caption: { animation: 'fade', position: 'bottom', fontSize: 40, colorHex: '#FFFFFF', activeWordColorHex: '#9DD2BF', wordsPerCue: 4 },
    tone: 'Helpful & Clear',
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    tagline: 'Longer holds, slow push-ins, elegant serif captions. No SFX.',
    icon: 'local_movies',
    accent: 'secondary',
    options: { silenceThresholdSec: 0.8, sfxEnabled: false, punchZoomEnabled: false, captionsEnabled: true },
    caption: { animation: 'typewriter', position: 'bottom', fontSize: 34, colorHex: '#F4F1E8', activeWordColorHex: '#C98A58', wordsPerCue: 5 },
    tone: 'Cinematic & Premium',
  },
  {
    id: 'jumpcut',
    name: 'Rapid Jump-Cut',
    tagline: 'Aggressive trim of every pause, high energy, karaoke captions.',
    icon: 'sports_esports',
    accent: 'tertiary',
    options: { silenceThresholdSec: 0.25, sfxEnabled: true, punchZoomEnabled: true, captionsEnabled: true },
    caption: { animation: 'karaoke', position: 'middle', fontSize: 50, colorHex: '#FFFFFF', activeWordColorHex: '#7FB09A', wordsPerCue: 3 },
    tone: 'High-Energy',
  },
  {
    id: 'minimal',
    name: 'Minimal / Silent-Friendly',
    tagline: 'Light trim, no zooms or SFX, bold banner captions for muted viewing.',
    icon: 'contrast',
    accent: 'primary',
    options: { silenceThresholdSec: 0.7, sfxEnabled: false, punchZoomEnabled: false, captionsEnabled: true },
    caption: { animation: 'bannerPill', position: 'bottom', fontSize: 38, colorHex: '#FFFFFF', activeWordColorHex: '#FFFFFF', wordsPerCue: 3 },
    tone: 'Minimal',
  },
];

export function getPreset(id: string): EditPreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function totalDuration(project: TimelineProject): number {
  return project.projectMetadata.totalDuration || 0;
}

export function trackOf(project: TimelineProject, type: MediaType): TimelineTrack | undefined {
  return project.tracks.find((t) => t.type === type);
}

export function videoClips(project: TimelineProject): VideoClip[] {
  return (trackOf(project, 'video')?.clips ?? []) as VideoClip[];
}

export function textClips(project: TimelineProject): TextClip[] {
  return (trackOf(project, 'text')?.clips ?? []) as TextClip[];
}

export function sfxClips(project: TimelineProject): SFXClip[] {
  return (trackOf(project, 'sfx')?.clips ?? []) as SFXClip[];
}

/** The text cue (if any) active at a timeline position. */
export function activeCaptionAt(project: TimelineProject, t: number): TextClip | null {
  const cue = textClips(project).find((c) => t >= c.startOnTimeline && t < c.startOnTimeline + c.duration);
  return cue ?? null;
}

/** Which word within a cue is "hot" at time t (for karaoke / active-word highlight). */
export function activeWordIndex(cue: TextClip, t: number): number {
  if (!cue.style.words?.length) return -1;
  const local = t - cue.startOnTimeline + cue.sourceStartOffset;
  for (let i = 0; i < cue.style.words.length; i++) {
    const w = cue.style.words[i];
    if (local >= w.start && local < w.end) return i;
    if (local < w.start) return i;
  }
  return cue.style.words.length - 1;
}

/** Punch-zoom scale at a timeline position, derived from the active video clip's keyframes. */
export function punchScaleAt(project: TimelineProject, t: number): number {
  const clip = videoClips(project).find((c) => t >= c.startOnTimeline && t < c.startOnTimeline + c.duration);
  if (!clip || !clip.keyframes?.length) return 1;
  const local = t - clip.startOnTimeline;
  const kfs = [...clip.keyframes].sort((a, b) => a.timeOffset - b.timeOffset);
  let scale = kfs[0]?.scale ?? 1;
  for (const kf of kfs) {
    if (local >= kf.timeOffset) scale = kf.scale;
    else break;
  }
  return scale;
}

/** The source-time to seek the underlying <video> to for a given timeline position. */
export function sourceTimeAt(project: TimelineProject, t: number): number {
  const clips = videoClips(project);
  if (!clips.length) return 0;

  // 1. Direct hit inside clip [start, end)
  const clip = clips.find((c) => t >= c.startOnTimeline - 0.001 && t < c.startOnTimeline + c.duration);
  if (clip) {
    const elapsed = Math.max(0, Math.min(clip.duration, t - clip.startOnTimeline));
    return round2(clip.sourceStartOffset + elapsed * (clip.speedMultiplier || 1));
  }

  // 2. If at or past the end of the timeline / last clip, clamp to the very end of the last clip
  const lastClip = clips[clips.length - 1];
  if (t >= lastClip.startOnTimeline + lastClip.duration - 0.005) {
    return round2(lastClip.sourceStartOffset + lastClip.duration * (lastClip.speedMultiplier || 1));
  }

  // 3. If in a gap between cuts, hold the trailing frame of the preceding clip
  for (let i = clips.length - 1; i >= 0; i--) {
    if (t >= clips[i].startOnTimeline) {
      const c = clips[i];
      const elapsed = Math.max(0, Math.min(c.duration, t - c.startOnTimeline));
      return round2(c.sourceStartOffset + elapsed * (c.speedMultiplier || 1));
    }
  }

  // 4. Before the first clip, hold the first clip's start frame
  return round2(clips[0].sourceStartOffset);
}

/**
 * Synthesize word-level timestamps from plain text across a duration, using a
 * natural reading cadence with small pauses on punctuation. This lets the
 * deterministic editor engine build a full EDL even with no real transcript
 * (i.e. when GEMINI_API_KEY / Whisper is unavailable). When a real transcript
 * exists we use it instead and this is skipped.
 */
export function synthesizeWords(text: string, duration: number, opts: { pauseOnPunct?: boolean } = {}): WordTimestamp[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || duration <= 0) return [];
  const tokens = clean.split(' ').filter(Boolean);
  const n = tokens.length;
  // Weight pauses into the total budget.
  const pauseOnPunct = opts.pauseOnPunct ?? true;
  const weights: number[] = tokens.map((tok) => {
    let w = Math.max(0.25, tok.replace(/[^A-Za-z0-9]/g, '').length * 0.06);
    if (pauseOnPunct && /[.,!?;:]$/.test(tok)) w += 0.22;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const words: WordTimestamp[] = [];
  let cursor = 0;
  const leadPad = Math.min(0.15, duration * 0.02);
  cursor = leadPad;
  const usable = Math.max(0.2, duration - leadPad * 2);
  for (let i = 0; i < n; i++) {
    const dur = (weights[i] / total) * usable;
    const start = cursor;
    const end = Math.min(duration - leadPad, cursor + dur);
    words.push({ word: tokens[i], start: round2(start), end: round2(Math.max(end, start + 0.05)) });
    cursor = end;
  }
  return words;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${cs}`;
}

/**
 * Client-side EDL builder — a mirror of the backend's deterministic engine good
 * enough to keep both editors fully interactive even when /api is unreachable.
 * Groups words into cues, marks silence gaps as removed, and adds punch keyframes.
 */
export function buildLocalProject(
  video: { id: string; title: string; file_url: string; duration: number },
  words: WordTimestamp[],
  preset: EditPreset,
): TimelineProject {
  const duration = video.duration || (words.length ? words[words.length - 1].end : 12);
  const thr = preset.options.silenceThresholdSec;

  // 1. Group words into speech blocks split by silences > threshold.
  const blocks: WordTimestamp[][] = [];
  let cur: WordTimestamp[] = words.length ? [words[0]] : [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap >= thr) {
      blocks.push(cur);
      cur = [words[i]];
    } else {
      cur.push(words[i]);
    }
  }
  if (cur.length) blocks.push(cur);

  // 2. Rebuild contiguous video clips on the edited timeline.
  const clips: VideoClip[] = [];
  const textCues: TextClip[] = [];
  let timelineCursor = 0;
  const per = preset.caption.wordsPerCue;

  const sourceBlocks = blocks.length ? blocks : [[{ word: video.title, start: 0, end: duration } as WordTimestamp]];
  sourceBlocks.forEach((block, bi) => {
    const srcStart = block[0].start;
    const srcEnd = block[block.length - 1].end;
    const dur = Math.max(0.2, srcEnd - srcStart);
    const clip: VideoClip = {
      id: `vclip_${bi}`,
      name: `Segment ${bi + 1}`,
      type: 'video',
      startOnTimeline: round2(timelineCursor),
      duration: round2(dur),
      sourceStartOffset: round2(srcStart),
      sourceFileId: video.id,
      sourceUrl: video.file_url,
      speedMultiplier: 1,
      keyframes: preset.options.punchZoomEnabled
        ? [
            { timeOffset: 0, scale: 1, position: { x: 0, y: 0 }, easing: 'linear' },
            { timeOffset: round2(dur * 0.4), scale: 1.28, position: { x: 0, y: -0.05 }, easing: 'easeInOut' },
            { timeOffset: round2(Math.min(dur, dur * 0.4 + 1.2)), scale: 1, position: { x: 0, y: 0 }, easing: 'easeOut' },
          ]
        : [],
      audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0, fadeOutSec: 0 },
    };
    clips.push(clip);

    if (preset.options.captionsEnabled) {
      for (let i = 0; i < block.length; i += per) {
        const group = block.slice(i, i + per);
        const gStart = group[0].start;
        const gEnd = group[group.length - 1].end;
        const cueStart = timelineCursor + (gStart - srcStart);
        const cueDur = Math.max(0.3, gEnd - gStart);
        const upper = group.map((w) => w.word).join(' ').toUpperCase();
        textCues.push({
          id: `t_${clip.id}_${i}`,
          name: upper,
          type: 'text',
          startOnTimeline: round2(cueStart),
          duration: round2(cueDur),
          sourceStartOffset: round2(gStart),
          content: upper,
          style: {
            fontFamily: 'Newsreader, serif',
            fontSize: preset.caption.fontSize,
            colorHex: preset.caption.colorHex,
            activeWordColorHex: preset.caption.activeWordColorHex,
            strokeColorHex: '#000000',
            strokeWidth: 3,
            position: preset.caption.position,
            animation: preset.caption.animation,
            words: group.map((w) => ({ word: w.word, start: w.start - srcStart, end: w.end - srcStart })),
          },
        });
      }
    }
    timelineCursor += dur;
  });

  const total = round2(timelineCursor || duration);
  return {
    schemaVersion: '1.0.0',
    projectMetadata: {
      id: `proj_${Date.now()}`,
      title: video.title,
      targetAspectRatio: '9:16',
      width: 1080,
      height: 1920,
      frameRate: 30,
      totalDuration: total,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    globalAudioTracks: { bgmVolume: 0.25, duckingEnabled: true },
    tracks: [
      { id: 'track-text', name: 'Kinetic Captions', type: 'text', isMuted: false, isLocked: false, zIndex: 30, clips: textCues },
      { id: 'track-sfx', name: 'SFX Overlays', type: 'sfx', isMuted: false, isLocked: false, zIndex: 20, clips: [] },
      { id: 'track-video', name: 'Primary Video', type: 'video', isMuted: false, isLocked: false, zIndex: 10, clips },
    ],
  };
}

/** Apply a preset's caption look onto an engine-produced project (server or local). */
export function applyPresetLook(project: TimelineProject, preset: EditPreset): TimelineProject {
  const tracks = project.tracks.map((tr) => {
    if (tr.type !== 'text') return tr;
    const clips = (tr.clips as TextClip[]).map((c) => ({
      ...c,
      style: {
        ...c.style,
        fontFamily: 'Newsreader, serif',
        fontSize: preset.caption.fontSize,
        colorHex: preset.caption.colorHex,
        activeWordColorHex: preset.caption.activeWordColorHex,
        animation: preset.caption.animation,
        position: preset.caption.position,
      },
    }));
    return { ...tr, clips };
  });
  return { ...project, tracks };
}

/** Parses SRT timestamp "00:00:01,234" or "00:00:01.234" or number into seconds. */
export function parseSrtTimeToSeconds(timeStr: string | number): number {
  if (typeof timeStr === 'number') return timeStr;
  if (!timeStr) return 0;
  const match = timeStr.trim().match(/(?:(\d{1,2}):)?(\d{2}):(\d{2})[,\.](\d{1,3})/);
  if (!match) {
    const num = parseFloat(timeStr);
    return isNaN(num) ? 0 : num;
  }
  const h = parseInt(match[1] || '0', 10);
  const m = parseInt(match[2], 10);
  const s = parseInt(match[3], 10);
  const ms = parseInt(match[4].padEnd(3, '0').slice(0, 3), 10);
  return round2(h * 3600 + m * 60 + s + ms / 1000);
}

export interface LiveCaptionSegment {
  id?: number | string;
  start: string | number;
  end: string | number;
  text: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

/**
 * Builds kinetic, millisecond-aligned TextClip cues from AI speech-to-text segments.
 * If a segment is long, it breaks it into punchy 2-4 word kinetic social chunks with matching timeline intervals.
 */
export function buildCaptionsFromSegments(
  segments: LiveCaptionSegment[],
  styleOpts?: Partial<TextClip['style']>,
): TextClip[] {
  const cues: TextClip[] = [];
  const defaultStyle: TextClip['style'] = {
    fontFamily: styleOpts?.fontFamily || 'Newsreader, serif',
    fontSize: styleOpts?.fontSize || 44,
    colorHex: styleOpts?.colorHex || '#FFFFFF',
    activeWordColorHex: styleOpts?.activeWordColorHex || '#F3B747',
    strokeColorHex: styleOpts?.strokeColorHex || '#000000',
    strokeWidth: styleOpts?.strokeWidth ?? 3,
    position: styleOpts?.position || 'middle',
    animation: styleOpts?.animation || 'popIn',
  };

  segments.forEach((seg, sIdx) => {
    const startSec = parseSrtTimeToSeconds(seg.start);
    const endSec = parseSrtTimeToSeconds(seg.end);
    const totalSegDur = Math.max(0.2, endSec - startSec);
    const cleanText = (seg.text || '').replace(/\s+/g, ' ').trim();
    if (!cleanText) return;

    const words = cleanText.split(' ').filter(Boolean);
    if (!words.length) return;

    // Break into kinetic 3-word chunks (2-4 range)
    const chunkSize = 3;
    const wordDur = totalSegDur / words.length;

    for (let wIdx = 0; wIdx < words.length; wIdx += chunkSize) {
      const chunkWords = words.slice(wIdx, wIdx + chunkSize);
      const chunkStart = round2(startSec + wIdx * wordDur);
      const chunkDur = round2(Math.max(0.3, chunkWords.length * wordDur));
      const chunkText = chunkWords.join(' ').toUpperCase();

      const wordTimestamps = chunkWords.map((word, i) => {
        const wStart = round2(i * wordDur);
        const wEnd = round2((i + 1) * wordDur);
        return { word, start: wStart, end: wEnd };
      });

      cues.push({
        id: `live_cue_${sIdx}_${wIdx}_${Date.now()}`,
        name: chunkText,
        type: 'text',
        startOnTimeline: chunkStart,
        duration: chunkDur,
        sourceStartOffset: chunkStart,
        content: chunkText,
        style: {
          ...defaultStyle,
          words: wordTimestamps,
        },
      });
    }
  });

  return cues;
}

/** Replaces or adds the text captions track on a project with the supplied TextClips. */
export function applyCaptionsToProject(project: TimelineProject, captionClips: TextClip[]): TimelineProject {
  const p = cloneProject(project);
  let textTrack = p.tracks.find((t) => t.type === 'text');
  if (textTrack) {
    textTrack.clips = captionClips;
    textTrack.isMuted = false;
  } else {
    p.tracks.unshift({
      id: 'track-text',
      name: 'Kinetic Captions',
      type: 'text',
      isMuted: false,
      isLocked: false,
      zIndex: 30,
      clips: captionClips,
    });
  }
  return recomputeDuration(p);
}

/** Toggle muted state on the text track. */
export function toggleCaptionsTrack(project: TimelineProject, enabled?: boolean): TimelineProject {
  const p = cloneProject(project);
  const textTrack = p.tracks.find((t) => t.type === 'text');
  if (textTrack) {
    textTrack.isMuted = enabled !== undefined ? !enabled : !textTrack.isMuted;
  }
  return p;
}


// ---------------------------------------------------------------------------
// Interactive editorial operations (Smart Editor).
// Every op is a pure, immutable transform that returns a NEW project (or null
// when the edit is a no-op / out of bounds) so the store can snapshot history.
// ---------------------------------------------------------------------------

export function cloneProject(p: TimelineProject): TimelineProject {
  return JSON.parse(JSON.stringify(p)) as TimelineProject;
}

/** Recompute totalDuration from the furthest clip end across every track. */
export function recomputeDuration(project: TimelineProject): TimelineProject {
  let max = 0;
  for (const tr of project.tracks) {
    for (const c of tr.clips) max = Math.max(max, c.startOnTimeline + c.duration);
  }
  project.projectMetadata.totalDuration = round2(max);
  project.projectMetadata.updatedAt = new Date().toISOString();
  return project;
}

export interface LocatedClip {
  track: TimelineTrack;
  clip: TimelineClip;
  index: number;
}

export function locateClip(project: TimelineProject, clipId: string): LocatedClip | null {
  for (const track of project.tracks) {
    const index = track.clips.findIndex((c) => c.id === clipId);
    if (index !== -1) return { track, clip: track.clips[index], index };
  }
  return null;
}

/** The clip on a given track occupying a timeline position (used to target "S" key). */
export function clipAt(project: TimelineProject, type: MediaType, t: number): TimelineClip | null {
  const track = trackOf(project, type);
  if (!track || !track.clips.length) return null;
  return (
    track.clips.find((c) => t >= c.startOnTimeline - 0.001 && t <= c.startOnTimeline + c.duration + 0.005) ??
    null
  );
}

let splitSeq = 0;
function newId(base: string): string {
  splitSeq += 1;
  return `${base}_s${Date.now().toString(36)}${splitSeq}`;
}

/**
 * Split a clip at a timeline position. Handles video (source offset + keyframes)
 * and text (word partitioning) so both tracks stay perfectly in sync.
 * Returns null when the cut point is on/Outside the clip.
 */
export function splitClipAt(project: TimelineProject, clipId: string, atTime: number): TimelineProject | null {
  const loc = locateClip(project, clipId);
  if (!loc || loc.track.isLocked) return null;
  const { clip, track, index } = loc;
  const start = clip.startOnTimeline;
  const end = start + clip.duration;
  if (atTime <= start + 0.05 || atTime >= end - 0.05) return null;

  const next = cloneProject(project);
  const nTrack = next.tracks.find((t) => t.id === track.id)!;
  const nClip = nTrack.clips[index];
  const firstDur = round2(atTime - start);
  const secondDur = round2(end - atTime);

  const first: TimelineClip = { ...nClip, duration: firstDur };
  const second: TimelineClip = {
    ...nClip,
    id: newId(nClip.id),
    startOnTimeline: round2(atTime),
    duration: secondDur,
  };

  if (nClip.type === 'video') {
    const speed = (nClip as VideoClip).speedMultiplier || 1;
    const delta = firstDur * speed;
    (second as VideoClip).sourceStartOffset = round2(nClip.sourceStartOffset + delta);
    const kfs = (nClip as VideoClip).keyframes || [];
    (first as VideoClip).keyframes = kfs.filter((k) => k.timeOffset < firstDur);
    (second as VideoClip).keyframes = kfs
      .filter((k) => k.timeOffset >= firstDur)
      .map((k) => ({ ...k, timeOffset: round2(Math.max(0, k.timeOffset - firstDur)) }));
  }

  if (nClip.type === 'text') {
    const words = (nClip as TextClip).style.words || [];
    const firstWords = words.filter((w) => (w.start + w.end) / 2 <= firstDur);
    const secondWords = words
      .filter((w) => (w.start + w.end) / 2 > firstDur)
      .map((w) => ({ ...w, start: round2(w.start - firstDur), end: round2(w.end - firstDur) }));
    (first as TextClip).style.words = firstWords;
    (first as TextClip).content = firstWords.map((w) => w.word).join(' ') || (first as TextClip).content;
    (first as TextClip).name = (first as TextClip).content;
    (second as TextClip).style.words = secondWords;
    (second as TextClip).content = secondWords.map((w) => w.word).join(' ') || (second as TextClip).content;
    (second as TextClip).name = (second as TextClip).content;
  }

  nTrack.clips.splice(index, 1, first, second);
  recomputeDuration(next);
  return next;
}

/**
 * Trim a clip's leading or trailing edge to a timeline position.
 * - 'start': everything before `atTime` is removed (video source offset advances).
 * - 'end':   everything after  `atTime` is removed.
 * Returns null when the trim is out of range or would collapse the clip.
 */
export function trimClipEdge(
  project: TimelineProject,
  clipId: string,
  edge: 'start' | 'end',
  atTime: number,
): TimelineProject | null {
  const loc = locateClip(project, clipId);
  if (!loc || loc.track.isLocked) return null;
  const { clip, track, index } = loc;
  const start = clip.startOnTimeline;
  const end = start + clip.duration;

  const next = cloneProject(project);
  const nTrack = next.tracks.find((t) => t.id === track.id)!;
  const nClip = nTrack.clips[index];

  if (edge === 'start') {
    if (atTime <= start + 0.05 || atTime >= end - 0.05) return null;
    const cut = round2(atTime - start);
    if (nClip.type === 'video') {
      const speed = (nClip as VideoClip).speedMultiplier || 1;
      (nClip as VideoClip).sourceStartOffset = round2(nClip.sourceStartOffset + cut * speed);
      (nClip as VideoClip).keyframes = ((nClip as VideoClip).keyframes || [])
        .filter((k) => k.timeOffset >= cut)
        .map((k) => ({ ...k, timeOffset: round2(k.timeOffset - cut) }));
    }
    if (nClip.type === 'text') {
      const words = ((nClip as TextClip).style.words || []).filter((w) => (w.start + w.end) / 2 >= cut);
      (nClip as TextClip).style.words = words.map((w) => ({ ...w, start: round2(w.start - cut), end: round2(w.end - cut) }));
    }
    nClip.startOnTimeline = round2(atTime);
    nClip.duration = round2(end - atTime);
  } else {
    if (atTime >= end - 0.05 || atTime <= start + 0.05) return null;
    const keep = round2(atTime - start);
    if (nClip.type === 'video') {
      (nClip as VideoClip).keyframes = ((nClip as VideoClip).keyframes || []).filter((k) => k.timeOffset <= keep);
    }
    if (nClip.type === 'text') {
      const words = ((nClip as TextClip).style.words || []).filter((w) => (w.start + w.end) / 2 <= keep);
      (nClip as TextClip).style.words = words;
      (nClip as TextClip).content = words.map((w) => w.word).join(' ') || (nClip as TextClip).content;
    }
    nClip.duration = keep;
  }

  recomputeDuration(next);
  return next;
}

/**
 * Ripple secondary track clips (such as text captions or SFX overlays) when a primary
 * video clip is deleted or shortened, keeping everything locked in sync.
 */
function rippleTrackClips(clips: TimelineClip[], gapStart: number, gapDur: number): TimelineClip[] {
  const gapEnd = round2(gapStart + gapDur);
  const result: TimelineClip[] = [];

  for (const c of clips) {
    const start = c.startOnTimeline;
    const end = round2(start + c.duration);

    // 1. Entirely before the deleted gap: untouched
    if (end <= gapStart + 0.001) {
      result.push(c);
      continue;
    }

    // 2. Entirely after the deleted gap: shift left by gapDur
    if (start >= gapEnd - 0.001) {
      result.push({
        ...c,
        startOnTimeline: round2(Math.max(0, start - gapDur)),
      });
      continue;
    }

    // 3. Entirely inside the deleted gap: remove (drop from result)
    if (start >= gapStart - 0.001 && end <= gapEnd + 0.001) {
      continue;
    }

    // 4. Starts before gap, ends inside gap: trim end to gapStart
    if (start < gapStart - 0.001 && end <= gapEnd + 0.001) {
      const newDur = round2(gapStart - start);
      if (newDur <= 0.05) continue;
      const updated = { ...c, duration: newDur };
      if (c.type === 'text') {
        const textClip = c as TextClip;
        const words = (textClip.style.words || []).filter(
          (w) => start + (w.start + w.end) / 2 < gapStart,
        );
        (updated as TextClip).style = { ...textClip.style, words };
        (updated as TextClip).content =
          words.map((w) => w.word).join(' ') || textClip.content;
      }
      result.push(updated);
      continue;
    }

    // 5. Starts inside gap, ends after gap: shift start to gapStart and trim head
    if (start >= gapStart - 0.001 && end > gapEnd + 0.001) {
      const cutDur = round2(gapEnd - start);
      const newDur = round2(end - gapEnd);
      if (newDur <= 0.05) continue;
      const updated = {
        ...c,
        startOnTimeline: round2(gapStart),
        duration: newDur,
      };
      if (c.type === 'text') {
        const textClip = c as TextClip;
        const words = (textClip.style.words || [])
          .filter((w) => start + (w.start + w.end) / 2 >= gapEnd)
          .map((w) => ({
            ...w,
            start: round2(Math.max(0, w.start - cutDur)),
            end: round2(Math.max(0, w.end - cutDur)),
          }));
        (updated as TextClip).style = { ...textClip.style, words };
        (updated as TextClip).content =
          words.map((w) => w.word).join(' ') || textClip.content;
      }
      result.push(updated);
      continue;
    }

    // 6. Spans across entire gap (starts before gapStart, ends after gapEnd)
    if (start < gapStart - 0.001 && end > gapEnd + 0.001) {
      const newDur = round2(c.duration - gapDur);
      if (newDur <= 0.05) continue;
      const updated = {
        ...c,
        duration: newDur,
      };
      if (c.type === 'text') {
        const textClip = c as TextClip;
        const words = (textClip.style.words || [])
          .filter((w) => {
            const wordMid = start + (w.start + w.end) / 2;
            return wordMid < gapStart || wordMid >= gapEnd;
          })
          .map((w) => {
            const wordMid = start + (w.start + w.end) / 2;
            if (wordMid >= gapEnd) {
              return {
                ...w,
                start: round2(Math.max(0, w.start - gapDur)),
                end: round2(Math.max(0, w.end - gapDur)),
              };
            }
            return w;
          });
        (updated as TextClip).style = { ...textClip.style, words };
        (updated as TextClip).content =
          words.map((w) => w.word).join(' ') || textClip.content;
      }
      result.push(updated);
      continue;
    }
  }

  return result;
}

/** Remove a clip. When `ripple` is true and deleting a primary video clip, all unlocked tracks ripple to stay in sync. */
export function deleteClip(
  project: TimelineProject,
  clipId: string,
  ripple: boolean,
): TimelineProject | null {
  const loc = locateClip(project, clipId);
  if (!loc || loc.track.isLocked) return null;
  const next = cloneProject(project);
  const nTrack = next.tracks.find((t) => t.id === loc.track.id);
  if (!nTrack) return null;
  const idx = nTrack.clips.findIndex((c) => c.id === clipId);
  if (idx === -1) return null;
  const removed = nTrack.clips[idx];
  nTrack.clips.splice(idx, 1);

  if (ripple) {
    const gapStart = removed.startOnTimeline;
    const gapDur = removed.duration;

    if (nTrack.type === 'video') {
      // Primary video ripple: ripple all other unlocked tracks so captions & SFX remain locked in sync
      for (const track of next.tracks) {
        if (track.isLocked) continue;
        if (track.id === nTrack.id) {
          track.clips = track.clips.map((c) =>
            c.startOnTimeline >= gapStart + gapDur - 0.001
              ? { ...c, startOnTimeline: round2(Math.max(0, c.startOnTimeline - gapDur)) }
              : c,
          );
        } else {
          track.clips = rippleTrackClips(track.clips, gapStart, gapDur);
        }
      }
    } else {
      // For non-video tracks (e.g. deleting a single caption), only slide same track if needed
      // (do not ripple the video timeline)
    }
  }

  recomputeDuration(next);
  return next;
}

/** Nudge a clip's timeline start (clamped to >= 0). */
export function moveClip(
  project: TimelineProject,
  clipId: string,
  newStart: number,
): TimelineProject | null {
  const loc = locateClip(project, clipId);
  if (!loc || loc.track.isLocked) return null;
  const clamped = Math.max(0, round2(newStart));
  if (clamped === loc.clip.startOnTimeline) return null;
  const next = cloneProject(project);
  const nTrack = next.tracks.find((t) => t.id === loc.track.id)!;
  nTrack.clips[loc.index].startOnTimeline = clamped;
  recomputeDuration(next);
  return next;
}

/** Close every gap on all tracks by rippling clips to the start (a "tidy" pass). */
export function tightenGaps(project: TimelineProject): TimelineProject | null {
  const next = cloneProject(project);
  let changed = false;
  for (const track of next.tracks) {
    if (track.isLocked) continue;
    const sorted = [...track.clips].sort((a, b) => a.startOnTimeline - b.startOnTimeline);
    let cursor = 0;
    for (const c of sorted) {
      if (c.startOnTimeline > cursor + 0.001) {
        c.startOnTimeline = round2(cursor);
        changed = true;
      }
      cursor = Math.max(cursor, c.startOnTimeline + c.duration);
    }
    track.clips = sorted;
  }
  if (!changed) return null;
  recomputeDuration(next);
  return next;
}

