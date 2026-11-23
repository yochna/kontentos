// KontentOS — Editorial Studio · timeline model shared by Raw → Reel + Smart Editor.
// Types mirror the backend `TimelineProject` EDL the /api/editor/auto-edit engine emits
// (KontentOS-main/src/types/timeline.ts) so a project round-trips with the server unchanged.

import { aspectGeometry, type ExportAspect } from './mediaPlan';

export type MediaType = 'video' | 'audio' | 'sfx' | 'text' | 'adjustment';
export type KeyframeEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'cubicBezier' | 'instant';

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
  parentClipId?: string;
}

export type TransitionType = 'none' | 'flash' | 'fade' | 'wipeleft' | 'fadeblack';

export interface ClipTransition {
  type: TransitionType;
  durationSec: number;
}

export interface VideoClip extends BaseClip {
  type: 'video';
  sourceFileId: string;
  sourceUrl?: string;
  speedMultiplier: number;
  keyframes: TransformKeyframe[];
  audioModifiers: AudioFX;
  transition?: ClipTransition;
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

export type TargetAspectRatio = '9:16' | '16:9' | '1:1' | '4:5';

/** Preset-wide look applied by both the preview and the FFmpeg exporter. */
export type VisualLook = 'viral' | 'clean' | 'cinematic' | 'bold' | 'warm';

export interface ProjectMetadata {
  id: string;
  title: string;
  targetAspectRatio: TargetAspectRatio;
  width: number;
  height: number;
  frameRate: number;
  visualLook?: VisualLook;
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
  visualLook: VisualLook;
  caption: {
    animation: CaptionAnimation;
    position: 'top' | 'middle' | 'bottom';
    fontSize: number;
    colorHex: string;
    activeWordColorHex: string;
    wordsPerCue: number;
    fontFamily?: string;
    strokeColorHex?: string;
    strokeWidth?: number;
    shadowColorHex?: string;
    bannerPillColorHex?: string;
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
    visualLook: 'viral',
    caption: {
      animation: 'bouncePop',
      position: 'bottom',
      fontSize: 64,
      colorHex: '#FFFFFF',
      activeWordColorHex: '#FFE066',
      wordsPerCue: 3,
      strokeColorHex: '#000000',
      strokeWidth: 6,
      shadowColorHex: 'rgba(0,0,0,0.92)',
      bannerPillColorHex: 'rgba(0,0,0,0.58)',
    },
    tone: 'Viral & Punchy',
  },
  {
    id: 'clean',
    name: 'Clean Talking Head',
    tagline: 'Gentle deadwood trim, subtle zoom, tidy lower-third captions.',
    icon: 'graphic_eq',
    accent: 'primary',
    options: { silenceThresholdSec: 0.6, sfxEnabled: false, punchZoomEnabled: true, captionsEnabled: true },
    visualLook: 'clean',
    caption: {
      animation: 'fade',
      position: 'bottom',
      fontSize: 56,
      colorHex: '#FFFFFF',
      activeWordColorHex: '#9DD2BF',
      wordsPerCue: 4,
      fontFamily: 'system-ui, sans-serif',
      strokeColorHex: '#000000',
      strokeWidth: 5,
      shadowColorHex: 'rgba(0,0,0,0.9)',
      bannerPillColorHex: 'rgba(0,0,0,0.52)',
    },
    tone: 'Helpful & Clear',
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    tagline: 'Longer holds, slow push-ins, elegant serif captions. No SFX.',
    icon: 'local_movies',
    accent: 'secondary',
    options: { silenceThresholdSec: 0.8, sfxEnabled: false, punchZoomEnabled: false, captionsEnabled: true },
    visualLook: 'cinematic',
    caption: {
      animation: 'typewriter',
      position: 'bottom',
      fontSize: 52,
      colorHex: '#F7F3EA',
      activeWordColorHex: '#E2A56A',
      wordsPerCue: 4,
      fontFamily: 'Georgia, serif',
      strokeColorHex: '#000000',
      strokeWidth: 5,
      shadowColorHex: 'rgba(0,0,0,0.9)',
      bannerPillColorHex: 'rgba(0,0,0,0.5)',
    },
    tone: 'Cinematic & Premium',
  },
  {
    id: 'jumpcut',
    name: 'Rapid Jump-Cut',
    tagline: 'Aggressive trim of every pause, high energy, karaoke captions.',
    icon: 'sports_esports',
    accent: 'tertiary',
    options: { silenceThresholdSec: 0.25, sfxEnabled: true, punchZoomEnabled: true, captionsEnabled: true },
    visualLook: 'bold',
    caption: {
      animation: 'karaoke',
      position: 'bottom',
      fontSize: 60,
      colorHex: '#FFFFFF',
      activeWordColorHex: '#7FE3B8',
      wordsPerCue: 3,
      fontFamily: 'system-ui, sans-serif',
      strokeColorHex: '#000000',
      strokeWidth: 6,
      shadowColorHex: 'rgba(0,0,0,0.92)',
      bannerPillColorHex: 'rgba(0,0,0,0.55)',
    },
    tone: 'High-Energy',
  },
  {
    id: 'minimal',
    name: 'Minimal / Silent-Friendly',
    tagline: 'Light trim, no zooms or SFX, bold banner captions for muted viewing.',
    icon: 'contrast',
    accent: 'primary',
    options: { silenceThresholdSec: 0.7, sfxEnabled: false, punchZoomEnabled: false, captionsEnabled: true },
    visualLook: 'warm',
    caption: {
      animation: 'bannerPill',
      position: 'bottom',
      fontSize: 54,
      colorHex: '#FFFFFF',
      activeWordColorHex: '#FFFFFF',
      wordsPerCue: 3,
      fontFamily: 'system-ui, sans-serif',
      strokeColorHex: '#000000',
      strokeWidth: 5,
      shadowColorHex: 'rgba(0,0,0,0.85)',
      bannerPillColorHex: 'rgba(0,0,0,0.72)',
    },
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

/** The active video clip at a timeline position (null when in a gap or off timeline). */
export function activeVideoClipAt(project: TimelineProject, t: number): VideoClip | null {
  const clips = videoClips(project);
  return clips.find((c) => t >= c.startOnTimeline - 0.001 && t < c.startOnTimeline + c.duration) ?? null;
}

export function brollTrackOf(project: TimelineProject): TimelineTrack | undefined {
  return project.tracks.find((t) => t.id === 'track-broll');
}

export function brollClips(project: TimelineProject): VideoClip[] {
  const tr = brollTrackOf(project);
  return (tr?.clips ?? []) as VideoClip[];
}

/** The active B-Roll overlay clip at a timeline position (null if none active or track muted). */
export function activeBrollClipAt(project: TimelineProject, t: number): VideoClip | null {
  const tr = brollTrackOf(project);
  if (!tr || tr.isMuted) return null;
  const clips = (tr.clips ?? []) as VideoClip[];
  return clips.find((c) => t >= c.startOnTimeline - 0.001 && t < c.startOnTimeline + c.duration) ?? null;
}

export function textClips(project: TimelineProject): TextClip[] {
  return (trackOf(project, 'text')?.clips ?? []) as TextClip[];
}

export function sfxClips(project: TimelineProject): SFXClip[] {
  return (trackOf(project, 'sfx')?.clips ?? []) as SFXClip[];
}

/** The text cue (if any) active at a timeline position. */
export function activeCaptionAt(project: TimelineProject, t: number): TextClip | null {
  // The preview already hides a muted text track; the exporter calls this helper directly, so the
  // mute decision has to live here too or turning CC off in the editor still burns words into MP4.
  const track = trackOf(project, 'text');
  if (!track || track.isMuted) return null;
  const cue = (track.clips as TextClip[]).find(
    (c) => t >= c.startOnTimeline && t < c.startOnTimeline + c.duration,
  );
  return cue ?? null;
}

/** Which word within a cue is "hot" at time t (for karaoke / active-word highlight). */
export function activeWordIndex(cue: TextClip, t: number): number {
  const words = cue.style?.words;
  if (!words || !words.length) return -1;
  const local = Math.max(0, round2(t - cue.startOnTimeline));

  // 1. Direct hit inside [w.start, w.end)
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (local >= w.start && local < w.end) return i;
  }

  // 2. Before the first word's speech starts, don't light up prematurely
  if (local < words[0].start) return -1;

  // 3. In micro-pauses between words, hold the preceding word
  for (let i = 0; i < words.length - 1; i++) {
    if (local >= words[i].end && local < words[i + 1].start) {
      return i;
    }
  }

  // 4. Past the last word, hold the last word until the cue finishes
  return words.length - 1;
}

/** Check whether a timeline position falls in a gap on the primary video track. */
export function isVideoGapAt(project: TimelineProject, t: number): boolean {
  const clips = videoClips(project);
  if (!clips.length) return true;
  return !clips.some((c) => t >= c.startOnTimeline - 0.001 && t < c.startOnTimeline + c.duration);
}

export interface InterpolatedTransform {
  scale: number;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
}

/**
 * Evaluates standard easing functions given progress t in [0, 1].
 */
export function evaluateEasing(easing: KeyframeEasing | undefined, t: number): number {
  const p = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'easeIn':
      return p * p * p;
    case 'easeOut':
      return 1 - Math.pow(1 - p, 3);
    case 'easeInOut':
    case 'cubicBezier':
      return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    case 'instant':
      return p >= 1 ? 1 : 0;
    case 'linear':
    default:
      return p;
  }
}

/**
 * Calculates smooth interpolated transform (scale, position x/y, rotation, opacity)
 * at timeline position t using clip keyframes and cubic easing curves.
 */
export function interpolatedTransformAt(
  project: TimelineProject,
  t: number
): InterpolatedTransform {
  const defaultTransform: InterpolatedTransform = {
    scale: 1,
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
  };

  const clip = videoClips(project).find(
    (c) => t >= c.startOnTimeline - 0.001 && t < c.startOnTimeline + c.duration
  );

  if (!clip || !clip.keyframes || clip.keyframes.length === 0) {
    return defaultTransform;
  }

  const localTime = Math.max(0, t - clip.startOnTimeline);
  const kfs = [...clip.keyframes].sort((a, b) => a.timeOffset - b.timeOffset);

  // If before first keyframe
  if (localTime <= kfs[0].timeOffset) {
    const k0 = kfs[0];
    return {
      scale: k0.scale ?? 1,
      x: k0.position?.x ?? 0,
      y: k0.position?.y ?? 0,
      rotation: k0.rotation ?? 0,
      opacity: k0.opacity ?? 1,
    };
  }

  // If after or at last keyframe
  if (localTime >= kfs[kfs.length - 1].timeOffset) {
    const kLast = kfs[kfs.length - 1];
    return {
      scale: kLast.scale ?? 1,
      x: kLast.position?.x ?? 0,
      y: kLast.position?.y ?? 0,
      rotation: kLast.rotation ?? 0,
      opacity: kLast.opacity ?? 1,
    };
  }

  // Interpolate between two surrounding keyframes
  for (let i = 0; i < kfs.length - 1; i++) {
    const k1 = kfs[i];
    const k2 = kfs[i + 1];

    if (localTime >= k1.timeOffset && localTime <= k2.timeOffset) {
      const segDuration = k2.timeOffset - k1.timeOffset;
      const rawProgress = segDuration > 0.0001 ? (localTime - k1.timeOffset) / segDuration : 0;
      const eased = evaluateEasing(k2.easing || k1.easing || 'easeInOut', rawProgress);

      const k1Pos = k1.position || { x: 0, y: 0 };
      const k2Pos = k2.position || { x: 0, y: 0 };

      const scale = (k1.scale ?? 1) + ((k2.scale ?? 1) - (k1.scale ?? 1)) * eased;
      const x = k1Pos.x + (k2Pos.x - k1Pos.x) * eased;
      const y = k1Pos.y + (k2Pos.y - k1Pos.y) * eased;
      const rotation = (k1.rotation ?? 0) + ((k2.rotation ?? 0) - (k1.rotation ?? 0)) * eased;
      const opacity = (k1.opacity ?? 1) + ((k2.opacity ?? 1) - (k1.opacity ?? 1)) * eased;

      return {
        scale: round2(scale * 1000) / 1000,
        x: round2(x * 10) / 10,
        y: round2(y * 10) / 10,
        rotation: round2(rotation * 10) / 10,
        opacity: round2(opacity * 100) / 100,
      };
    }
  }

  return defaultTransform;
}

/** Punch-zoom scale at a timeline position, derived from the active video clip's keyframes. */
export function punchScaleAt(project: TimelineProject, t: number): number {
  return interpolatedTransformAt(project, t).scale;
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
 * Estimates English syllable count heuristically for natural vocal cadence timing.
 */
export function estimateSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 1;
  if (clean.length <= 3) return 1;
  const match = clean.replace(/(?:[^laeiouy]|ed|es|e)$/, '').match(/[aeiouy]{1,2}/g);
  return match ? Math.max(1, match.length) : Math.max(1, Math.floor(clean.length / 3));
}

/**
 * Synthesize word-level timestamps from plain text across a duration, using a
 * natural reading cadence weighted by syllable density and character length
 * with pauses on punctuation. This lets the deterministic editor engine build
 * a full EDL even with no real transcript.
 */
export function synthesizeWords(text: string, duration: number, opts: { pauseOnPunct?: boolean } = {}): WordTimestamp[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || duration <= 0) return [];
  const tokens = clean.split(' ').filter(Boolean);
  const n = tokens.length;
  const pauseOnPunct = opts.pauseOnPunct ?? true;

