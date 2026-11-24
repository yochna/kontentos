/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  isDrawableCaptionText,
  stripCaptionDecoration,
  wrapWords,
} from '@/lib/burnCaptions';
import type {
  TimelineProject,
  VideoClip,
  SFXClip,
  TextClip,
  WordTimestamp,
} from '@/lib/timeline';
import { FFMPEG_LOOK_FILTERS } from '@/lib/visualLooks';

export interface CaptionFile {
  /** Name inside the worker's virtual filesystem. */
  name: string;
  /** One line or one word. Text files keep `%`, quotes and commas out of the filter string. */
  text: string;
}

export interface CompiledFiltergraph {
  /** Array of input file arguments needed by FFmpeg (e.g. ['-i', 'input.mp4']) */
  inputArgs: string[];
  /** Mapping of asset ID or input name to input index in the FFmpeg command */
  inputIndexMap: Map<string, number>;
  /** The generated -filter_complex string */
  filterComplex: string;
  /** The final video output map label */
  outputVideoLabel: string;
  /** The final audio output map label */
  outputAudioLabel: string;
  /** Source video files required in the virtual filesystem */
  requiredVideoFiles: Array<{ fileName: string; sourceUrl: string; inputIndex: number }>;
  /** Synthetic SFX/BGM files required in the virtual filesystem */
  requiredSfxFiles: string[];
  /** Text files the drawtext chain reads; a missing file must fail the export, not hide the words */
  requiredCaptionFiles: string[];
  /** Contents of those files, so the worker can write them before ffmpeg starts */
  captionFiles: CaptionFile[];
  /** True only when a non-muted caption track actually produced drawtext nodes */
  hasCaptions: boolean;
  /** Total computed target video duration */
  totalDuration: number;
}

export interface FilterCompilerOptions {
  inputVideoFileName?: string;
  width?: number;
  height?: number;
  fps?: number;
  /** Keyed by source URL and/or virtual file name. A probed silent source gets silence, not a failed map. */
  sourceHasAudio?: Record<string, boolean>;
  /** Keeps caption file names unique when a long project is compiled into chunks. */
  captionFilePrefix?: string;
}

const CAPTION_FONT = 'font.ttf';
const MAX_HIGHLIGHT_CUES = 80;

const seconds = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0).toFixed(3);
const even = (value: number) => Math.max(2, Math.trunc(value / 2) * 2);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function normalizeHexColor(hex: string | undefined, fallback: string): string {
  if (!hex) return fallback;
  const clean = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(clean) || /^[0-9a-fA-F]{8}$/.test(clean)) return `0x${clean}`;
  return fallback;
}

/** The editor stores banner pills as CSS rgba(); drawtext expects color@alpha. */
function bannerBoxColor(value: string | undefined): string {
  if (!value) return 'black@0.65';
  const rgba = value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9.]+)\s*)?\)$/i);
  if (rgba) {
    const channels = rgba.slice(1, 4).map((part) => Math.min(255, Math.max(0, Number(part))));
    const hex = channels.map((part) => Math.round(part).toString(16).padStart(2, '0')).join('');
    const alpha = rgba[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(rgba[4])));
    return `0x${hex}@${Number(alpha.toFixed(2))}`;
  }
  const hex = value.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `0x${hex}@0.65`;
  return 'black@0.65';
}

function pad3(value: number): string {
  return String(value).padStart(3, '0');
}

function atempoFilters(speed: number): string[] {
  if (Math.abs(speed - 1) < 0.001) return [];
  if (speed >= 0.5 && speed <= 2) return [`atempo=${speed.toFixed(3)}`];
  if (speed > 2) return ['atempo=2.000', `atempo=${(speed / 2).toFixed(3)}`];
  return ['atempo=0.500', `atempo=${(speed / 0.5).toFixed(3)}`];
}

interface CaptionOverlay {
  filter: string;
  files: CaptionFile[];
  hasCaptions: boolean;
}

