/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MediaType = 'video' | 'audio' | 'sfx' | 'text' | 'adjustment';

export type KeyframeEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'instant';

export interface Vector2D {
  /** Normalized center offset: 0 is center, -1.0 is full left, 1.0 is full right */
  x: number;
  /** Normalized center offset: 0 is center, -1.0 is full top, 1.0 is full bottom */
  y: number;
}

export interface TransformKeyframe {
  /** Seconds relative to clip start (0 = beginning of this clip segment) */
  timeOffset: number;
  /** Scale multiplier: 1.0 = baseline (100%), 1.35 = 135% punch zoom */
  scale: number;
  /** Center-point focal target for pan & zoom */
  position: Vector2D;
  /** Rotation angle in degrees (0 to 360) */
  rotation?: number;
  /** Opacity multiplier (0.0 to 1.0) */
  opacity?: number;
  /** Interpolation curve to next keyframe */
  easing: KeyframeEasing;
  /** Cubic bezier control points [cp1x, cp1y, cp2x, cp2y] for custom easing curve */
  controlPoints?: [number, number, number, number];
}

export interface AudioFX {
  /** Pitch adjustment in cents: -1200 (1 octave down) to +1200 (1 octave up) */
  pitchShiftCents: number;
  /** Volume multiplier: 0.0 (silent) to 2.0 (boosted), 1.0 is unity */
  volume: number;
  /** Fade in duration in seconds */
  fadeInSec: number;
  /** Fade out duration in seconds */
  fadeOutSec: number;
}

export interface BaseClip {
  id: string;
  name: string;
  type: MediaType;
  /** Global start time position on the master timeline in seconds */
  startOnTimeline: number;
  /** Duration of this active clip in seconds */
  duration: number;
  /** Offset into source media asset file in seconds */
  sourceStartOffset: number;
}

export interface VideoClip extends BaseClip {
  type: 'video';
  sourceFileId: string;
  sourceUrl?: string;
  /** Speed multiplier: 0.5 = half speed, 1.0 = normal, 1.5 = fast-forward */
  speedMultiplier: number;
  /** Visual scale/position punch-in zoom keyframes */
  keyframes: TransformKeyframe[];
  /** Clip audio properties */
  audioModifiers: AudioFX;
}

export interface SFXClip extends BaseClip {
  type: 'sfx';
  sfxAssetId:
    | 'vine_boom'
    | 'chime'
    | 'cash_register'
    | 'glitch'
    | 'whoosh'
    | 'pop'
    | 'record_scratch'
    | string;
  sourceUrl?: string;
  audioModifiers: AudioFX;
}

export interface TextClip extends BaseClip {
  type: 'text';
  content: string;
  style: {
    fontFamily: string;
    fontSize: number;
    colorHex: string;
    activeWordColorHex?: string; // High contrast highlight for karaoke active word
    strokeColorHex?: string;
    strokeWidth?: number;
    shadowColorHex?: string;
    glowIntensity?: number; // 0 to 100%
    backgroundColorHex?: string;
    bannerPillColorHex?: string;
    position: 'top' | 'middle' | 'bottom' | 'custom';
    customCoord?: Vector2D;
    animation:
      | 'popIn'
      | 'fade'
      | 'kineticWave'
      | 'karaoke'
      | 'bouncePop'
      | 'typewriter'
      | 'neonPulse'
      | 'bannerPill'
      | 'none';
    words?: WordTimestamp[];
  };
}

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
  volume?: number; // Track master volume fader (0.0 to 1.5)
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

/**
 * Word-level transcription token from Whisper
 */
export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

/**
 * Factory helper creating a fresh default empty project structure
 */
export function createDefaultTimelineProject(title = 'Untitled Reel'): TimelineProject {
  return {
    schemaVersion: '1.0.0',
    projectMetadata: {
      id: `proj_${Date.now()}`,
      title,
      targetAspectRatio: '9:16',
      width: 1080,
      height: 1920,
      frameRate: 30,
      totalDuration: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    globalAudioTracks: {
      bgmVolume: 0.25,
      duckingEnabled: true,
    },
    tracks: [
      {
        id: 'track-text',
        name: 'Kinetic Captions',
        type: 'text',
        isMuted: false,
        isLocked: false,
        zIndex: 30,
        clips: [],
      },
      {
        id: 'track-sfx',
        name: 'SFX Overlays',
        type: 'sfx',
        isMuted: false,
        isLocked: false,
        zIndex: 20,
        clips: [],
      },
      {
        id: 'track-video',
        name: 'Primary Video',
        type: 'video',
        isMuted: false,
        isLocked: false,
        zIndex: 10,
        clips: [],
      },
    ],
  };
}
