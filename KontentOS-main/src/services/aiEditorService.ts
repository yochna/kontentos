/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TimelineProject,
  TimelineTrack,
  TimelineClip,
  VideoClip,
  SFXClip,
  TextClip,
  WordTimestamp,
} from '../types/timeline';

export interface AutoEditVideoInput {
  id: string;
  title: string;
  duration: number;
  width?: number;
  height?: number;
  targetAspectRatio?: '9:16' | '16:9' | '1:1';
  sourceUrl?: string;
}

export interface AutoEditOptions {
  silenceThresholdSec?: number;
  sfxEnabled?: boolean;
  punchZoomEnabled?: boolean;
  captionsEnabled?: boolean;
}

export interface AutoEditStats {
  originalDurationSec: number;
  trimmedDurationSec: number;
  silenceRemovedSec: number;
  cutsCount: number;
  punchZoomsCount: number;
  sfxCount: number;
  captionsCount: number;
}

export interface AutoEditResult {
  project: TimelineProject;
  stats: AutoEditStats;
  source: 'gemini' | 'local_engine';
  message: string;
}

/**
 * Validates that an arbitrary payload strictly adheres to the TimelineProject schema
 */
export function validateTimelineProject(data: unknown): TimelineProject {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid EDL project: Root payload is not an object.');
  }

  const proj = data as Record<string, any>;

  if (proj.schemaVersion !== '1.0.0') {
    throw new Error(`Invalid schemaVersion: Expected '1.0.0', got '${proj.schemaVersion}'`);
  }

  if (!proj.projectMetadata || typeof proj.projectMetadata !== 'object') {
    throw new Error('Invalid EDL project: Missing projectMetadata object.');
  }

  const meta = proj.projectMetadata;
  if (!meta.id || typeof meta.id !== 'string') {
    throw new Error('Invalid projectMetadata: id must be a non-empty string.');
  }
  if (typeof meta.totalDuration !== 'number' || meta.totalDuration < 0) {
    throw new Error('Invalid projectMetadata: totalDuration must be a positive number.');
  }

  if (!Array.isArray(proj.tracks)) {
    throw new Error('Invalid EDL project: tracks must be an array.');
  }

  // Validate each track
  const validatedTracks: TimelineTrack[] = proj.tracks.map((track: any, tIdx: number) => {
    if (!track || typeof track !== 'object') {
      throw new Error(`Invalid track at index ${tIdx}: Track must be an object.`);
    }

    if (!track.id || typeof track.id !== 'string') {
      throw new Error(`Invalid track at index ${tIdx}: Missing track.id.`);
    }

    if (!['video', 'audio', 'sfx', 'text', 'adjustment'].includes(track.type)) {
      throw new Error(`Invalid track at index ${tIdx}: Unknown track type '${track.type}'.`);
    }

    if (!Array.isArray(track.clips)) {
      throw new Error(`Invalid track '${track.id}': clips must be an array.`);
    }

    // Validate each clip
    const validatedClips: TimelineClip[] = track.clips.map((clip: any, cIdx: number) => {
      if (!clip || typeof clip !== 'object') {
        throw new Error(`Invalid clip at track ${track.id}[${cIdx}]: Clip must be an object.`);
      }

      if (!clip.id || typeof clip.id !== 'string') {
        throw new Error(`Invalid clip at track ${track.id}[${cIdx}]: Missing clip.id.`);
      }

      if (typeof clip.startOnTimeline !== 'number' || clip.startOnTimeline < 0) {
        throw new Error(`Invalid clip '${clip.id}': startOnTimeline must be a positive number.`);
      }

      if (typeof clip.duration !== 'number' || clip.duration <= 0) {
        throw new Error(`Invalid clip '${clip.id}': duration must be greater than 0.`);
      }

      // Clip type specific validation
      if (clip.type === 'video') {
        const vClip = clip as VideoClip;
        if (!Array.isArray(vClip.keyframes)) {
          vClip.keyframes = [];
        }
        if (!vClip.audioModifiers) {
          vClip.audioModifiers = { pitchShiftCents: 0, volume: 1.0, fadeInSec: 0, fadeOutSec: 0 };
        }
      } else if (clip.type === 'sfx') {
        const sClip = clip as SFXClip;
        if (!sClip.sfxAssetId) {
          sClip.sfxAssetId = 'pop';
        }
        if (!sClip.audioModifiers) {
          sClip.audioModifiers = { pitchShiftCents: 0, volume: 1.0, fadeInSec: 0, fadeOutSec: 0.1 };
        }
      } else if (clip.type === 'text') {
        const tClip = clip as TextClip;
        if (typeof tClip.content !== 'string') {
          tClip.content = '';
        }
        if (!tClip.style || typeof tClip.style !== 'object') {
          tClip.style = {
            fontFamily: 'Impact, sans-serif',
            fontSize: 48,
            colorHex: '#FFFF00',
            strokeColorHex: '#000000',
            strokeWidth: 4,
            position: 'middle',
            animation: 'popIn',
          };
        }
      }

      return clip as TimelineClip;
    });

    return {
      id: String(track.id),
      name: String(track.name || `Track ${tIdx + 1}`),
      type: track.type,
      isMuted: Boolean(track.isMuted),
      isLocked: Boolean(track.isLocked),
      zIndex: typeof track.zIndex === 'number' ? track.zIndex : (track.type === 'text' ? 30 : track.type === 'sfx' ? 20 : 10),
      clips: validatedClips,
    };
  });

  return {
    schemaVersion: '1.0.0',
    projectMetadata: {
      id: String(meta.id),
      title: String(meta.title || 'Untitled Reel'),
      targetAspectRatio: meta.targetAspectRatio || '9:16',
      width: Number(meta.width || 1080),
      height: Number(meta.height || 1920),
      frameRate: Number(meta.frameRate || 30),
      totalDuration: Number(meta.totalDuration),
      createdAt: meta.createdAt || new Date().toISOString(),
      updatedAt: meta.updatedAt || new Date().toISOString(),
    },
    globalAudioTracks: {
      backgroundMusicAssetId: proj.globalAudioTracks?.backgroundMusicAssetId,
      backgroundMusicUrl: proj.globalAudioTracks?.backgroundMusicUrl,
      bgmVolume: typeof proj.globalAudioTracks?.bgmVolume === 'number' ? proj.globalAudioTracks.bgmVolume : 0.25,
      duckingEnabled: proj.globalAudioTracks?.duckingEnabled ?? true,
    },
    tracks: validatedTracks,
  };
}