/**
 * Kinetic captions as drawtext nodes over text files.
 *
 * `drawtext` does not wrap and cannot colour one word of a line on its own, so each cue is wrapped
 * here, drawn once as a readable base line, then each timed word is drawn again in the active colour
 * for exactly its own window. The text lives in files rather than inside the graph: creator copy can
 * contain `%`, quotes and punctuation that would otherwise be reinterpreted as filter syntax.
 */
function buildCaptionOverlay(
  clips: TextClip[],
  width: number,
  height: number,
  prefix: string
): CaptionOverlay {
  const cues = clips
    .filter((clip) => clip.content.trim())
    .sort((a, b) => a.startOnTimeline - b.startOnTimeline);
  if (cues.length === 0) return { filter: '', files: [], hasCaptions: false };

  // Emoji decoration is not language. Strip it before validating so a line like "🚨 Ship it 🔥"
  // exports as "Ship it" instead of failing the whole reel, while a script the font truly cannot
  // draw is still refused rather than burned as empty boxes.
  const preparedCues = cues.map((cue) => ({
    cue,
    content: stripCaptionDecoration(cue.content),
    words: (cue.style?.words ?? [])
      .map((word) => ({ ...word, word: stripCaptionDecoration(word.word) }))
      .filter((word) => word.word.length > 0),
  }));

  for (const item of preparedCues) {
    const undrawable =
      (item.content.length > 0 && !isDrawableCaptionText(item.content)) ||
      item.words.some((word) => !isDrawableCaptionText(word.word));
    if (undrawable || (item.content.length === 0 && item.words.length === 0)) {
      throw new Error(
        'A caption has no readable text the bundled caption font can draw. Add readable text before exporting.'
      );
    }
  }

  const minDim = Math.min(width, height);
  const fontScale = minDim / 1080;
  // Wrapping width belongs to the frame; size, colour, position and border belong to each cue.
  const lineChars = Math.round(clamp(20 * (width / 1080), 12, 34));

  const files: CaptionFile[] = [];
  const nodes: string[] = [];

  preparedCues.forEach(({ cue, content, words: cleanWords }, cueIndex) => {
    // The editor lets a creator restyle one line without touching the others. Reading the style
    // inside the loop keeps those changes in the finished file instead of copying cue one's look
    // over the whole reel.
    const style = cue.style;
    const fontSize = Math.round(clamp((style?.fontSize || 60) * fontScale, 26, 116));
    const lineHeight = Math.round(fontSize * 1.18);
    const primaryColor = normalizeHexColor(style?.colorHex, '0xFFFFFF');
    const activeColor = normalizeHexColor(style?.activeWordColorHex, '0xFFE066');
    const borderColor = normalizeHexColor(style?.strokeColorHex, '0x000000');
    const borderWidth = Math.max(2, Math.round((style?.strokeWidth ?? 6) * fontScale));
    const boxBorder = Math.round(fontSize * 0.28);
    const charWidth = fontSize * 0.52;

    const cueStart = Math.max(0, cue.startOnTimeline);
    const cueEnd = cueStart + Math.max(0.1, cue.duration);
    const words: WordTimestamp[] = cleanWords.length
      ? cleanWords
      : content
          .split(/\s+/)
          .filter(Boolean)
          .map((word, index, all) => ({
            word,
            start: (index / all.length) * (cue.duration || 0.1),
            end: ((index + 1) / all.length) * (cue.duration || 0.1),
          }));

    const lines = wrapWords(
      words.map((word) => word.word.trim()),
      lineChars
    );
    if (lines.length === 0) return;

    const position = style?.position || 'bottom';
    const wide = width > height;
    const padY = Math.round(fontSize * 0.24);
    const blockHeight = lines.length * lineHeight + padY * 2;
    // Match ReelPreview: top/bottom are anchored edges, not a fixed centre of the frame.
    const firstLineTop = Math.max(
      0,
      Math.round(
        position === 'top'
          ? height * (wide ? 0.1 : 0.16) + padY
          : position === 'middle'
          ? (height - blockHeight) / 2 + padY
          : height * (wide ? 0.9 : 0.86) - blockHeight + padY
      )
    );

    // Only the solid-pill preset gets a burn-in box. Ordinary captions stay as outlined text,
    // matching the live preview instead of adding a heavy black bar behind every line.
    const useBanner = style?.animation === 'bannerPill' || Boolean(style?.bannerPillColorHex);
    const bannerStyle = useBanner
      ? ['box=1', `boxcolor=${bannerBoxColor(style?.bannerPillColorHex)}`, `boxborderw=${boxBorder}`]
      : [];

    let wordCursor = 0;
    const placements = lines.map((line) => {
      const count = line.split(/\s+/).filter(Boolean).length;
      const placement = { line, startWord: wordCursor, endWord: wordCursor + count };
      wordCursor += count;
      return placement;
    });

    lines.forEach((line, lineIndex) => {
      const name = `${prefix}cap_${pad3(cueIndex)}_${lineIndex}.txt`;
      files.push({ name, text: line });
      nodes.push(
        [
          `drawtext=fontfile=${CAPTION_FONT}`,
          `textfile=${name}`,
          'expansion=none',
          `fontcolor=${primaryColor}`,
          `fontsize=${fontSize}`,
          `borderw=${borderWidth}`,
          `bordercolor=${borderColor}`,
          ...bannerStyle,
          'shadowcolor=black@0.9',
          'shadowx=3',
          'shadowy=3',
          'x=(w-text_w)/2',
          `y=${firstLineTop + lineIndex * lineHeight}`,
          `enable='between(t,${seconds(cueStart)},${seconds(cueEnd)})'`,
        ].join(':')
      );
    });

    if (cueIndex >= MAX_HIGHLIGHT_CUES) return;
    words.forEach((word, wordIndex) => {
      const placement = placements.find(
        (item) => wordIndex >= item.startWord && wordIndex < item.endWord
      );
      if (!placement) return;
      const lineIndex = placements.indexOf(placement);
      const before = words.slice(placement.startWord, wordIndex).map((item) => item.word.trim());
      const offsetChars = before.length ? before.join(' ').length + 1 : 0;
      const estimatedLineWidth = placement.line.length * charWidth;
      const x = Math.round((width - estimatedLineWidth) / 2 + offsetChars * charWidth);
      const start = cueStart + Math.max(0, word.start);
      const end = Math.min(cueEnd, cueStart + Math.max(word.end, word.start + 0.08));
      if (end <= start) return;
      const name = `${prefix}word_${pad3(cueIndex)}_${pad3(wordIndex)}.txt`;
      files.push({ name, text: word.word.trim() });
      nodes.push(
        [
          `drawtext=fontfile=${CAPTION_FONT}`,
          `textfile=${name}`,
          'expansion=none',
          `fontcolor=${activeColor}`,
          `fontsize=${fontSize}`,
          `borderw=${Math.max(1, Math.round(borderWidth * 0.6))}`,
          `bordercolor=${borderColor}`,
          'shadowcolor=black@0.9',
          'shadowx=2',
          'shadowy=2',
          `x=${clamp(x, 0, Math.max(0, width - Math.round(charWidth)))}`,
          `y=${firstLineTop + lineIndex * lineHeight}`,
          `enable='between(t,${seconds(start)},${seconds(end)})'`,
        ].join(':')
      );
    });
  });

  return { filter: nodes.join(','), files, hasCaptions: nodes.length > 0 };
}

