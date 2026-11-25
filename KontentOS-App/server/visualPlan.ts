/**
 * Compile a silent-clip visual edit into the same TimelineProject the speech director produces.
 *
 * The plan uses only observed visual beats and on-screen text from `visualAnalysis.ts`. It never
 * converts those lines into spoken captions; the text track is explicitly "On-Screen Text".
 */
import type {
  EditPreset,
  SFXClip,
  TextClip,
  TimelineProject,
  TransformKeyframe,
  VideoClip,
} from '../src/lib/timeline.js';
import type { VisualAnalysis } from './visualAnalysis.js';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

interface VisualCompileOptions {
  metadata: {
    id: string;
    title?: string;
    duration: number;
    width?: number;
    height?: number;
    targetAspectRatio?: '9:16' | '16:9' | '1:1' | '4:5';
    sourceUrl?: string;
  };
  analysis: VisualAnalysis;
  preset?: Pick<EditPreset, 'visualLook' | 'caption' | 'options'>;
}

interface Range {
  rawStart: number;
  rawEnd: number;
  timelineStart: number;
  duration: number;
}

function buildRanges(duration: number, analysis: VisualAnalysis): Range[] {
  const lead = Math.min(duration * 0.06, 0.4);
  const tail = Math.min(duration * 0.04, 0.25);
  const availableStart = lead;
  const availableEnd = Math.max(availableStart + 0.6, duration - tail);
  const observedBeats = analysis.visualBeats
    .map((beat) => Number(beat.timeSec))
    .filter((time) => Number.isFinite(time) && time > availableStart + 0.35 && time < availableEnd - 0.35)
    .sort((a, b) => a - b);

  let boundaries = [availableStart, ...observedBeats, availableEnd]
    .filter((time, index, all) => index === 0 || time - all[index - 1] >= 0.5)
    .sort((a, b) => a - b);

  if (boundaries.length < 3) {
    const count = duration > 12 ? 5 : duration > 7 ? 4 : 3;
    boundaries = Array.from({ length: count + 1 }, (_, index) =>
      round2(availableStart + ((availableEnd - availableStart) * index) / count)
    );
  }

  const ranges: Range[] = [];
  let timelineCursor = 0;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const rawStart = round2(boundaries[index]);
    const rawEnd = round2(boundaries[index + 1]);
    const beatDuration = round2(rawEnd - rawStart);
    if (beatDuration < 0.25) continue;
    ranges.push({ rawStart, rawEnd, timelineStart: round2(timelineCursor), duration: beatDuration });
    timelineCursor = round2(timelineCursor + beatDuration);
  }
  return ranges;
}

function mapRawTime(rawTime: number, ranges: Range[], totalDuration: number): { start: number; end: number } {
  const containing = ranges.find((range) => rawTime >= range.rawStart && rawTime <= range.rawEnd);
  if (containing) {
    const offset = clamp(rawTime - containing.rawStart, 0, containing.duration);
    const start = round2(clamp(containing.timelineStart + offset, 0, totalDuration));
    return { start, end: start };
  }
  const nearest = ranges.reduce<Range | null>((best, range) => {
    if (!best) return range;
    const bestDistance = Math.min(Math.abs(rawTime - best.rawStart), Math.abs(rawTime - best.rawEnd));
    const distance = Math.min(Math.abs(rawTime - range.rawStart), Math.abs(rawTime - range.rawEnd));
    return distance < bestDistance ? range : best;
  }, null);
  const start = nearest
    ? round2(clamp(nearest.timelineStart + clamp(rawTime - nearest.rawStart, 0, nearest.duration), 0, totalDuration))
    : 0;
  return { start, end: start };
}