  const weights: number[] = tokens.map((tok) => {
    const rawLen = tok.replace(/[^A-Za-z0-9]/g, '').length;
    const syllables = estimateSyllables(tok);
    let w = Math.max(0.20, syllables * 0.16 + rawLen * 0.04);
    if (pauseOnPunct && /[.,!?;:]$/.test(tok)) {
      w += 0.24; // Breathing pause after sentence/clause boundaries
    }
    return w;
  });

  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const words: WordTimestamp[] = [];
  let cursor = 0;
  const leadPad = Math.min(0.12, duration * 0.02);
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

export function round2(x: number): number {
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
  targetAspectRatio: ExportAspect = '9:16',
): TimelineProject {
  const duration = video.duration || (words.length ? words[words.length - 1].end : 12);
  const thr = preset.options.silenceThresholdSec;
  const geometry = aspectGeometry(targetAspectRatio);

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

  // No transcript: do not invent speech. A silent take can still be cut into a visual rhythm with
  // real reframes and on-screen design text. These lines are never labelled as spoken words.
  if (blocks.length === 0) {
    const lead = Math.min(duration * 0.06, 0.4);
    const tail = Math.min(duration * 0.04, 0.3);
    const usable = Math.max(0.6, duration - lead - tail);
    const beatCount = Math.max(2, Math.min(6, Math.round(usable / 1.25)));
    const beatDuration = usable / beatCount;
    const visualLines = ['THE SETUP', 'WATCH CLOSELY', 'THE DETAIL', 'THE RESULT'];
    const zooms = [1.16, 1.24, 1.1, 1.2, 1.14, 1.26];
    for (let index = 0; index < beatCount; index += 1) {
      const sourceStart = lead + beatDuration * index;
      const clipId = `vclip_visual_${index}`;
      const zoom = preset.options.punchZoomEnabled ? zooms[index % zooms.length] : 1;
      clips.push({
        id: clipId,
        name: `Visual beat ${index + 1}`,
        type: 'video',
        startOnTimeline: round2(beatDuration * index),
        duration: round2(beatDuration),
        sourceStartOffset: round2(sourceStart),
        sourceFileId: video.id,
        sourceUrl: video.file_url,
        speedMultiplier: 1,
        keyframes:
          zoom > 1
            ? [
                { timeOffset: 0, scale: 1, position: { x: 0, y: 0 }, easing: 'linear' },
                { timeOffset: round2(beatDuration * 0.28), scale: zoom, position: { x: 0, y: -0.03 }, easing: 'easeInOut' },
                { timeOffset: round2(beatDuration * 0.72), scale: Math.max(1.04, zoom - 0.08), position: { x: 0, y: 0 }, easing: 'easeOut' },
                { timeOffset: round2(beatDuration), scale: zoom, position: { x: 0, y: 0 }, easing: 'easeInOut' },
              ]
            : [],
        audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0, fadeOutSec: 0 },
      });
      if (preset.options.captionsEnabled && index < visualLines.length) {
        textCues.push({
          id: `t_visual_${index}`,
          name: visualLines[index],
          type: 'text',
          startOnTimeline: round2(beatDuration * index + beatDuration * 0.12),
          duration: round2(Math.max(0.45, beatDuration * 0.65)),
          sourceStartOffset: round2(sourceStart),
          parentClipId: clipId,
          content: visualLines[index],
          style: {
            fontFamily: preset.caption.fontFamily || 'system-ui, sans-serif',
            fontSize: preset.caption.fontSize,
            colorHex: preset.caption.colorHex,
            activeWordColorHex: preset.caption.activeWordColorHex,
            strokeColorHex: preset.caption.strokeColorHex || '#000000',
            strokeWidth: preset.caption.strokeWidth ?? 5,
            shadowColorHex: preset.caption.shadowColorHex || 'rgba(0,0,0,0.9)',
            bannerPillColorHex: preset.caption.bannerPillColorHex,
            position: preset.caption.position,
            animation: preset.caption.animation,
          },
        });
      }
    }
  }

