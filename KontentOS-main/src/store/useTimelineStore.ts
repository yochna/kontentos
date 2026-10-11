/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import {
  TimelineProject,
  TimelineTrack,
  TimelineClip,
  VideoClip,
  createDefaultTimelineProject,
} from '../types/timeline';

const MAX_HISTORY_LENGTH = 30;

export interface TimelineHistory {
  past: TimelineProject[];
  future: TimelineProject[];
}

export interface TimelineState {
  project: TimelineProject;
  currentTime: number;
  isPlaying: boolean;
  selectedClipIds: string[];
  history: TimelineHistory;

  // Primary Actions
  hydrateFromEDL: (edl: TimelineProject) => void;
  applyMutation: (mutatedProject: TimelineProject, preservePlayhead?: boolean) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setSelectedClipIds: (clipIds: string[]) => void;
  selectClip: (clipId: string, multiSelect?: boolean) => void;
  updateClip: (trackId: string, clipId: string, updates: Partial<TimelineClip>) => void;
  splitClip: (clipId: string, splitTime?: number) => void;
  deleteClip: (clipId: string) => void;
  rippleDeleteClip: (clipId: string) => void;
  addClipToTrack: (trackId: string, clip: TimelineClip) => void;
  loadSourceVideoFile: (file: { name: string; size?: number }, duration: number, url?: string) => void;
  updateProjectDuration: (duration: number) => void;
  undo: () => void;
  redo: () => void;
  resetProject: () => void;
}

/**
 * Computes maximum duration across all clips in all tracks
 */
function computeTotalDuration(tracks: TimelineTrack[], fallback = 0): number {
  let maxDuration = fallback;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const clipEnd = clip.startOnTimeline + clip.duration;
      if (clipEnd > maxDuration) {
        maxDuration = clipEnd;
      }
    }
  }
  return Math.max(maxDuration, fallback);
}

/**
 * Deep clones data structure for immutability and history snapshots
 */
