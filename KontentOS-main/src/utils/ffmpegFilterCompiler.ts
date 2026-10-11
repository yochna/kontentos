/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TimelineProject,
  TimelineTrack,
  VideoClip,
  SFXClip,
  TextClip,
  AudioClip,
} from '../types/timeline';

export interface CompiledFiltergraph {
  /** Array of input file arguments needed by FFmpeg (e.g. ['-i', 'input.mp4', '-i', 'sfx_vine_boom.wav', ...]) */
  inputArgs: string[];
  /** Mapping of asset ID or input name to input index in FFmpeg command */
  inputIndexMap: Map<string, number>;
  /** The generated -filter_complex string */
  filterComplex: string;
  /** The final video output map label (e.g. '[vout]') */
  outputVideoLabel: string;
  /** The final audio output map label (e.g. '[aout]') */
  outputAudioLabel: string;
  /** List of SFX files required in virtual FS */
  requiredSfxFiles: string[];
  /** Total computed target video duration */
  totalDuration: number;
}

export interface FilterCompilerOptions {
  inputVideoFileName?: string;
  width?: number;
  height?: number;
  fps?: number;
}

/**
 * Escapes characters for FFmpeg filter text parameters
 */
function escapeFFmpegText(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/**
 * Maps standard hex colors to FFmpeg color syntax
 */
function normalizeHexColor(hex: string): string {
  if (!hex) return '0xFFFFFF';
  const clean = hex.replace('#', '');
  if (clean.length === 6) return `0x${clean}`;
  if (clean.length === 8) return `0x${clean}`;
  return '0xFFFFFF';
}

/**
 * Compiles a full multi-track TimelineProject into an FFmpeg -filter_complex graph.
 *
 * Handles:
 * 1. Video trims, PTS retiming based on speed multipliers:
 *    `[0:v]trim=start=X:end=Y,setpts=PTS-STARTPTS,setpts=PTS/SPEED,scale=...[v_clip]`
 * 2. Keyframed punch-in zooms via zoompan or crop filters
 * 3. Audio trimming and speed adjustment:
 *    `[0:a]atrim=start=X:end=Y,asetpts=PTS-STARTPTS,atempo=SPEED[a_clip]`
 * 4. Dynamic audio overlay mixing with adelay for SFX assets at exact millisecond timeline positions:
 *    `[sfx_in]adelay=DELAY_MS|DELAY_MS,volume=VOL[sfx_delayed]`
 *    `[voice_mixed][sfx0]...amix=inputs=N:duration=longest:dropout_transition=0[aout]`
 * 5. Kinetic captions text overlay burn-in with drawtext (with fallback overlay chain).
 */
export function compileTimelineToFiltergraph(
  project: TimelineProject,
  options: FilterCompilerOptions = {}
): CompiledFiltergraph {
  const inputVideoFileName = options.inputVideoFileName || 'input.mp4';
  const targetWidth = options.width || project.projectMetadata.width || 1080;
  const targetHeight = options.height || project.projectMetadata.height || 1920;
  const fps = options.fps || project.projectMetadata.frameRate || 30;

  const inputArgs: string[] = ['-i', inputVideoFileName];
  const inputIndexMap = new Map<string, number>();
  inputIndexMap.set('primary_video', 0);

  const filterSteps: string[] = [];

  const videoTrack = project.tracks.find((t) => t.type === 'video');
  const sfxTrack = project.tracks.find((t) => t.type === 'sfx');
  const textTrack = project.tracks.find((t) => t.type === 'text');

  // Collect SFX assets needed
  const requiredSfxFilesSet = new Set<string>();
  const sfxClips: SFXClip[] = [];
  if (sfxTrack && !sfxTrack.isMuted) {
    sfxTrack.clips.forEach((c) => {
      const sfx = c as SFXClip;
      const assetId = sfx.sfxAssetId || 'pop';
      const fileName = `sfx_${assetId}.wav`;
      requiredSfxFilesSet.add(fileName);
      sfxClips.push(sfx);
    });
  }

  // Register SFX inputs in ffmpeg inputArgs
  const sfxInputIndices = new Map<string, number>();
  let nextInputIdx = 1;
  for (const sfxFileName of requiredSfxFilesSet) {
    inputArgs.push('-i', sfxFileName);
    sfxInputIndices.set(sfxFileName, nextInputIdx);
    nextInputIdx++;
  }

  // -------------------------------------------------------------
  // 1. Process Video Clips (Trims, Speeds, Punch-Zooms)
  // -------------------------------------------------------------
  const videoClips = (videoTrack?.clips || []) as VideoClip[];
  const videoSegmentLabels: string[] = [];
  const audioSegmentLabels: string[] = [];

  if (videoClips.length === 0) {
    // Fallback black frame generator if no video clips
    const totalDur = Math.max(1, project.projectMetadata.totalDuration || 5);
    filterSteps.push(
      `color=c=black:s=${targetWidth}x${targetHeight}:r=${fps}:d=${totalDur}[v_fallback]`,
      `anullsrc=r=44100:cl=stereo:d=${totalDur}[a_fallback]`
    );
    videoSegmentLabels.push('[v_fallback]');
    audioSegmentLabels.push('[a_fallback]');
  } else {
    videoClips.forEach((clip, index) => {
      const vLabel = `[v_seg_${index}]`;
      const aLabel = `[a_seg_${index}]`;
      const speed = Math.max(0.25, Math.min(4.0, clip.speedMultiplier || 1.0));
      const sourceStart = Math.max(0, clip.sourceStartOffset);
      const originalSourceDuration = clip.duration * speed;
      const sourceEnd = sourceStart + originalSourceDuration;

      // Determine punch-in zoom scale from keyframes if present
      let zoomScale = 1.0;
      if (clip.keyframes && clip.keyframes.length > 0) {
        const punchKeyframe = clip.keyframes.find((kf) => kf.scale > 1.05);
        if (punchKeyframe) {
          zoomScale = Math.min(2.0, punchKeyframe.scale);
        }
      }

      // Build video filter for this clip segment
      const vFilters: string[] = [
        `trim=start=${sourceStart.toFixed(3)}:end=${sourceEnd.toFixed(3)}`,
        `setpts=PTS-STARTPTS`,
      ];

      if (Math.abs(speed - 1.0) > 0.01) {
        vFilters.push(`setpts=PTS/${speed.toFixed(3)}`);
      }

      // Zoom punch-in / Crop & Scale filter
      if (zoomScale > 1.05) {
        // Calculate crop dimensions for centered punch-in zoom (force even numbers for x264/yuv420p)
        const cropW = Math.floor((targetWidth / zoomScale) / 2) * 2;
        const cropH = Math.floor((targetHeight / zoomScale) / 2) * 2;
        vFilters.push(
          `scale=${targetWidth}x${targetHeight}:force_original_aspect_ratio=increase`,
          `crop=${targetWidth}:${targetHeight}`,
          `crop=${cropW}:${cropH}:(in_w-${cropW})/2:(in_h-${cropH})/2`,
          `scale=${targetWidth}x${targetHeight}`
        );
      } else {
        vFilters.push(
          `scale=${targetWidth}x${targetHeight}:force_original_aspect_ratio=increase`,
          `crop=${targetWidth}:${targetHeight}`
        );
      }

      // Ensure constant frame rate
      vFilters.push(`fps=${fps}`);

      filterSteps.push(`[0:v]${vFilters.join(',')}${vLabel}`);
      videoSegmentLabels.push(vLabel);

      // Build audio filter for this clip segment
      const aFilters: string[] = [
        `atrim=start=${sourceStart.toFixed(3)}:end=${sourceEnd.toFixed(3)}`,
        `asetpts=PTS-STARTPTS`,
      ];

      // Handle atempo (supported range 0.5 to 2.0; chain if outside)
      if (Math.abs(speed - 1.0) > 0.01) {
        if (speed >= 0.5 && speed <= 2.0) {
          aFilters.push(`atempo=${speed.toFixed(3)}`);
        } else if (speed > 2.0) {
          aFilters.push(`atempo=2.0,atempo=${(speed / 2.0).toFixed(3)}`);
        } else if (speed < 0.5) {
          aFilters.push(`atempo=0.5,atempo=${(speed / 0.5).toFixed(3)}`);
        }
      }

      // Audio volume and modifiers
      if (clip.audioModifiers) {
        const vol = clip.audioModifiers.volume ?? 1.0;
        if (Math.abs(vol - 1.0) > 0.01) {
          aFilters.push(`volume=${vol.toFixed(2)}`);
        }
      }

      filterSteps.push(`[0:a]${aFilters.join(',')}${aLabel}`);
      audioSegmentLabels.push(aLabel);
    });
  }

  // -------------------------------------------------------------
  // 2. Concatenate Video & Audio Segments
  // -------------------------------------------------------------
  let currentVideoOut = '[v_concat]';
  let currentAudioOut = '[a_concat]';

  if (videoSegmentLabels.length === 1) {
    currentVideoOut = videoSegmentLabels[0];
    currentAudioOut = audioSegmentLabels[0];
  } else {
    const concatInputs = videoSegmentLabels
      .map((v, i) => `${v}${audioSegmentLabels[i]}`)
      .join('');
    filterSteps.push(
      `${concatInputs}concat=n=${videoSegmentLabels.length}:v=1:a=1${currentVideoOut}${currentAudioOut}`
    );
  }

  // -------------------------------------------------------------
  // 3. Burn-in Kinetic Captions Overlay (Text Track)
  // -------------------------------------------------------------
  const textClips = (textTrack?.clips || []) as TextClip[];
  if (textTrack && !textTrack.isMuted && textClips.length > 0) {
    let prevVideoStage = currentVideoOut;

    textClips.forEach((tClip, idx) => {
      const textStageOut = `[v_text_${idx}]`;
      const cleanText = escapeFFmpegText(tClip.content || '');
      const startSec = Math.max(0, tClip.startOnTimeline).toFixed(3);
      const endSec = Math.max(0, tClip.startOnTimeline + tClip.duration).toFixed(3);
      const fontColor = normalizeHexColor(tClip.style?.colorHex || '#FFFF00');
      const fontSize = Math.max(24, Math.min(96, tClip.style?.fontSize || 56));

      // Calculate Y position based on placement
      let yExpr = '(h-text_h)/2';
      if (tClip.style?.position === 'top') {
        yExpr = 'h*0.18';
      } else if (tClip.style?.position === 'bottom') {
        yExpr = 'h*0.78';
      } else if (tClip.style?.position === 'middle') {
        yExpr = 'h*0.50';
      }

      // Drawtext filter with heavy border/shadow for viral clarity
      const drawTextFilter = [
        `drawtext=text='${cleanText}'`,
        `fontsize=${fontSize}`,
        `fontcolor=${fontColor}`,
        `borderw=4`,
        `bordercolor=black`,
        `shadowx=2`,
        `shadowy=2`,
        `shadowcolor=black@0.8`,
        `x=(w-text_w)/2`,
        `y=${yExpr}`,
        `enable='between(t\\,${startSec}\\,${endSec})'`,
      ].join(':');

      filterSteps.push(`${prevVideoStage}${drawTextFilter}${textStageOut}`);
      prevVideoStage = textStageOut;
    });

    currentVideoOut = prevVideoStage;
  }

  // Final Video Output formatting
  filterSteps.push(`${currentVideoOut}format=yuv420p[vout]`);

  // -------------------------------------------------------------
  // 4. Audio Mixing with Delayed SFX Overlays & Exact Duration Sync
  // -------------------------------------------------------------
  const audioMixInputs: string[] = [currentAudioOut];
  const totalDuration = Math.max(0.1, Number((project.projectMetadata.totalDuration || 1).toFixed(3)));

  if (sfxClips.length > 0) {
    sfxClips.forEach((sfx, idx) => {
      const fileName = `sfx_${sfx.sfxAssetId || 'pop'}.wav`;
      const inIdx = sfxInputIndices.get(fileName);
      if (inIdx !== undefined) {
        const sfxLabel = `[sfx_delayed_${idx}]`;
        const delayMs = Math.max(0, Math.round(sfx.startOnTimeline * 1000));
        const vol = sfx.audioModifiers?.volume ?? 1.0;

        // Apply delay and volume multiplier with channel compatibility
        filterSteps.push(
          `[${inIdx}:a]adelay=${delayMs}:all=1,volume=${vol.toFixed(2)}${sfxLabel}`
        );
        audioMixInputs.push(sfxLabel);
      }
    });
  }

  if (audioMixInputs.length === 1) {
    filterSteps.push(
      `${currentAudioOut}atrim=0:${totalDuration.toFixed(3)},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aout]`
    );
  } else {
    const inputsStr = audioMixInputs.join('');
    filterSteps.push(
      `${inputsStr}amix=inputs=${audioMixInputs.length}:duration=longest:dropout_transition=0,atrim=0:${totalDuration.toFixed(3)},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aout]`
    );
  }

  const filterComplex = filterSteps.join(';\n');

  return {
    inputArgs,
    inputIndexMap,
    filterComplex,
    outputVideoLabel: '[vout]',
    outputAudioLabel: '[aout]',
    requiredSfxFiles: Array.from(requiredSfxFilesSet),
    totalDuration: project.projectMetadata.totalDuration || 1,
  };
}