  const sourceBlocks = blocks;
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
          parentClipId: clip.id,
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
            words: group.map((w) => ({ word: w.word, start: round2(w.start - gStart), end: round2(w.end - gStart) })),
          },
        });
      }
    }
    timelineCursor += dur;
  });

  const clipEnd = clips.reduce((max, clip) => Math.max(max, clip.startOnTimeline + clip.duration), 0);
  const total = round2(Math.max(timelineCursor, clipEnd) || duration);
  return {
    schemaVersion: '1.0.0',
    projectMetadata: {
      id: `proj_${Date.now()}`,
      title: video.title,
      targetAspectRatio,
      width: geometry.width,
      height: geometry.height,
      frameRate: 30,
      visualLook: preset.visualLook,
      totalDuration: total,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    globalAudioTracks: { bgmVolume: 0.25, duckingEnabled: true },
    tracks: [
      { id: 'track-text', name: blocks.length ? 'Kinetic Captions' : 'On-Screen Text', type: 'text', isMuted: false, isLocked: false, zIndex: 30, clips: textCues },
      { id: 'track-sfx', name: 'SFX Overlays', type: 'sfx', isMuted: false, isLocked: false, zIndex: 20, clips: [] },
      { id: 'track-video', name: 'Primary Video', type: 'video', isMuted: false, isLocked: false, zIndex: 10, clips },
    ],
  };
}

export interface KineticCaptionPreset {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  style: {
    fontFamily: string;
    fontSize: number;
    colorHex: string;
    activeWordColorHex?: string;
    strokeColorHex?: string;
    strokeWidth?: number;
    shadowColorHex?: string;
    bannerPillColorHex?: string;
    position: 'top' | 'middle' | 'bottom';
    animation: CaptionAnimation;
  };
}