/** Pure, deterministic compiler for a visually analysed silent take. */
export function compileVisualPlan({ metadata, analysis, preset }: VisualCompileOptions): TimelineProject {
  const duration = Math.max(0.6, Number(metadata.duration) || 12);
  const ranges = buildRanges(duration, analysis);
  const punchEnabled = preset?.options?.punchZoomEnabled ?? true;
  const captionsEnabled = preset?.options?.captionsEnabled ?? true;
  const sfxEnabled = preset?.options?.sfxEnabled ?? true;
  const captionStyle = preset?.caption;
  const zooms = [1.14, 1.2, 1.12, 1.18, 1.13, 1.22];

  const videoClips: VideoClip[] = ranges.map((range, index) => {
    const zoom = punchEnabled ? zooms[index % zooms.length] : 1;
    const keyframes: TransformKeyframe[] = zoom > 1
      ? [
          { timeOffset: 0, scale: 1, position: { x: 0, y: 0 }, easing: 'linear' },
          { timeOffset: round2(range.duration * 0.25), scale: zoom, position: { x: 0, y: -0.018 }, easing: 'easeInOut' },
          { timeOffset: round2(range.duration * 0.72), scale: Math.max(1.04, zoom - 0.08), position: { x: 0, y: 0 }, easing: 'easeOut' },
          { timeOffset: range.duration, scale: zoom, position: { x: 0, y: 0 }, easing: 'easeInOut' },
        ]
      : [];
    return {
      id: `v_visual_${index}`,
      name: analysis.visualBeats[index]?.label
        ? `Beat ${index + 1}: ${analysis.visualBeats[index].label}`
        : `Visual beat ${index + 1}`,
      type: 'video',
      startOnTimeline: range.timelineStart,
      duration: range.duration,
      sourceStartOffset: range.rawStart,
      sourceFileId: metadata.id,
      sourceUrl: metadata.sourceUrl,
      speedMultiplier: 1,
      keyframes,
      audioModifiers: { pitchShiftCents: 0, volume: 1, fadeInSec: 0, fadeOutSec: 0 },
    };
  });

  const totalDuration = round2(videoClips.reduce((sum, clip) => sum + clip.duration, 0)) || duration;

  const textClips: TextClip[] = [];
  if (captionsEnabled) {
    analysis.onScreenText.slice(0, 5).forEach((line, index) => {
      const mappedStart = mapRawTime(line.startSec, ranges, totalDuration);
      const mappedEnd = mapRawTime(line.endSec, ranges, totalDuration);
      const preferredStart = mappedEnd.start > mappedStart.end ? mappedEnd.start - 1.2 : mappedStart.start;
      const startOnTimeline = round2(clamp(preferredStart, 0, Math.max(0, totalDuration - 0.6)));
      const durationForText = round2(
        clamp(mappedEnd.end > startOnTimeline ? mappedEnd.end - startOnTimeline : 1.2, 0.6, 3)
      );
      textClips.push({
        id: `t_visual_${index}`,
        name: line.text,
        type: 'text',
        content: line.text,
        startOnTimeline,
        duration: durationForText,
        sourceStartOffset: round2(line.startSec),
        style: {
          fontFamily: captionStyle?.fontFamily || 'system-ui, sans-serif',
          fontSize: captionStyle?.fontSize || 46,
          colorHex: captionStyle?.colorHex || '#FFFFFF',
          activeWordColorHex: captionStyle?.activeWordColorHex || '#C7A765',
          strokeColorHex: captionStyle?.strokeColorHex || '#000000',
          strokeWidth: captionStyle?.strokeWidth ?? 3,
          shadowColorHex: captionStyle?.shadowColorHex || 'rgba(0,0,0,0.92)',
          // A pill appears only for the banner-pill preset, never as a universal black line box.
          bannerPillColorHex: captionStyle?.animation === 'bannerPill' ? captionStyle.bannerPillColorHex : undefined,
          position: captionStyle?.position || 'bottom',
          animation: captionStyle?.animation || 'fade',
        },
      });
    });
  }

  const sfxClips: SFXClip[] = [];
  if (sfxEnabled && ranges.length > 2) {
    videoClips.slice(1).forEach((clip, index) => {
      if (index % 2 === 1) return;
      sfxClips.push({
        id: `sfx_visual_${index}`,
        name: 'Beat Accent',
        type: 'sfx',
        sfxAssetId: 'pop',
        startOnTimeline: round2(Math.max(0, clip.startOnTimeline - 0.04)),
        duration: 0.25,
        sourceStartOffset: 0,
        audioModifiers: { pitchShiftCents: 0, volume: 0.42, fadeInSec: 0, fadeOutSec: 0.08 },
      });
    });
  }

  const geometryWidth = metadata.width || 1080;
  const geometryHeight = metadata.height || 1920;
  return {
    schemaVersion: '1.0.0',
    projectMetadata: {
      id: metadata.id.startsWith('proj_') ? metadata.id : `proj_${metadata.id}`,
      title: metadata.title || 'Visual cut',
      targetAspectRatio: metadata.targetAspectRatio || '9:16',
      width: geometryWidth,
      height: geometryHeight,
      frameRate: 30,
      visualLook: preset?.visualLook || 'viral',
      totalDuration,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    globalAudioTracks: { bgmVolume: sfxEnabled ? 0.18 : 0, duckingEnabled: true },
    tracks: [
      {
        id: 'track-text',
        name: captionsEnabled ? 'On-Screen Text' : 'On-Screen Text (Off)',
        type: 'text',
        isMuted: !captionsEnabled,
        isLocked: false,
        zIndex: 30,
        clips: textClips,
      },
      {
        id: 'track-sfx',
        name: 'Transition FX',
        type: 'sfx',
        isMuted: !sfxEnabled,
        isLocked: false,
        zIndex: 20,
        clips: sfxClips,
      },
      {
        id: 'track-video',
        name: 'Primary Video',
        type: 'video',
        isMuted: false,
        isLocked: false,
        zIndex: 10,
        clips: videoClips,
      },
    ],
  };
}
