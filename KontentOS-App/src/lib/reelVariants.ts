import type { AutoEditStats } from './api';
import {
  applyPresetLook,
  cloneProject,
  getPreset,
  sfxClips,
  textClips,
  videoClips,
  type EditPreset,
  type SFXClip,
  type TimelineProject,
  type TransformKeyframe,
  type VideoClip,
} from './timeline';

/**
 * One generation pass should give a creator a real choice, not three labels on the same cut.
 * These transforms are deterministic: the transcript/frame analysis and copy are shared, while the
 * edit grammar (cuts, punch rhythm, grade, captions and accents) changes. Nothing here invents
 * spoken words or changes the timeline duration, so captions stay synced in every variant.
 */
export interface ReelVariant {
  id: 'your-pick' | 'clean-story' | 'rapid-remix';
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  project: TimelineProject;
  stats: AutoEditStats;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Number(value.toFixed(3));

function rename(project: TimelineProject, label: string): TimelineProject {
  const title = project.projectMetadata.title || 'Untitled cut';
  return {
    ...project,
    projectMetadata: {
      ...project.projectMetadata,
      title: title.includes(` · ${label}`) ? title : `${title} · ${label}`,
      updatedAt: new Date().toISOString(),
    },
  };
}

function normalizeKeyframes(keyframes: TransformKeyframe[], duration: number): TransformKeyframe[] {
  const sorted = [...keyframes]
    .map((k) => ({ ...k, timeOffset: round(clamp(k.timeOffset || 0, 0, duration)) }))
    .sort((a, b) => a.timeOffset - b.timeOffset);
  const unique: TransformKeyframe[] = [];
  for (const keyframe of sorted) {
    if (unique.length && keyframe.timeOffset - unique[unique.length - 1].timeOffset < 0.08) continue;
    unique.push(keyframe);
  }
  if (!unique.length) return [];
  if (unique[0].timeOffset > 0.04) {
    unique.unshift({ timeOffset: 0, scale: 1, position: { x: 0, y: 0 }, easing: 'linear' });
  }
  if (unique[unique.length - 1].timeOffset < duration - 0.05) {
    unique.push({ timeOffset: round(duration), scale: 1, position: { x: 0, y: 0 }, easing: 'linear' });
  }
  return unique;
}

function quickPunch(duration: number, seed: number, peakScale: number): TransformKeyframe[] {
  if (duration < 0.5) return [{ timeOffset: 0, scale: 1, position: { x: 0, y: 0 }, easing: 'linear' }];
  const peakAt = round(clamp(duration * (seed % 2 === 0 ? 0.26 : 0.34), 0.12, duration - 0.18));
  const settleAt = round(clamp(peakAt + duration * 0.3, peakAt + 0.12, duration - 0.06));
  return [
    { timeOffset: 0, scale: 1, position: { x: 0, y: 0 }, easing: 'linear' },
    {
      timeOffset: peakAt,
      scale: peakScale,
      position: { x: seed % 2 === 0 ? 0.015 : -0.015, y: -0.025 },
      easing: 'easeInOut',
    },
    { timeOffset: settleAt, scale: 1 + (peakScale - 1) * 0.35, position: { x: 0, y: 0 }, easing: 'easeOut' },
    { timeOffset: round(duration), scale: 1, position: { x: 0, y: 0 }, easing: 'linear' },
  ];
}

function softenClip(clip: VideoClip): VideoClip {
  return {
    ...clip,
    id: `v_clean_${clip.id}`,
    name: `${clip.name} · Natural hold`,
    keyframes: normalizeKeyframes(
      clip.keyframes.map((k) => ({
        ...k,
        scale: 1 + (Math.max(1, k.scale) - 1) * 0.2,
        position: { x: k.position.x * 0.25, y: k.position.y * 0.25 },
      })),
      clip.duration,
    ),
  };
}

/** Bridge short dead-air gaps by speeding through them inside one longer take. */
function mergeCleanClips(clips: VideoClip[]): VideoClip[] {
  if (clips.length < 2) return clips.map(softenClip);

  const groups: VideoClip[][] = [];
  let group = [clips[0]];
  for (let index = 1; index < clips.length; index += 1) {
    const previous = group[group.length - 1];
    const next = clips[index];
    const timelineGap = next.startOnTimeline - (previous.startOnTimeline + previous.duration);
    const sourceGap =
      next.sourceStartOffset -
      (previous.sourceStartOffset + previous.duration * (previous.speedMultiplier || 1));
    const canHold = Math.abs(timelineGap) < 0.08 && sourceGap >= -0.08 && sourceGap <= 1.2;
    if (canHold) {
      group.push(next);
    } else {
      groups.push(group);
      group = [next];
    }
  }
  groups.push(group);

  return groups.flatMap((members) => {
    const start = members[0].startOnTimeline;
    const timelineEnd = Math.max(...members.map((c) => c.startOnTimeline + c.duration));
    const timelineSpan = timelineEnd - start;
    const sourceStart = members[0].sourceStartOffset;
    const sourceEnd = Math.max(
      ...members.map((c) => c.sourceStartOffset + c.duration * (c.speedMultiplier || 1)),
    );
    const speed = clamp((sourceEnd - sourceStart) / Math.max(0.1, timelineSpan), 1, 2.5);
    if (members.length === 1 || speed >= 2.45) return members.map(softenClip);

    const keyframes = members.flatMap((clip) =>
      clip.keyframes.map((keyframe) => ({
        ...keyframe,
        timeOffset: clip.startOnTimeline - start + keyframe.timeOffset,
        scale: 1 + (Math.max(1, keyframe.scale) - 1) * 0.2,
        position: { x: keyframe.position.x * 0.25, y: keyframe.position.y * 0.25 },
      })),
    );
    return [
      {
        ...members[0],
        id: `v_clean_${members[0].id}`,
        name: `${members[0].name} · Natural hold`,
        startOnTimeline: start,
        duration: round(timelineSpan),
        sourceStartOffset: round(sourceStart),
        speedMultiplier: round(speed),
        keyframes: normalizeKeyframes(keyframes, timelineSpan),
      },
    ];
  });
}

function splitRapidClips(clips: VideoClip[]): VideoClip[] {
  return clips.flatMap((clip, index) => {
    if (clip.duration < 1.1) {
      const boosted = clip.keyframes.map((k) => ({
        ...k,
        scale: Math.min(1.28, 1 + (Math.max(1, k.scale) - 1) * 1.04),
      }));
      return [
        {
          ...clip,
          id: `v_rapid_${clip.id}`,
          name: `${clip.name} · Snap`,
          keyframes: normalizeKeyframes(
            boosted.length ? boosted : quickPunch(clip.duration, index, 1.24),
            clip.duration,
          ),
        },
      ];
    }

    const parts = clip.duration >= 2.4 ? 3 : 2;
    const partDuration = clip.duration / parts;
    const speed = clip.speedMultiplier || 1;
    return Array.from({ length: parts }, (_, part) => {
      const partStart = part * partDuration;
      const local = clip.keyframes
        .filter((k) => k.timeOffset >= partStart - 0.01 && k.timeOffset <= partStart + partDuration + 0.01)
        .map((k) => ({
          ...k,
          timeOffset: k.timeOffset - partStart,
          scale: Math.min(1.28, 1 + (Math.max(1, k.scale) - 1) * 1.04),
        }));
      const keyframes = local.some((k) => k.scale > 1.1)
        ? local
        : quickPunch(partDuration, index + part, 1.24);
      return {
        ...clip,
        id: `v_rapid_${clip.id}_${part}`,
        name: `${clip.name} · Snap ${part + 1}`,
        startOnTimeline: round(clip.startOnTimeline + partStart),
        sourceStartOffset: round(clip.sourceStartOffset + partStart * speed),
        duration: round(partDuration),
        keyframes: normalizeKeyframes(keyframes, partDuration),
      };
    });
  });
}

function replaceVideoClips(project: TimelineProject, make: (clips: VideoClip[]) => VideoClip[]): TimelineProject {
  return {
    ...project,
    tracks: project.tracks.map((track) =>
      track.type === 'video' ? { ...track, clips: make(videoClips(project)) } : track,
    ),
  };
}

function replaceSfxClips(project: TimelineProject, make: (clips: SFXClip[]) => SFXClip[]): TimelineProject {
  return {
    ...project,
    tracks: project.tracks.map((track) =>
      track.type === 'sfx' ? { ...track, clips: make(sfxClips(project)) } : track,
    ),
  };
}

/** Keep the original source duration reference so all three stats lines compare like for like. */
function statsFromProject(project: TimelineProject, reference: AutoEditStats): AutoEditStats {
  const video = videoClips(project);
  const punch = video.reduce(
    (count, clip) => count + (clip.keyframes || []).filter((k) => k.scale > 1.1).length,
    0,
  );
  const original = reference.originalDurationSec || video.reduce(
    (max, clip) => Math.max(max, clip.sourceStartOffset + clip.duration * (clip.speedMultiplier || 1)),
    0,
  );
  const trimmed = project.projectMetadata.totalDuration || 0;
  return {
    ...reference,
    originalDurationSec: Number(original.toFixed(2)),
    trimmedDurationSec: Number(trimmed.toFixed(2)),
    silenceRemovedSec: Number(Math.max(0, original - trimmed).toFixed(2)),
    cutsCount: video.length,
    punchZoomsCount: punch,
    sfxCount: sfxClips(project).length,
    captionsCount: textClips(project).length,
  };
}

function cleanVariant(base: TimelineProject): TimelineProject {
  let project = replaceVideoClips(cloneProject(base), mergeCleanClips);
  project = replaceSfxClips(project, () => []);
  project = applyPresetLook(project, getPreset('clean'));
  return rename(project, 'Clean Story');
}

function rapidVariant(base: TimelineProject, sourceStats: AutoEditStats): TimelineProject {
  let project = replaceVideoClips(cloneProject(base), splitRapidClips);
  project = replaceSfxClips(project, (existing) => {
    const accents = existing.map((clip) => ({ ...clip, id: `sfx_rapid_${clip.id}` }));
    videoClips(project).forEach((clip, index) => {
      if (index % 2 === 1) return;
      const start = round(clip.startOnTimeline + 0.04);
      if (accents.some((accent) => Math.abs(accent.startOnTimeline - start) < 0.45)) return;
      accents.push({
        id: `sfx_rapid_beat_${index}`,
        name: 'Beat Accent',
        type: 'sfx',
        sfxAssetId: 'pop',
        startOnTimeline: start,
        duration: 0.25,
        sourceStartOffset: 0,
        audioModifiers: { pitchShiftCents: 0, volume: 0.45, fadeInSec: 0, fadeOutSec: 0.08 },
      });
    });
    return accents.sort((a, b) => a.startOnTimeline - b.startOnTimeline);
  });
  project = applyPresetLook(project, getPreset('jumpcut'));
  return rename(project, 'Rapid Remix');
}

/** Build the three pickable cuts from one already-edited base project. */
export function buildReelVariants(
  base: TimelineProject,
  sourceStats: AutoEditStats,
  preset: EditPreset,
): ReelVariant[] {
  const recommended = rename(applyPresetLook(cloneProject(base), preset), preset.name);
  const clean = cleanVariant(base);
  const rapid = rapidVariant(base, sourceStats);
  return [
    {
      id: 'your-pick',
      label: `Your pick · ${preset.name}`,
      shortLabel: preset.name,
      description: preset.tagline,
      icon: preset.icon,
      project: recommended,
      stats: statsFromProject(recommended, sourceStats),
    },
    {
      id: 'clean-story',
      label: 'Clean Story',
      shortLabel: 'Clean Story',
      description: 'Longer holds, softer reframes, tidy captions and no artificial accents.',
      icon: 'graphic_eq',
      project: clean,
      stats: statsFromProject(clean, sourceStats),
    },
    {
      id: 'rapid-remix',
      label: 'Rapid Remix',
      shortLabel: 'Rapid Remix',
      description: 'Tighter cuts, quicker reframes and a light rhythmic accent. Still restrained.',
      icon: 'sports_esports',
      project: rapid,
      stats: statsFromProject(rapid, sourceStats),
    },
  ];
}