export const KINETIC_CAPTION_PRESETS: KineticCaptionPreset[] = [
  {
    id: 'hormozi_viral',
    name: 'Hormozi Viral',
    tagline: 'Neon pop highlights with thick black outline',
    icon: 'bolt',
    style: {
      fontFamily: 'Montserrat, sans-serif',
      fontSize: 48,
      colorHex: '#FFFFFF',
      activeWordColorHex: '#39FF14', // Neon Lime
      strokeColorHex: '#000000',
      strokeWidth: 4,
      shadowColorHex: 'rgba(0,0,0,0.85)',
      position: 'middle',
      animation: 'bouncePop',
    },
  },
  {
    id: 'tiktok_neon',
    name: 'TikTok Electric',
    tagline: 'High-contrast yellow text with cyan active glow',
    icon: 'local_fire_department',
    style: {
      fontFamily: 'Inter, sans-serif',
      fontSize: 44,
      colorHex: '#FFFF00',
      activeWordColorHex: '#00FFFF', // Electric Cyan
      strokeColorHex: '#000000',
      strokeWidth: 3,
      shadowColorHex: 'rgba(0,0,0,0.7)',
      position: 'bottom',
      animation: 'popIn',
    },
  },
  {
    id: 'minimal_pill',
    name: 'Glassmorphic Pill',
    tagline: 'Clean dark frosted pill for maximal legibility',
    icon: 'crop_16_9',
    style: {
      fontFamily: 'Newsreader, serif',
      fontSize: 38,
      colorHex: '#FFFFFF',
      activeWordColorHex: '#F59E0B', // Amber
      bannerPillColorHex: 'rgba(0,0,0,0.65)',
      position: 'bottom',
      animation: 'bannerPill',
    },
  },
  {
    id: 'beast_karaoke',
    name: 'Wave Karaoke',
    tagline: 'Smooth kinetic wave wipe across spoken words',
    icon: 'graphic_eq',
    style: {
      fontFamily: 'Montserrat, sans-serif',
      fontSize: 46,
      colorHex: '#E2E8F0',
      activeWordColorHex: '#FF3B30', // Vibrant Red
      strokeColorHex: '#000000',
      strokeWidth: 3,
      position: 'middle',
      animation: 'karaoke',
    },
  },
];

/**
 * Batch-apply a caption style preset across all TextClips on the project text track.
 */
export function applyCaptionPresetToProject(
  project: TimelineProject,
  presetStyle: Partial<CaptionStyle>,
): TimelineProject {
  const next = cloneProject(project);
  const textTrack = next.tracks.find((t) => t.type === 'text');
  if (!textTrack) return next;

  textTrack.clips = (textTrack.clips as TextClip[]).map((c) => ({
    ...c,
    style: {
      ...c.style,
      ...presetStyle,
      words: c.style.words,
    },
  }));

  return next;
}

/** Apply a preset's caption look onto an engine-produced project (server or local). */
export function applyPresetLook(project: TimelineProject, preset: EditPreset): TimelineProject {
  const tracks = project.tracks.map((tr) => {
    if (tr.type !== 'text') return tr;
    const clips = (tr.clips as TextClip[]).map((c) => ({
      ...c,
      style: {
        ...c.style,
        fontFamily: preset.caption.fontFamily || c.style.fontFamily || 'system-ui, sans-serif',
        fontSize: preset.caption.fontSize,
        colorHex: preset.caption.colorHex,
        activeWordColorHex: preset.caption.activeWordColorHex,
        animation: preset.caption.animation,
        position: preset.caption.position,
        strokeColorHex: preset.caption.strokeColorHex || c.style.strokeColorHex || '#000000',
        strokeWidth: preset.caption.strokeWidth ?? c.style.strokeWidth ?? 5,
        shadowColorHex: preset.caption.shadowColorHex || c.style.shadowColorHex || 'rgba(0,0,0,0.9)',
        bannerPillColorHex: preset.caption.bannerPillColorHex || c.style.bannerPillColorHex,
        // Word timings are speech truth, not styling. A preset must never throw them away — the
        // export renderer needs them for word highlighting and they are expensive to reconstruct.
        words: c.style.words,
      },
    }));
    return { ...tr, clips };
  });
  return {
    ...project,
    projectMetadata: { ...project.projectMetadata, visualLook: preset.visualLook },
    tracks,
  };
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

/** Keep spoken phrases together: break on punctuation or after a short, readable group. */
function captionChunks(words: string[], maxWords = 4): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  words.forEach((word) => {
    current.push(word);
    const endsThought = /[.,!?;:]$/.test(word);
    if (current.length >= maxWords || (endsThought && current.length >= 2)) {
      groups.push(current);
      current = [];
    }
  });
  // Never leave a single stray word on its own cue. A one-word tail reads like a mistake, so it
  // rejoins the previous phrase even if that makes the cue five words long.
  if (current.length === 1 && groups.length) {
    groups[groups.length - 1].push(...current);
  } else if (current.length) {
    groups.push(current);
  }
  return groups;
}

/**
 * Builds caption cues from speech-to-text segments. Cues follow the punctuation the creator actually
 * spoke instead of chopping every third word, which made lines hard to read even when the transcript
 * was correct. Real per-word timings are used when the engine supplied them; otherwise time is
 * shared by word length so long words not short ones get the screen time.
 */