interface Segment {
  video: string;
  audio: string;
  duration: number;
}

/**
 * Compiles a full multi-track TimelineProject into an FFmpeg -filter_complex graph.
 *
 * Every frame and every audio sample is addressed by its timeline time. Nothing here depends on a
 * browser tab staying awake, a video element seeking accurately, or a MediaRecorder clock.
 */
export function compileTimelineToFiltergraph(
  project: TimelineProject,
  options: FilterCompilerOptions = {}
): CompiledFiltergraph {
  const inputVideoFileName = options.inputVideoFileName || 'input.mp4';
  const targetWidth = even(options.width || project.projectMetadata.width || 1080);
  const targetHeight = even(options.height || project.projectMetadata.height || 1920);
  const fps = Math.max(1, options.fps || project.projectMetadata.frameRate || 30);
  const prefix = options.captionFilePrefix || '';

  const videoTrack = project.tracks.find((track) => track.type === 'video');
  const sfxTrack = project.tracks.find((track) => track.type === 'sfx');
  const textTrack = project.tracks.find((track) => track.type === 'text');
  const brollTrack = project.tracks.find((track) => track.id === 'track-broll');
  const videoClips = ((videoTrack?.clips || []) as VideoClip[])
    .filter((clip) => clip.duration > 0)
    .sort((a, b) => a.startOnTimeline - b.startOnTimeline);
  const brollClips = ((!brollTrack?.isMuted ? brollTrack?.clips : []) || []) as VideoClip[];
  const textClips = (!textTrack?.isMuted ? ((textTrack?.clips || []) as TextClip[]) : []).filter(
    (clip) => clip.duration > 0
  );

  const lastClip = videoClips[videoClips.length - 1];
  const declaredDuration = project.projectMetadata.totalDuration;
  const fallbackDuration = lastClip ? lastClip.startOnTimeline + lastClip.duration : 5;
  const totalDuration = Math.max(
    0.1,
    Number((declaredDuration || fallbackDuration || 5).toFixed(3)) || 0.1
  );

  // Collect distinct source files first: an input index must never change because a caption was added.
  const requiredVideoFiles: Array<{ fileName: string; sourceUrl: string; inputIndex: number }> = [];
  const sourceIndex = new Map<string, number>();
  const registerSource = (sourceUrl: string, index: number, fileName: string) => {
    requiredVideoFiles.push({ fileName, sourceUrl, inputIndex: index });
    sourceIndex.set(sourceUrl, index);
  };

  videoClips.forEach((clip) => {
    const url = clip.sourceUrl || inputVideoFileName;
    if (!sourceIndex.has(url)) {
      const index = requiredVideoFiles.length;
      registerSource(url, index, index === 0 ? inputVideoFileName : `input_${index}.mp4`);
    }
  });
  brollClips.forEach((clip) => {
    if (clip.sourceUrl && !sourceIndex.has(clip.sourceUrl)) {
      const index = requiredVideoFiles.length;
      registerSource(clip.sourceUrl, index, `broll_${index}.mp4`);
    }
  });
  if (requiredVideoFiles.length === 0) {
    registerSource(inputVideoFileName, 0, inputVideoFileName);
  }

  const inputArgs: string[] = [];
  requiredVideoFiles.forEach((file) => inputArgs.push('-i', file.fileName));

  const inputIndexMap = new Map<string, number>();
  requiredVideoFiles.forEach((file) => inputIndexMap.set(`video_${file.inputIndex}`, file.inputIndex));
  inputIndexMap.set('primary_video', 0);

  const filterSteps: string[] = [];
  const sourceAudio = options.sourceHasAudio || {};
  const hasAudio = (sourceUrl: string, fileName: string) => sourceAudio[sourceUrl] ?? sourceAudio[fileName] ?? false;

  const audioFormat = 'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo';
  const silence = (duration: number, label: string) =>
    `anullsrc=r=44100:cl=stereo:d=${seconds(duration)},${audioFormat}[${label}]`;

  const fitFrame = (zoom = 1) => {
    const steps = [
      `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase`,
      `crop=${targetWidth}:${targetHeight}`,
      'setsar=1',
    ];
    if (zoom > 1.05) {
      steps.push(
        `crop=w=${even(targetWidth / zoom)}:h=${even(targetHeight / zoom)}:x=(iw-ow)/2:y=(ih-oh)/2`,
        `scale=${targetWidth}:${targetHeight}`
      );
    }
    steps.push(`fps=${fps}`);
    // The second `scale` used by a zoom can reintroduce a non-square SAR (e.g. 3368:3375) because
    // the even-rounded crop ratio no longer exactly matches the target. Concat refuses segments
    // whose SAR differs, so square pixels must be the final word on every path after all scaling.
    steps.push('setsar=1');
    return steps.join(',');
  };

  // 1. Primary video segments, including honest black/silent gaps where the EDL has holes.
  const segments: Segment[] = [];
  let cursor = 0;
  videoClips.forEach((clip, index) => {
    const start = Math.max(0, clip.startOnTimeline);
    const end = Math.min(totalDuration, start + clip.duration);
    if (end <= start) return;
    if (start - cursor > 0.02) {
      const gapDuration = start - cursor;
      const gapIndex = `gap_${index}`;
      filterSteps.push(
        `color=c=black:s=${targetWidth}x${targetHeight}:r=${fps}:d=${seconds(gapDuration)},setsar=1[v_${gapIndex}]`,
        silence(gapDuration, `a_${gapIndex}`)
      );
      segments.push({ video: `[v_${gapIndex}]`, audio: `[a_${gapIndex}]`, duration: gapDuration });
    }

    const duration = end - start;
    const speed = clamp(clip.speedMultiplier || 1, 0.25, 4);
    const sourceStart = Math.max(0, clip.sourceStartOffset);
    const sourceUrl = clip.sourceUrl || inputVideoFileName;
    const inputIndex = sourceIndex.get(sourceUrl) ?? 0;
    const sourceFile = requiredVideoFiles[inputIndex];

    // A keyframe punch used to be flattened into one static zoom, so the whole clip stayed cropped
    // in. Splitting at keyframe offsets makes the punch visible in the MP4 while keeping the same
    // safe crop/scale chain and paired video+audio concat segments.
    const stops = (clip.keyframes || [])
      .map((keyframe) => ({
        offset: clamp(Number(keyframe.timeOffset) || 0, 0, duration),
        scale: clamp(Number(keyframe.scale) || 1, 1, 1.6),
      }))
      .filter((keyframe, keyframeIndex, all) =>
        keyframeIndex === 0 || keyframe.offset - all[keyframeIndex - 1].offset >= 0.08
      )
      .sort((a, b) => a.offset - b.offset);
    if (stops.length && stops[0].offset > 0.05) stops.unshift({ offset: 0, scale: stops[0].scale });
    if (stops.length && stops[stops.length - 1].offset < duration - 0.05) {
      stops.push({ offset: duration, scale: stops[stops.length - 1].scale });
    }
    const intervals = stops.length >= 2
      ? stops.slice(0, -1).map((stop, stopIndex) => ({
          start: stop.offset,
          end: stops[stopIndex + 1].offset,
          zoom: stop.scale,
        }))
      : [{ start: 0, end: duration, zoom: 1 }];

    intervals.forEach((interval, subIndex) => {
      const intervalDuration = interval.end - interval.start;
      if (intervalDuration < 0.06) return;
      const intervalSourceStart = sourceStart + interval.start * speed;
      const intervalSourceSpan = Math.max(0.04, intervalDuration * speed);
      const suffix = intervals.length > 1 ? `_${subIndex}` : '';
      const vLabel = `v_seg_${index}${suffix}`;
      filterSteps.push(
        `[${inputIndex}:v:0]trim=start=${seconds(intervalSourceStart)}:duration=${seconds(intervalSourceSpan)},setpts=PTS-STARTPTS${
          speed !== 1 ? `,setpts=PTS/${speed.toFixed(3)}` : ''
        },${fitFrame(interval.zoom)},trim=duration=${seconds(intervalDuration)},setpts=PTS-STARTPTS[${vLabel}]`
      );

      const aLabel = `a_seg_${index}${suffix}`;
      if (hasAudio(sourceUrl, sourceFile.fileName) && !videoTrack?.isMuted) {
        const volume = (videoTrack?.volume ?? 1) * (clip.audioModifiers?.volume ?? 1);
        const globalFadeIn = Math.min(duration, Math.max(0, clip.audioModifiers?.fadeInSec ?? 0));
        const globalFadeOut = Math.min(duration, Math.max(0, clip.audioModifiers?.fadeOutSec ?? 0));
        const fadeIn = subIndex === 0 ? globalFadeIn : 0;
        const fadeOut = subIndex === intervals.length - 1 ? globalFadeOut : 0;
        const chain = [
          `[${inputIndex}:a:0]atrim=start=${seconds(intervalSourceStart)}:duration=${seconds(intervalSourceSpan)}`,
          'asetpts=PTS-STARTPTS',
          ...atempoFilters(speed),
          ...(Math.abs(volume - 1) > 0.001 ? [`volume=${volume.toFixed(3)}`] : []),
          ...(fadeIn > 0 ? [`afade=t=in:st=0:d=${seconds(fadeIn)}`] : []),
          ...(fadeOut > 0 ? [`afade=t=out:st=${seconds(Math.max(0, intervalDuration - fadeOut))}:d=${seconds(fadeOut)}`] : []),
          `atrim=duration=${seconds(intervalDuration)}`,
          'asetpts=PTS-STARTPTS',
          // The output label belongs to the last filter, not to a separate graph step. A comma here
          // made FFmpeg read "[a_seg_0]" as an empty filter and fail every talking-clip export.
          `${audioFormat}[${aLabel}]`,
        ];
        filterSteps.push(chain.join(','));
      } else {
        filterSteps.push(silence(intervalDuration, aLabel));
      }
      segments.push({ video: `[${vLabel}]`, audio: `[${aLabel}]`, duration: intervalDuration });
    });
    cursor = end;
  });

  if (segments.length === 0 || totalDuration - cursor > 0.02) {
    const duration = segments.length === 0 ? totalDuration : totalDuration - cursor;
    filterSteps.push(
      `color=c=black:s=${targetWidth}x${targetHeight}:r=${fps}:d=${seconds(duration)},setsar=1[v_tail]`,
      silence(duration, 'a_tail')
    );
    segments.push({ video: '[v_tail]', audio: '[a_tail]', duration });
  }

  // 2. Concatenate on the timeline clock. A straight cut is more faithful to the EDL than a
  // crossfade that silently shortens the declared duration.
  let currentVideoOut = segments[0].video;
  let currentAudioOut = segments[0].audio;
  if (segments.length > 1) {
    currentVideoOut = '[v_concat]';
    currentAudioOut = '[a_concat]';
    const concatInputs = segments.map((segment) => `${segment.video}${segment.audio}`).join('');
    filterSteps.push(
      `${concatInputs}concat=n=${segments.length}:v=1:a=1${currentVideoOut}${currentAudioOut}`
    );
  }

  // 3. B-roll overlays are shifted onto their timeline start before the overlay window runs.
  brollClips.forEach((clip, index) => {
    if (!clip.sourceUrl || clip.duration <= 0) return;
    const inputIndex = sourceIndex.get(clip.sourceUrl) ?? 0;
    const start = Math.max(0, clip.startOnTimeline);
    const end = Math.min(totalDuration, start + clip.duration);
    if (end <= start) return;
    const bStart = seconds(start);
    const bEnd = seconds(end);
    const bDuration = seconds(end - start);
    const sourceStart = Math.max(0, clip.sourceStartOffset);
    const bLabel = `v_broll_${index}`;
    const outLabel = `v_broll_out_${index}`;
    filterSteps.push(
      `[${inputIndex}:v:0]trim=start=${seconds(sourceStart)}:duration=${bDuration},setpts=PTS-STARTPTS+${bStart}/TB,${fitFrame()}[${bLabel}]`,
      `${currentVideoOut}[${bLabel}]overlay=enable='between(t,${bStart},${bEnd})':shortest=0[${outLabel}]`
    );
    currentVideoOut = `[${outLabel}]`;
  });

  const captionOverlay = buildCaptionOverlay(textClips, targetWidth, targetHeight, prefix);
  if (captionOverlay.hasCaptions) {
    const captionedLabel = '[v_captioned]';
    filterSteps.push(`${currentVideoOut}${captionOverlay.filter}[v_captioned]`);
    currentVideoOut = captionedLabel;
  }

  const lookFilter = FFMPEG_LOOK_FILTERS[project.projectMetadata.visualLook || 'viral'];
  if (lookFilter) {
    filterSteps.push(`${currentVideoOut}${lookFilter}[v_graded]`);
    currentVideoOut = '[v_graded]';
  }

  filterSteps.push(`${currentVideoOut}format=yuv420p[vout]`);

  // 4. Audio mix. SFX and BGM stay in the export even when the source itself was silent.
  const audioMixInputs: string[] = [currentAudioOut];
  const bgmAssetId = project.globalAudioTracks?.backgroundMusicAssetId;
  let bgmInputIndex: number | null = null;
  const requiredSfxFiles = new Set<string>();
  const sfxClips = (!sfxTrack?.isMuted ? ((sfxTrack?.clips || []) as SFXClip[]) : []).filter(
    (clip) => clip.duration > 0
  );

  // One asset is one FFmpeg input even when it fires several times. Duplicate `-i` entries used to
  // push long timelines toward the input limit while only the last index was ever mixed.
  const sfxFileNames = Array.from(
    new Set(sfxClips.map((clip) => `sfx_${clip.sfxAssetId || 'pop'}.wav`))
  );
  sfxFileNames.forEach((fileName) => requiredSfxFiles.add(fileName));
  if (bgmAssetId) {
    requiredSfxFiles.add(`bgm_${bgmAssetId}.wav`);
    // BGM is appended before the SFX inputs, whatever the set's insertion order was.
    bgmInputIndex = requiredVideoFiles.length;
    inputArgs.push('-i', `bgm_${bgmAssetId}.wav`);
  }
  const sfxInputIndices = new Map<string, number>();
  let nextInputIndex = requiredVideoFiles.length + (bgmInputIndex === null ? 0 : 1);
  sfxFileNames.forEach((fileName) => {
    inputArgs.push('-i', fileName);
    sfxInputIndices.set(fileName, nextInputIndex++);
  });

  if (bgmInputIndex !== null && bgmAssetId) {
    const volume = clamp(project.globalAudioTracks.bgmVolume ?? 0.25, 0.01, 1);
    const ducking = project.globalAudioTracks.duckingEnabled ?? true;
    if (ducking && segments.length > 0) {
      filterSteps.push(
        `${currentAudioOut}asplit=2[a_speech_mix][a_speech_sc]`,
        `[${bgmInputIndex}:a:0]aloop=loop=-1:size=2e+09,atrim=0:${seconds(totalDuration)},volume=${volume.toFixed(3)}[bgm_raw]`,
        `[bgm_raw][a_speech_sc]sidechaincompress=threshold=0.08:ratio=4:attack=60:release=350[bgm_ducked]`
      );
      audioMixInputs[0] = '[a_speech_mix]';
      audioMixInputs.push('[bgm_ducked]');
    } else {
      filterSteps.push(
        `[${bgmInputIndex}:a:0]aloop=loop=-1:size=2e+09,atrim=0:${seconds(totalDuration)},volume=${volume.toFixed(3)}[bgm_plain]`
      );
      audioMixInputs.push('[bgm_plain]');
    }
  }

  sfxClips.forEach((clip, index) => {
    const fileName = `sfx_${clip.sfxAssetId || 'pop'}.wav`;
    const inputIndex = sfxInputIndices.get(fileName);
    if (inputIndex === undefined) return;
    const volume = clip.audioModifiers?.volume ?? 1;
    filterSteps.push(
      `[${inputIndex}:a:0]adelay=${Math.max(0, Math.round(clip.startOnTimeline * 1000))}:all=1,volume=${volume.toFixed(3)},atrim=0:${seconds(clip.duration)},${audioFormat}[sfx_out_${index}]`
    );
    audioMixInputs.push(`[sfx_out_${index}]`);
  });

  if (audioMixInputs.length === 1) {
    filterSteps.push(
      `${currentAudioOut}atrim=0:${seconds(totalDuration)},${audioFormat}[aout]`
    );
  } else {
    filterSteps.push(
      `${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=longest:dropout_transition=0:normalize=0,atrim=0:${seconds(totalDuration)},${audioFormat}[aout]`
    );
  }

  return {
    inputArgs,
    inputIndexMap,
    // A blank step would become an empty filter name (`No such filter: ''`) in FFmpeg.
    filterComplex: filterSteps.filter(Boolean).join(';'),
    outputVideoLabel: '[vout]',
    outputAudioLabel: '[aout]',
    requiredVideoFiles,
    requiredSfxFiles: Array.from(requiredSfxFiles),
    requiredCaptionFiles: captionOverlay.files.map((file) => file.name),
    captionFiles: captionOverlay.files,
    hasCaptions: captionOverlay.hasCaptions,
    totalDuration,
  };
}