/**
 * Dispatches the video metadata and word-level Whisper transcript to the backend API route /api/editor/auto-edit
 * and returns the validated TimelineProject.
 */
export async function requestAutoEdit(
  videoMetadata: AutoEditVideoInput,
  words: WordTimestamp[],
  options?: AutoEditOptions
): Promise<AutoEditResult> {
  const payload = {
    videoMetadata,
    words,
    options: {
      silenceThresholdSec: options?.silenceThresholdSec ?? 0.4,
      sfxEnabled: options?.sfxEnabled ?? true,
      punchZoomEnabled: options?.punchZoomEnabled ?? true,
      captionsEnabled: options?.captionsEnabled ?? true,
    },
  };

  const response = await fetch('/api/editor/auto-edit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Auto-Edit API failed with status ${response.status}: ${errorText}`);
  }

  const json = await response.json();

  if (!json.success || !json.data) {
    throw new Error(json.error || 'Server did not return successful auto-edit project data.');
  }

  // Strictly validate returned EDL schema
  const validatedProject = validateTimelineProject(json.data);

  return {
    project: validatedProject,
    stats: json.stats || {
      originalDurationSec: videoMetadata.duration,
      trimmedDurationSec: validatedProject.projectMetadata.totalDuration,
      silenceRemovedSec: Math.max(0, videoMetadata.duration - validatedProject.projectMetadata.totalDuration),
      cutsCount: validatedProject.tracks.find((t) => t.type === 'video')?.clips.length || 0,
      punchZoomsCount: 0,
      sfxCount: validatedProject.tracks.find((t) => t.type === 'sfx')?.clips.length || 0,
      captionsCount: validatedProject.tracks.find((t) => t.type === 'text')?.clips.length || 0,
    },
    source: json.source || 'local_engine',
    message: json.message || 'Auto-Edit EDL successfully generated and validated.',
  };
}

export interface CommandResult {
  project: TimelineProject;
  message: string;
  source: 'gemini' | 'local_engine';
  actionSummary?: string;
}

/**
 * Dispatches a natural language user instruction and current TimelineProject state
 * to /api/editor/command for AI-powered state mutation (System Prompt B).
 */
export async function requestEditorCommand(
  currentState: TimelineProject,
  userInstruction: string
): Promise<CommandResult> {
  const response = await fetch('/api/editor/command', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      currentState,
      userInstruction: userInstruction.trim(),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI Editor Command failed with status ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  if (!json.success || !json.data) {
    throw new Error(json.error || 'Server did not return a valid mutated project.');
  }

  const validatedProject = validateTimelineProject(json.data);

  return {
    project: validatedProject,
    message: json.message || 'Timeline state successfully mutated.',
    source: json.source || 'local_engine',
    actionSummary: json.actionSummary || `Executed "${userInstruction.trim()}"`,
  };
}