function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  project: createDefaultTimelineProject('My AI Smart Reel'),
  currentTime: 0,
  isPlaying: false,
  selectedClipIds: [],
  history: {
    past: [],
    future: [],
  },

  hydrateFromEDL: (edl: TimelineProject) => {
    const current = get().project;
    const clonedEdl = clone(edl);

    // Ensure total duration is correctly set
    const calculatedDuration = computeTotalDuration(
      clonedEdl.tracks,
      clonedEdl.projectMetadata.totalDuration || 0
    );
    clonedEdl.projectMetadata.totalDuration = calculatedDuration;
    clonedEdl.projectMetadata.updatedAt = new Date().toISOString();

    set((state) => ({
      history: {
        past: [...state.history.past.slice(-MAX_HISTORY_LENGTH + 1), clone(current)],
        future: [],
      },
      project: clonedEdl,
      currentTime: 0,
      isPlaying: false,
      selectedClipIds: [],
    }));
  },

  applyMutation: (mutatedProject: TimelineProject, preservePlayhead = true) => {
    const current = get().project;
    const cloned = clone(mutatedProject);

    // Ensure total duration is correctly set
    const calculatedDuration = computeTotalDuration(
      cloned.tracks,
      cloned.projectMetadata.totalDuration || 0
    );
    cloned.projectMetadata.totalDuration = calculatedDuration;
    cloned.projectMetadata.updatedAt = new Date().toISOString();

    const curTime = get().currentTime;
    const boundedTime = preservePlayhead
      ? Math.max(0, Math.min(curTime, calculatedDuration))
      : 0;

    set((state) => ({
      history: {
        past: [...state.history.past.slice(-MAX_HISTORY_LENGTH + 1), clone(current)],
        future: [],
      },
      project: cloned,
      currentTime: boundedTime,
      selectedClipIds: [],
    }));
  },

  setCurrentTime: (time: number) => {
    const totalDuration = get().project.projectMetadata.totalDuration || 0;
    const boundedTime = Math.max(0, totalDuration > 0 ? Math.min(time, totalDuration) : time);
    set({ currentTime: boundedTime });
  },

  setIsPlaying: (isPlaying: boolean) => {
    set({ isPlaying });
  },

  setSelectedClipIds: (clipIds: string[]) => {
    set({ selectedClipIds: clipIds });
  },

  selectClip: (clipId: string, multiSelect = false) => {
    set((state) => {
      if (multiSelect) {
        const exists = state.selectedClipIds.includes(clipId);
        return {
          selectedClipIds: exists
            ? state.selectedClipIds.filter((id) => id !== clipId)
            : [...state.selectedClipIds, clipId],
        };
      }
      return { selectedClipIds: [clipId] };
    });
  },

  updateClip: (trackId: string, clipId: string, updates: Partial<TimelineClip>) => {
    const current = get().project;
    const updated = clone(current);

    let found = false;
    for (const track of updated.tracks) {
      if (track.id === trackId || !trackId) {
        const clipIdx = track.clips.findIndex((c) => c.id === clipId);
        if (clipIdx !== -1) {
          track.clips[clipIdx] = {
            ...track.clips[clipIdx],
            ...updates,
          } as TimelineClip;
          found = true;
          break;
        }
      }
    }

    if (!found) return;

    updated.projectMetadata.totalDuration = computeTotalDuration(updated.tracks);
    updated.projectMetadata.updatedAt = new Date().toISOString();

    set((state) => ({
      history: {
        past: [...state.history.past.slice(-MAX_HISTORY_LENGTH + 1), clone(current)],
        future: [],
      },
      project: updated,
    }));
  },

  splitClip: (clipId: string, splitTime?: number) => {
    const current = get().project;
    const atTime = splitTime !== undefined ? splitTime : get().currentTime;
    const updated = clone(current);

    let targetTrack: TimelineTrack | null = null;
    let targetClip: TimelineClip | null = null;
    let clipIndex = -1;

    for (const track of updated.tracks) {
      const idx = track.clips.findIndex((c) => c.id === clipId);
      if (idx !== -1) {
        targetTrack = track;
        targetClip = track.clips[idx];
        clipIndex = idx;
        break;
      }
    }

    if (!targetTrack || !targetClip || clipIndex === -1) return;

    // Check if the split point is strictly inside the clip bounds
    const clipStart = targetClip.startOnTimeline;
    const clipEnd = clipStart + targetClip.duration;
    if (atTime <= clipStart + 0.05 || atTime >= clipEnd - 0.05) {
      // Split point too close to boundary
      return;
    }

    const firstDuration = atTime - clipStart;
    const secondDuration = targetClip.duration - firstDuration;

    // Speed-aware source offset calculation
    const speed = (targetClip as VideoClip).speedMultiplier || 1.0;
    const sourceOffsetDelta = firstDuration * speed;

    const firstClip: TimelineClip = {
      ...clone(targetClip),
      id: targetClip.id,
      duration: firstDuration,
    };

    const secondClip: TimelineClip = {
      ...clone(targetClip),
      id: `${targetClip.id}_split_${Date.now()}`,
      startOnTimeline: atTime,
      duration: secondDuration,
      sourceStartOffset: targetClip.sourceStartOffset + sourceOffsetDelta,
    };

    // Split keyframes if this is a video clip with transform keyframes
    if (targetClip.type === 'video') {
      const videoClip = targetClip as VideoClip;
      (firstClip as VideoClip).keyframes = (videoClip.keyframes || []).filter(
        (kf) => kf.timeOffset < firstDuration
      );
      (secondClip as VideoClip).keyframes = (videoClip.keyframes || [])
        .filter((kf) => kf.timeOffset >= firstDuration)
        .map((kf) => ({
          ...kf,
          timeOffset: Math.max(0, kf.timeOffset - firstDuration),
        }));
    }

    targetTrack.clips.splice(clipIndex, 1, firstClip, secondClip);

    updated.projectMetadata.totalDuration = computeTotalDuration(updated.tracks);
    updated.projectMetadata.updatedAt = new Date().toISOString();

    set((state) => ({
      history: {
        past: [...state.history.past.slice(-MAX_HISTORY_LENGTH + 1), clone(current)],
        future: [],
      },
      project: updated,
      selectedClipIds: [secondClip.id],
    }));
  },

  deleteClip: (clipId: string) => {
    const current = get().project;
    const updated = clone(current);

    let removed = false;
    for (const track of updated.tracks) {
      const initialLength = track.clips.length;
      track.clips = track.clips.filter((c) => c.id !== clipId);
      if (track.clips.length < initialLength) {
        removed = true;
      }
    }

    if (!removed) return;

    updated.projectMetadata.totalDuration = computeTotalDuration(updated.tracks);
    updated.projectMetadata.updatedAt = new Date().toISOString();

    set((state) => ({
      history: {
        past: [...state.history.past.slice(-MAX_HISTORY_LENGTH + 1), clone(current)],
        future: [],
      },
      project: updated,
      selectedClipIds: state.selectedClipIds.filter((id) => id !== clipId),
    }));
  },

  rippleDeleteClip: (clipId: string) => {
    const current = get().project;
    const updated = clone(current);

    let removed = false;
    for (const track of updated.tracks) {
      const targetClip = track.clips.find((c) => c.id === clipId);
      if (targetClip) {
        const deletedStart = targetClip.startOnTimeline;
        const deletedDuration = targetClip.duration;

        // Filter out target clip
        track.clips = track.clips.filter((c) => c.id !== clipId);

        // Shift all subsequent clips in this track left by deletedDuration
        track.clips = track.clips.map((c) => {
          if (c.startOnTimeline >= deletedStart + deletedDuration - 0.001) {
            return {
              ...c,
              startOnTimeline: Math.max(0, c.startOnTimeline - deletedDuration),
            };
          }
          return c;
        });

        removed = true;
        break;
      }
    }

    if (!removed) return;

    updated.projectMetadata.totalDuration = computeTotalDuration(updated.tracks);
    updated.projectMetadata.updatedAt = new Date().toISOString();

    set((state) => ({
      history: {
        past: [...state.history.past.slice(-MAX_HISTORY_LENGTH + 1), clone(current)],
        future: [],
      },
      project: updated,
      selectedClipIds: state.selectedClipIds.filter((id) => id !== clipId),
    }));
  },

  addClipToTrack: (trackId: string, clip: TimelineClip) => {
    const current = get().project;
    const updated = clone(current);

    const track = updated.tracks.find((t) => t.id === trackId);
    if (!track) return;

    track.clips.push(clone(clip));
    // Sort clips chronologically by startOnTimeline
    track.clips.sort((a, b) => a.startOnTimeline - b.startOnTimeline);

    updated.projectMetadata.totalDuration = computeTotalDuration(updated.tracks);
    updated.projectMetadata.updatedAt = new Date().toISOString();

    set((state) => ({
      history: {
        past: [...state.history.past.slice(-MAX_HISTORY_LENGTH + 1), clone(current)],
        future: [],
      },
      project: updated,
      selectedClipIds: [clip.id],
    }));
  },

  loadSourceVideoFile: (file: { name: string; size?: number }, duration: number, url?: string) => {
    const current = get().project;
    const updated = clone(current);
    const validDuration = Math.max(0.1, duration || 10);

    updated.projectMetadata.title = file.name ? file.name.replace(/\.[^/.]+$/, '') : 'Source Video';
    updated.projectMetadata.totalDuration = validDuration;
    updated.projectMetadata.updatedAt = new Date().toISOString();

    // Find or create video track
    let videoTrack = updated.tracks.find((t) => t.type === 'video');
    if (!videoTrack) {
      videoTrack = {
        id: 'track-video',
        name: 'Primary Video',
        type: 'video',
        isMuted: false,
        isLocked: false,
        zIndex: 10,
        clips: [],
      };
      updated.tracks.push(videoTrack);
    }

    // If track has no clips or had default empty state, populate primary video clip
    if (videoTrack.clips.length === 0) {
      const primaryClip: VideoClip = {
        id: `clip_source_${Date.now()}`,
        name: file.name || 'Primary Video',
        type: 'video',
        startOnTimeline: 0,
        duration: validDuration,
        sourceStartOffset: 0,
        sourceFileId: file.name || 'source_video',
        sourceUrl: url,
        speedMultiplier: 1.0,
        keyframes: [],
        audioModifiers: {
          pitchShiftCents: 0,
          volume: 1.0,
          fadeInSec: 0,
          fadeOutSec: 0,
        },
      };
      videoTrack.clips = [primaryClip];
    } else {
      // If existing clips don't have sourceUrl, attach it
      videoTrack.clips = videoTrack.clips.map((c) => ({
        ...c,
        sourceUrl: url || (c as VideoClip).sourceUrl,
      }));
    }

    set({
      project: updated,
      currentTime: 0,
      isPlaying: false,
      selectedClipIds: videoTrack.clips.map((c) => c.id),
    });
  },

  updateProjectDuration: (duration: number) => {
    if (duration <= 0) return;
    const current = get().project;
    if (current.projectMetadata.totalDuration === duration) return;
    const updated = clone(current);
    updated.projectMetadata.totalDuration = duration;
    set({ project: updated });
  },

  undo: () => {
    const { history, project } = get();
    if (history.past.length === 0) return;

    const previous = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, history.past.length - 1);

    set({
      history: {
        past: newPast,
        future: [clone(project), ...history.future.slice(0, MAX_HISTORY_LENGTH - 1)],
      },
      project: clone(previous),
    });
  },

  redo: () => {
    const { history, project } = get();
    if (history.future.length === 0) return;

    const next = history.future[0];
    const newFuture = history.future.slice(1);

    set({
      history: {
        past: [...history.past.slice(-MAX_HISTORY_LENGTH + 1), clone(project)],
        future: newFuture,
      },
      project: clone(next),
    });
  },

  resetProject: () => {
    const fresh = createDefaultTimelineProject();
    set({
      project: fresh,
      currentTime: 0,
      isPlaying: false,
      selectedClipIds: [],
      history: { past: [], future: [] },
    });
  },
}));