/** Long projects are compiled in windows so WebAssembly does not have to hold an entire render at once. */
export function isChunkedProcessingRequired(project: TimelineProject, thresholdSec = 60): boolean {
  return (project.projectMetadata.totalDuration || 0) > thresholdSec;
}

export interface ChunkedFiltergraphPlan {
  isChunked: boolean;
  chunks: Array<{
    chunkIndex: number;
    startTime: number;
    endTime: number;
    filtergraph: CompiledFiltergraph;
    outputFileName: string;
  }>;
  finalConcatFilter?: {
    inputArgs: string[];
    filterComplex: string;
    outputVideoLabel: string;
    outputAudioLabel: string;
  };
}

export function compileChunkedTimelineFiltergraphs(
  project: TimelineProject,
  options: FilterCompilerOptions & { maxChunkDurationSec?: number } = {}
): ChunkedFiltergraphPlan {
  const totalDuration = project.projectMetadata.totalDuration || 0;
  const chunkDuration = options.maxChunkDurationSec || 45;

  if (totalDuration <= 60) {
    return {
      isChunked: false,
      chunks: [
        {
          chunkIndex: 0,
          startTime: 0,
          endTime: totalDuration,
          filtergraph: compileTimelineToFiltergraph(project, options),
          outputFileName: 'chunk_0.mp4',
        },
      ],
    };
  }

  const chunkCount = Math.ceil(totalDuration / chunkDuration);
  const chunks: ChunkedFiltergraphPlan['chunks'] = [];

  for (let index = 0; index < chunkCount; index++) {
    const startTime = index * chunkDuration;
    const endTime = Math.min(totalDuration, (index + 1) * chunkDuration);
    const chunkProject: TimelineProject = {
      ...project,
      projectMetadata: {
        ...project.projectMetadata,
        totalDuration: endTime - startTime,
      },
      tracks: project.tracks.map((track) => ({
        ...track,
        clips: track.clips
          .filter((clip) => clip.startOnTimeline + clip.duration > startTime && clip.startOnTimeline < endTime)
          .map((clip) => {
            const clipStart = Math.max(clip.startOnTimeline, startTime);
            const clipEnd = Math.min(clip.startOnTimeline + clip.duration, endTime);
            const speed = 'speedMultiplier' in clip ? clip.speedMultiplier || 1 : 1;
            return {
              ...clip,
              startOnTimeline: clipStart - startTime,
              duration: Math.max(0.04, clipEnd - clipStart),
              sourceStartOffset:
                (clip.sourceStartOffset || 0) + (clipStart - clip.startOnTimeline) * speed,
            };
          }),
      })),
    };

    chunks.push({
      chunkIndex: index,
      startTime,
      endTime,
      filtergraph: compileTimelineToFiltergraph(chunkProject, {
        ...options,
        captionFilePrefix: `chunk_${index}_`,
      }),
      outputFileName: `chunk_${index}.mp4`,
    });
  }

  const inputArgs: string[] = [];
  const concatInputs: string[] = [];
  chunks.forEach((chunk) => {
    inputArgs.push('-i', chunk.outputFileName);
    concatInputs.push(`[${chunk.chunkIndex}:v:0][${chunk.chunkIndex}:a:0]`);
  });

  return {
    isChunked: true,
    chunks,
    finalConcatFilter: {
      inputArgs,
      filterComplex: `${concatInputs.join('')}concat=n=${chunks.length}:v=1:a=1[vout][aout]`,
      outputVideoLabel: '[vout]',
      outputAudioLabel: '[aout]',
    },
  };
}