export function buildCaptionsFromSegments(
  segments: LiveCaptionSegment[],
  styleOpts?: Partial<TextClip['style']>,
): TextClip[] {
  const cues: TextClip[] = [];
  const defaultStyle: TextClip['style'] = {
    fontFamily: styleOpts?.fontFamily || 'system-ui, sans-serif',
    fontSize: styleOpts?.fontSize || 60,
    colorHex: styleOpts?.colorHex || '#FFFFFF',
    activeWordColorHex: styleOpts?.activeWordColorHex || '#FFE066',
    strokeColorHex: styleOpts?.strokeColorHex || '#000000',
    strokeWidth: styleOpts?.strokeWidth ?? 6,
    shadowColorHex: styleOpts?.shadowColorHex || 'rgba(0,0,0,0.9)',
    bannerPillColorHex: styleOpts?.bannerPillColorHex || 'rgba(0,0,0,0.55)',
    position: styleOpts?.position || 'bottom',
    animation: styleOpts?.animation || 'karaoke',
  };

  segments.forEach((seg, sIdx) => {
    const startSec = parseSrtTimeToSeconds(seg.start);
    const endSec = parseSrtTimeToSeconds(seg.end);
    const totalSegDur = Math.max(0.2, endSec - startSec);
    const cleanText = (seg.text || '').replace(/\s+/g, ' ').trim();
    if (!cleanText) return;

    const words = cleanText.split(' ').filter(Boolean);
    if (!words.length) return;

    // Prefer the engine's word timings. They are absolute seconds; everything drawn in a cue is
    // stored relative to that cue so the active-word highlight survives export.
    const supplied = seg.words && seg.words.length === words.length ? seg.words : null;
    const weights = words.map((w) => Math.max(1, w.replace(/[^\p{L}\p{N}]/gu, '').length));
    const weightTotal = weights.reduce((sum, w) => sum + w, 0) || words.length;
    const durations = supplied
      ? supplied.map((w) => Math.max(0.08, w.end - w.start))
      : weights.map((w) => Math.max(0.12, (totalSegDur * w) / weightTotal));
    const durationTotal = durations.reduce((sum, d) => sum + d, 0) || totalSegDur;
    const starts: number[] = [];
    let cursor = startSec;
    durations.forEach((d) => {
      starts.push(cursor);
      cursor += (d / durationTotal) * totalSegDur;
    });

    let offset = 0;
    captionChunks(words).forEach((chunkWords, cIdx) => {
      const first = offset;
      const last = offset + chunkWords.length - 1;
      const chunkStart = round2(starts[first]);
      const chunkEnd = round2(Math.min(endSec, starts[last] + durations[last]));
      const chunkDur = round2(Math.max(0.35, chunkEnd - chunkStart));
      const chunkText = chunkWords.join(' ');
      const content = chunkText.charAt(0).toUpperCase() + chunkText.slice(1);

      const wordTimestamps = chunkWords.map((word, i) => {
        const wStart = round2(starts[first + i] - chunkStart);
        const wEnd = round2(Math.max(wStart + 0.1, starts[first + i] + durations[first + i] - chunkStart));
        return { word, start: wStart, end: Math.min(chunkDur, wEnd) };
      });

      cues.push({
        id: `live_cue_${sIdx}_${cIdx}_${Date.now()}`,
        name: content,
        type: 'text',
        startOnTimeline: chunkStart,
        duration: chunkDur,
        sourceStartOffset: chunkStart,
        content,
        style: { ...defaultStyle, words: wordTimestamps },
      });
      offset += chunkWords.length;
    });
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
    const textClip = nClip as TextClip;
    const words = textClip.style?.words || [];
    if (words.length > 0) {
      const firstWords = words.filter((w) => (w.start + w.end) / 2 <= firstDur);
      const secondWords = words
        .filter((w) => (w.start + w.end) / 2 > firstDur)
        .map((w) => ({ ...w, start: round2(Math.max(0, w.start - firstDur)), end: round2(Math.max(0, w.end - firstDur)) }));

      const firstText = firstWords.length > 0 ? firstWords.map((w) => w.word).join(' ') : textClip.content;
      const secondText = secondWords.length > 0 ? secondWords.map((w) => w.word).join(' ') : textClip.content;

      (first as TextClip).style = { ...textClip.style, words: firstWords };
      (first as TextClip).content = firstText;
      (first as TextClip).name = firstText;

      (second as TextClip).style = { ...textClip.style, words: secondWords };
      (second as TextClip).content = secondText;
      (second as TextClip).name = secondText;
    } else {
      const allWords = textClip.content.split(/\s+/).filter(Boolean);
      if (allWords.length > 1) {
        const splitIdx = Math.max(1, Math.min(allWords.length - 1, Math.round((firstDur / nClip.duration) * allWords.length)));
        const firstStr = allWords.slice(0, splitIdx).join(' ');
        const secondStr = allWords.slice(splitIdx).join(' ');
        (first as TextClip).style = { ...textClip.style, words: synthesizeWords(firstStr, firstDur) };
        (first as TextClip).content = firstStr;
        (first as TextClip).name = firstStr;

        (second as TextClip).style = { ...textClip.style, words: synthesizeWords(secondStr, secondDur) };
        (second as TextClip).content = secondStr;
        (second as TextClip).name = secondStr;
      }
    }
  }

  nTrack.clips.splice(index, 1, first, second);

  // Update parentClipId reference on secondary track clips (captions/broll/sfx) if parent clip was split
  if (nClip.type === 'video') {
    for (const tr of next.tracks) {
      if (tr.id === track.id) continue;
      tr.clips.forEach((c) => {
        if (c.parentClipId === nClip.id && c.startOnTimeline >= atTime - 0.001) {
          c.parentClipId = second.id;
        }
      });
    }
  }

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

  const isText = nClip.type === 'text';
  const clampedTime = Math.max(0, round2(atTime));

  if (edge === 'start') {
    // Video has no extra source to reveal on the left, but a caption can be extended earlier.
    if (clampedTime >= end - 0.1) return null;
    if (!isText && clampedTime <= start + 0.05) return null;
    if (clampedTime === start) return null;
    const cut = round2(clampedTime - start);
    if (nClip.type === 'video') {
      const speed = (nClip as VideoClip).speedMultiplier || 1;
      (nClip as VideoClip).sourceStartOffset = round2(nClip.sourceStartOffset + cut * speed);
      (nClip as VideoClip).keyframes = ((nClip as VideoClip).keyframes || [])
        .filter((k) => k.timeOffset >= cut)
        .map((k) => ({ ...k, timeOffset: round2(k.timeOffset - cut) }));
    }
    if (nClip.type === 'text') {
      const textClip = nClip as TextClip;
      // Extending left keeps every word and shifts it later in local time so its absolute beat
      // stays put. Shrinking still drops words that fell before the new start.
      const words = cut < 0
        ? ((textClip.style?.words) || []).map((w) => ({
            ...w,
            start: round2(w.start - cut),
            end: round2(w.end - cut),
          }))
        : ((textClip.style?.words) || [])
            .filter((w) => (w.start + w.end) / 2 >= cut)
            .map((w) => ({
              ...w,
              start: round2(Math.max(0, w.start - cut)),
              end: round2(Math.max(0, w.end - cut)),
            }));
      const newText = cut < 0
        ? textClip.content
        : words.length > 0
        ? words.map((w) => w.word).join(' ')
        : textClip.content;
      (nClip as TextClip).style = { ...textClip.style, words };
      (nClip as TextClip).content = newText;
      (nClip as TextClip).name = newText;
    }
    nClip.startOnTimeline = clampedTime;
    nClip.duration = round2(end - clampedTime);
  } else {
    // A caption may be dragged past its old end to extend its hold. Video stays shrink-only
    // because there is no extra source frame to reveal without re-probing the file.
    if (clampedTime <= start + 0.1) return null;
    if (!isText && clampedTime >= end - 0.05) return null;
    if (clampedTime === end) return null;
    const keep = round2(clampedTime - start);
    if (nClip.type === 'video') {
      (nClip as VideoClip).keyframes = ((nClip as VideoClip).keyframes || []).filter((k) => k.timeOffset <= keep);
    }
    if (nClip.type === 'text') {
      const textClip = nClip as TextClip;
      const words = ((textClip.style?.words) || []).filter((w) => (w.start + w.end) / 2 <= keep);
      const newText = clampedTime >= end
        ? textClip.content
        : words.length > 0
        ? words.map((w) => w.word).join(' ')
        : textClip.content;
      (nClip as TextClip).style = { ...textClip.style, words };
      (nClip as TextClip).content = newText;
      (nClip as TextClip).name = newText;
    }
    nClip.duration = keep;
  }

  recomputeDuration(next);
  return next;
}

/**
 * Ripple secondary track clips (such as text captions, B-Roll, or SFX overlays) when a primary
 * video clip is deleted or shortened, keeping everything locked in sync and auto-cleaning orphaned captions.
 */
function rippleTrackClips(
  clips: TimelineClip[],
  gapStart: number,
  gapDur: number,
  deletedParentId?: string,
): TimelineClip[] {
  const gapEnd = round2(gapStart + gapDur);
  const result: TimelineClip[] = [];

  for (const c of clips) {
    const start = c.startOnTimeline;
    const end = round2(start + c.duration);

    // If parent clip was deleted and child was within the deleted bounds, drop it
    if (deletedParentId && c.parentClipId === deletedParentId && start >= gapStart - 0.001 && end <= gapEnd + 0.001) {
      continue;
    }

    // 1. Entirely before the deleted gap: untouched
    if (end <= gapStart + 0.001) {
      result.push(c);
      continue;
    }

    // 2. Entirely after the deleted gap: shift left by gapDur (-Δt)
    if (start >= gapEnd - 0.001) {
      result.push({
        ...c,
        startOnTimeline: round2(Math.max(0, start - gapDur)),
      });
      continue;
    }

    // 3. Entirely inside the deleted gap: remove orphaned clip (drop from result)
    if (start >= gapStart - 0.001 && end <= gapEnd + 0.001) {
      continue;
    }

    // 4. Starts before gap, ends inside gap: truncate end to gapStart
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
    // Auto-clean & split into two pieces (before gap & after gap shifted by -Δt)
    if (start < gapStart - 0.001 && end > gapEnd + 0.001) {
      const firstPartDur = round2(gapStart - start);
      const secondPartDur = round2(end - gapEnd);

      if (c.type === 'text') {
        const textClip = c as TextClip;
        const allWords = textClip.style.words || [];
        const firstWords = allWords.filter((w) => start + (w.start + w.end) / 2 < gapStart);
        const secondWords = allWords
          .filter((w) => start + (w.start + w.end) / 2 >= gapEnd)
          .map((w) => ({
            ...w,
            start: round2(Math.max(0, w.start - gapDur)),
            end: round2(Math.max(0, w.end - gapDur)),
          }));

        if (firstPartDur > 0.05 && (firstWords.length > 0 || !allWords.length)) {
          const firstText = firstWords.length ? firstWords.map((w) => w.word).join(' ') : textClip.content;
          result.push({
            ...textClip,
            duration: firstPartDur,
            content: firstText,
            name: firstText,
            style: { ...textClip.style, words: firstWords },
          });
        }

        if (secondPartDur > 0.05 && (secondWords.length > 0 || !allWords.length)) {
          const secondText = secondWords.length ? secondWords.map((w) => w.word).join(' ') : textClip.content;
          result.push({
            ...textClip,
            id: newId(textClip.id),
            startOnTimeline: round2(gapStart),
            duration: secondPartDur,
            content: secondText,
            name: secondText,
            style: { ...textClip.style, words: secondWords },
          });
        }
      } else {
        // Non-text clips (e.g. SFX, broll audio) spanning across gap
        if (firstPartDur > 0.05) {
          result.push({ ...c, duration: firstPartDur });
        }
        if (secondPartDur > 0.05) {
          result.push({
            ...c,
            id: newId(c.id),
            startOnTimeline: round2(gapStart),
            duration: secondPartDur,
          });
        }
      }
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
          track.clips = rippleTrackClips(track.clips, gapStart, gapDur, removed.id);
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

export interface SnapResult {
  time: number;
  snapped: boolean;
  snapPoint?: number;
}

/**
 * Find magnetic snap points across timeline cuts, cues, playhead, and boundaries.
 */
export function findSnapPoint(
  project: TimelineProject,
  targetTime: number,
  zoom: number,
  options?: {
    thresholdPx?: number;
    excludeClipId?: string;
    includePlayhead?: number;
  },
): SnapResult {
  const thresholdPx = options?.thresholdPx ?? 8;
  const thresholdSec = thresholdPx / zoom;
  let bestDist = thresholdSec;
  let snappedVal = targetTime;
  let snapped = false;

  const candidates: number[] = [0];
  if (typeof options?.includePlayhead === 'number') {
    candidates.push(options.includePlayhead);
  }

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (options?.excludeClipId && clip.id === options.excludeClipId) continue;
      candidates.push(clip.startOnTimeline);
      candidates.push(round2(clip.startOnTimeline + clip.duration));
    }
  }

  for (const pt of candidates) {
    const dist = Math.abs(targetTime - pt);
    if (dist < bestDist) {
      bestDist = dist;
      snappedVal = pt;
      snapped = true;
    }
  }

  return {
    time: round2(snappedVal),
    snapped,
    snapPoint: snapped ? snappedVal : undefined,
  };
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
  nTrack.clips.sort((a, b) => a.startOnTimeline - b.startOnTimeline);
  recomputeDuration(next);
  return next;
}

/**
 * Move a clip on its track while enforcing track collision boundaries and magnetic snapping.
 * Prevents overlapping brother clips on the same track.
 */
export function moveClipSafe(
  project: TimelineProject,
  clipId: string,
  newStart: number,
): TimelineProject | null {
  const loc = locateClip(project, clipId);
  if (!loc || loc.track.isLocked) return null;
  const { clip, track, index } = loc;

  const next = cloneProject(project);
  const nTrack = next.tracks.find((t) => t.id === track.id)!;
  const nClip = nTrack.clips[index];

  let clampedStart = Math.max(0, round2(newStart));
  const clipDur = nClip.duration;

  // Collision prevention against other clips on the same track
  const otherClips = nTrack.clips.filter((c) => c.id !== clipId);

  // Check left obstacle (clip that ends before or near our desired newStart)
  const leftObstacles = otherClips
    .filter((c) => c.startOnTimeline + c.duration <= clampedStart + 0.001)
    .sort((a, b) => (b.startOnTimeline + b.duration) - (a.startOnTimeline + a.duration));
  const leftObstacle = leftObstacles[0];

  // Check right obstacle (clip that starts after or near our desired newStart)
  const rightObstacles = otherClips
    .filter((c) => c.startOnTimeline >= clampedStart)
    .sort((a, b) => a.startOnTimeline - b.startOnTimeline);
  const rightObstacle = rightObstacles[0];

  // If there's an overlapping clip right at clampedStart
  const overlapping = otherClips.find(
    (c) =>
      Math.max(clampedStart, c.startOnTimeline) <
      Math.min(clampedStart + clipDur, c.startOnTimeline + c.duration),
  );

  if (overlapping) {
    if (clip.startOnTimeline >= overlapping.startOnTimeline + overlapping.duration) {
      clampedStart = round2(overlapping.startOnTimeline + overlapping.duration);
    } else {
      clampedStart = round2(Math.max(0, overlapping.startOnTimeline - clipDur));
    }
  }

  // Ensure within left and right boundaries
  if (leftObstacle) {
    clampedStart = Math.max(clampedStart, round2(leftObstacle.startOnTimeline + leftObstacle.duration));
  }
  if (rightObstacle) {
    clampedStart = Math.min(clampedStart, round2(Math.max(0, rightObstacle.startOnTimeline - clipDur)));
  }

  // Final collision verification
  const hasCollision = otherClips.some(
    (c) =>
      Math.max(clampedStart, c.startOnTimeline) <
      Math.min(clampedStart + clipDur - 0.001, c.startOnTimeline + c.duration - 0.001)
  );
  if (hasCollision) {
    return null;
  }

  if (clampedStart === clip.startOnTimeline) return null;

  nClip.startOnTimeline = clampedStart;
  nTrack.clips.sort((a, b) => a.startOnTimeline - b.startOnTimeline);
  recomputeDuration(next);
  return next;
}

/**
 * Set a clip's timeline position and length directly. This is the honest editor control for
 * captions: a creator must be able to move a cue or extend it by a few tenths without fighting a
 * collision clamp designed for primary video clips. Word-level cues are rescaled with the length so
 * highlighting still lands inside the new window.
 */
export function setClipTiming(
  project: TimelineProject,
  clipId: string,
  timing: { start?: number; duration?: number },
): TimelineProject | null {
  const loc = locateClip(project, clipId);
  if (!loc || loc.track.isLocked) return null;

  const start = timing.start === undefined ? loc.clip.startOnTimeline : Math.max(0, round2(timing.start));
  const duration =
    timing.duration === undefined ? loc.clip.duration : Math.max(0.1, round2(timing.duration));
  if (start === loc.clip.startOnTimeline && duration === loc.clip.duration) return null;

  const next = cloneProject(project);
  const nTrack = next.tracks.find((t) => t.id === loc.track.id)!;
  const nClip = nTrack.clips[loc.index];
  const oldDuration = nClip.duration || 0.1;

  nClip.startOnTimeline = start;
  nClip.duration = duration;

  if (nClip.type === 'text' && nClip.style.words?.length && oldDuration > 0) {
    const ratio = duration / oldDuration;
    nClip.style = {
      ...nClip.style,
      words: nClip.style.words.map((word) => ({
        ...word,
        start: round2(word.start * ratio),
        end: round2(Math.max(word.start * ratio + 0.05, word.end * ratio)),
      })),
    };
  }

  nTrack.clips.sort((a, b) => a.startOnTimeline - b.startOnTimeline);
  recomputeDuration(next);
  return next;
}

/**
 * Move multiple selected clips simultaneously by an offset deltaSec.
 * Preserves relative distance between clips and enforces min start >= 0.
 */
export function moveClipsBatch(
  project: TimelineProject,
  clipIds: string[],
  deltaSec: number,
): TimelineProject | null {
  if (!clipIds.length || Math.abs(deltaSec) < 0.001) return null;

  const next = cloneProject(project);
  const selectedClips: { trackId: string; clipId: string; origStart: number }[] = [];

  // Find all targeted clips on unlocked tracks
  for (const track of next.tracks) {
    if (track.isLocked) continue;
    for (const c of track.clips) {
      if (clipIds.includes(c.id)) {
        selectedClips.push({ trackId: track.id, clipId: c.id, origStart: c.startOnTimeline });
      }
    }
  }

  if (selectedClips.length === 0) return null;

  // Clamp deltaSec so no clip is shifted before timeline start (t=0)
  const minStart = Math.min(...selectedClips.map((c) => c.origStart));
  const effectiveDelta = Math.max(-minStart, deltaSec);

  let changed = false;
  for (const item of selectedClips) {
    const track = next.tracks.find((t) => t.id === item.trackId);
    if (!track) continue;
    const clip = track.clips.find((c) => c.id === item.clipId);
    if (!clip) continue;
    const newStart = round2(Math.max(0, item.origStart + effectiveDelta));
    if (newStart !== clip.startOnTimeline) {
      clip.startOnTimeline = newStart;
      changed = true;
    }
  }

  if (!changed) return null;

  for (const track of next.tracks) {
    track.clips.sort((a, b) => a.startOnTimeline - b.startOnTimeline);
  }

  recomputeDuration(next);
  return next;
}

/**
 * Batch delete multiple clips across tracks in a ripple-safe reverse chronological order.
 */
export function deleteClipsBatch(
  project: TimelineProject,
  clipIds: string[],
  ripple = true,
): TimelineProject | null {
  if (!clipIds.length) return null;

  let current: TimelineProject = project;
  const clipsWithTime: { id: string; start: number }[] = [];

  for (const track of project.tracks) {
    if (track.isLocked) continue;
    for (const c of track.clips) {
      if (clipIds.includes(c.id)) {
        clipsWithTime.push({ id: c.id, start: c.startOnTimeline });
      }
    }
  }

  // Sort by starting time descending so rippling earlier clips doesn't disrupt later start times
  clipsWithTime.sort((a, b) => b.start - a.start);

  for (const item of clipsWithTime) {
    const updated = deleteClip(current, item.id, ripple);
    if (updated) {
      current = updated;
    }
  }

  return current !== project ? current : null;
}

/** Close every gap on the primary video track and ripple all unlocked tracks synchronously to stay in sync. */
export function tightenGaps(project: TimelineProject): TimelineProject | null {
  const vTrack = project.tracks.find((t) => t.type === 'video');
  if (!vTrack || vTrack.clips.length === 0) return null;

  const next = cloneProject(project);
  let changed = false;

  // Iteratively scan and close gaps between video cuts
  let safetyLimit = 50;
  while (safetyLimit-- > 0) {
    const curVTrack = next.tracks.find((t) => t.type === 'video');
    if (!curVTrack) break;
    const sortedVideo = [...curVTrack.clips].sort((a, b) => a.startOnTimeline - b.startOnTimeline);

    let gapFound = false;
    let cursor = 0;

    for (const vClip of sortedVideo) {
      if (vClip.startOnTimeline > cursor + 0.01) {
        const gapStart = cursor;
        const gapDur = round2(vClip.startOnTimeline - cursor);
        gapFound = true;
        changed = true;

        for (const track of next.tracks) {
          if (track.isLocked) continue;
          if (track.type === 'video') {
            track.clips = track.clips.map((c) =>
              c.startOnTimeline >= gapStart + gapDur - 0.001
                ? { ...c, startOnTimeline: round2(Math.max(0, c.startOnTimeline - gapDur)) }
                : c
            );
          } else {
            track.clips = rippleTrackClips(track.clips, gapStart, gapDur);
          }
        }
        break; // restart scan with updated timeline positions
      }
      cursor = round2(vClip.startOnTimeline + vClip.duration);
    }

    if (!gapFound) break;
  }

  if (!changed) return null;
  recomputeDuration(next);
  return next;
}

/**
 * Changes project target aspect ratio and sets conforming canonical export dimensions.
 */
export function setProjectAspectRatio(
  project: TimelineProject,
  ratio: TargetAspectRatio
): TimelineProject {
  const clone = cloneProject(project);
  clone.projectMetadata.targetAspectRatio = ratio;
  if (ratio === '9:16') {
    clone.projectMetadata.width = 1080;
    clone.projectMetadata.height = 1920;
  } else if (ratio === '1:1') {
    clone.projectMetadata.width = 1080;
    clone.projectMetadata.height = 1080;
  } else if (ratio === '16:9') {
    clone.projectMetadata.width = 1920;
    clone.projectMetadata.height = 1080;
  } else if (ratio === '4:5') {
    clone.projectMetadata.width = 1080;
    clone.projectMetadata.height = 1350;
  }
  return clone;
}

/**
 * Assigns or removes a cut transition on a video clip.
 */
export function setClipTransition(
  project: TimelineProject,
  clipId: string,
  transition: ClipTransition
): TimelineProject {
  const clone = cloneProject(project);
  const track = clone.tracks.find((t) => t.type === 'video');
  if (!track) return clone;
  const clip = track.clips.find((c) => c.id === clipId) as VideoClip | undefined;
  if (clip) {
    clip.transition = transition;
  }
  return clone;
}

/**
 * Inserts or appends a video clip onto the main video track or as a B-Roll overlay track clip.
 */
export function insertVideoClip(
  project: TimelineProject,
  video: { id: string; title: string; file_url: string; duration?: number },
  atTime?: number,
  asBroll = false
): TimelineProject {
  const clone = cloneProject(project);
  const dur = Math.max(0.5, round2(video.duration || 5));

  if (asBroll) {
    let brollTrack = clone.tracks.find((t) => t.id === 'track-broll');
    if (!brollTrack) {
      brollTrack = {
        id: 'track-broll',
        name: 'B-Roll & Overlays',
        type: 'video',
        isMuted: false,
        isLocked: false,
        zIndex: 15,
        clips: [],
      };
      clone.tracks.push(brollTrack);
    }
    let startTime = typeof atTime === 'number' ? round2(Math.max(0, atTime)) : 0;
    const brollDur = dur;

    // Collision avoidance on B-Roll track:
    // If startTime collides with an existing B-Roll clip, snap to the end of the colliding clip
    const sorted = [...(brollTrack.clips as VideoClip[])].sort((a, b) => a.startOnTimeline - b.startOnTimeline);
    for (const c of sorted) {
      if (startTime < c.startOnTimeline + c.duration && startTime + brollDur > c.startOnTimeline) {
        if (startTime >= c.startOnTimeline) {
          startTime = round2(c.startOnTimeline + c.duration);
        } else {
          c.startOnTimeline = round2(c.startOnTimeline + brollDur);
        }
      }
    }

    const newClip: VideoClip = {
      id: `broll_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: video.title || 'B-Roll Clip',
      type: 'video',
      startOnTimeline: startTime,
      duration: brollDur,
      sourceStartOffset: 0,
      sourceFileId: video.id,
      sourceUrl: video.file_url,
      speedMultiplier: 1,
      keyframes: [],
      audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0.1, fadeOutSec: 0.1 },
    };
    brollTrack.clips.push(newClip);
    brollTrack.clips.sort((a, b) => a.startOnTimeline - b.startOnTimeline);
    recomputeDuration(clone);
    return clone;
  }

  let vTrack = clone.tracks.find((t) => t.type === 'video' && t.id !== 'track-broll');
  if (!vTrack) {
    vTrack = {
      id: 'track-video',
      name: 'Primary Video',
      type: 'video',
      isMuted: false,
      isLocked: false,
      zIndex: 10,
      clips: [],
    };
    clone.tracks.unshift(vTrack);
  }

  const clips = vTrack.clips as VideoClip[];
  clips.sort((a, b) => a.startOnTimeline - b.startOnTimeline);
  const timelineEnd = clips.reduce((acc, c) => Math.max(acc, c.startOnTimeline + c.duration), 0);
  const insertStart = typeof atTime === 'number' ? round2(Math.max(0, atTime)) : round2(timelineEnd);

  const newClip: VideoClip = {
    id: `vclip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: video.title || 'Video Clip',
    type: 'video',
    startOnTimeline: insertStart,
    duration: dur,
    sourceStartOffset: 0,
    sourceFileId: video.id,
    sourceUrl: video.file_url,
    speedMultiplier: 1,
    keyframes: [],
    audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0, fadeOutSec: 0 },
  };

  // Case 1: Appending at or beyond timelineEnd
  if (insertStart >= timelineEnd - 0.01) {
    newClip.startOnTimeline = round2(timelineEnd);
    clips.push(newClip);
    clips.sort((a, b) => a.startOnTimeline - b.startOnTimeline);
    recomputeDuration(clone);
    return clone;
  }

  // Case 2: Inserting inside the timeline
  // Check if insertStart cuts directly through an existing primary video clip
  const splitIdx = clips.findIndex(
    (c) => insertStart > c.startOnTimeline + 0.01 && insertStart < c.startOnTimeline + c.duration - 0.01
  );

  if (splitIdx !== -1) {
    const orig = clips[splitIdx];
    const firstDur = round2(insertStart - orig.startOnTimeline);
    const secondDur = round2(orig.duration - firstDur);
    const speed = orig.speedMultiplier || 1;

    const firstPart: VideoClip = {
      ...orig,
      id: `${orig.id}_pt1`,
      duration: firstDur,
      keyframes: (orig.keyframes || []).filter((k) => k.timeOffset < firstDur),
    };

    const secondPart: VideoClip = {
      ...orig,
      id: `${orig.id}_pt2`,
      startOnTimeline: round2(insertStart + dur),
      duration: secondDur,
      sourceStartOffset: round2(orig.sourceStartOffset + firstDur * speed),
      keyframes: (orig.keyframes || [])
        .filter((k) => k.timeOffset >= firstDur)
        .map((k) => ({ ...k, timeOffset: round2(k.timeOffset - firstDur) })),
    };

    // Replace original clip with firstPart, newClip, secondPart
    clips.splice(splitIdx, 1, firstPart, newClip, secondPart);

    // Ripple all subsequent clips in vTrack (starting after splitIdx + 2)
    for (let i = splitIdx + 3; i < clips.length; i++) {
      clips[i].startOnTimeline = round2(clips[i].startOnTimeline + dur);
    }
  } else {
    // Insert falls on a cut boundary (or before the first clip)
    for (const c of clips) {
      if (c.startOnTimeline >= insertStart - 0.01) {
        c.startOnTimeline = round2(c.startOnTimeline + dur);
      }
    }
    clips.push(newClip);
  }

  // Ripple other unlocked secondary tracks (captions, SFX, overlays) to maintain synchronization
  for (const track of clone.tracks) {
    if (track.isLocked || track.id === vTrack.id) continue;
    track.clips.forEach((c) => {
      if (c.startOnTimeline >= insertStart - 0.01) {
        c.startOnTimeline = round2(c.startOnTimeline + dur);
      }
    });
  }

  clips.sort((a, b) => a.startOnTimeline - b.startOnTimeline);
  recomputeDuration(clone);
  return clone;
}


