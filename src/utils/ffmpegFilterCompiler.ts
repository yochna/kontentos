/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  TimelineProject,
  VideoClip,
  SFXClip,
  TextClip,
} from '@/lib/timeline';

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
  /** List of source video files required in virtual FS */
  requiredVideoFiles: Array<{ fileName: string; sourceUrl: string; inputIndex: number }>;
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
    .replace(/'/g, '’')
    .replace(/"/g, '”')
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
 */
export function compileTimelineToFiltergraph(
  project: TimelineProject,
  options: FilterCompilerOptions = {}
): CompiledFiltergraph {
  const inputVideoFileName = options.inputVideoFileName || 'input.mp4';
  const targetWidth = Math.trunc((options.width || project.projectMetadata.width || 1080) / 2) * 2;
  const targetHeight = Math.trunc((options.height || project.projectMetadata.height || 1920) / 2) * 2;
  const fps = options.fps || project.projectMetadata.frameRate || 30;

  const videoTrack = project.tracks.find((t) => t.type === 'video');
  const sfxTrack = project.tracks.find((t) => t.type === 'sfx');
  const textTrack = project.tracks.find((t) => t.type === 'text');
  const videoClips = (videoTrack?.clips || []) as VideoClip[];
  const brollTrack = project.tracks.find((t) => t.id === 'track-broll');
  const brollClips = (!brollTrack?.isMuted ? (brollTrack?.clips || []) : []) as VideoClip[];

  // Collect distinct video files from primary video clips and b-roll clips
  const requiredVideoFiles: Array<{ fileName: string; sourceUrl: string; inputIndex: number }> = [];
  const videoUrlToInputIndex = new Map<string, number>();

  videoClips.forEach((c) => {
    const url = c.sourceUrl || options.inputVideoFileName || 'input.mp4';
    if (!videoUrlToInputIndex.has(url)) {
      const idx = requiredVideoFiles.length;
      const fileName = idx === 0 ? (options.inputVideoFileName || 'input.mp4') : `input_${idx}.mp4`;
      requiredVideoFiles.push({ fileName, sourceUrl: url, inputIndex: idx });
      videoUrlToInputIndex.set(url, idx);
    }
  });

  brollClips.forEach((c) => {
    const url = c.sourceUrl;
    if (url && !videoUrlToInputIndex.has(url)) {
      const idx = requiredVideoFiles.length;
      const fileName = `broll_${idx}.mp4`;
      requiredVideoFiles.push({ fileName, sourceUrl: url, inputIndex: idx });
      videoUrlToInputIndex.set(url, idx);
    }
  });

  if (requiredVideoFiles.length === 0) {
    const defaultName = options.inputVideoFileName || 'input.mp4';
    requiredVideoFiles.push({ fileName: defaultName, sourceUrl: defaultName, inputIndex: 0 });
    videoUrlToInputIndex.set(defaultName, 0);
  }

  const inputArgs: string[] = [];
  const inputIndexMap = new Map<string, number>();

  requiredVideoFiles.forEach((v) => {
    inputArgs.push('-i', v.fileName);
    inputIndexMap.set(`video_${v.inputIndex}`, v.inputIndex);
  });
  inputIndexMap.set('primary_video', 0);

  const filterSteps: string[] = [];

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

  // Register SFX inputs in ffmpeg inputArgs (offset after all video inputs)
  const sfxInputIndices = new Map<string, number>();
  let nextInputIdx = requiredVideoFiles.length;
  for (const sfxFileName of requiredSfxFilesSet) {
    inputArgs.push('-i', sfxFileName);
    sfxInputIndices.set(sfxFileName, nextInputIdx);
    nextInputIdx++;
  }

  // Register Background Music (BGM) input if active
  const bgmAssetId = project.globalAudioTracks?.backgroundMusicAssetId;
  let bgmInputIdx: number | null = null;
  if (bgmAssetId) {
    const bgmFileName = `bgm_${bgmAssetId}.wav`;
    requiredSfxFilesSet.add(bgmFileName);
    inputArgs.push('-i', bgmFileName);
    bgmInputIdx = nextInputIdx;
    nextInputIdx++;
  }

  // 1. Process Video Clips with normalized sequential labels
  const videoSegmentLabels: string[] = [];
  const audioSegmentLabels: string[] = [];

  if (videoClips.length === 0) {
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

      let zoomScale = 1.0;
      if (clip.keyframes && clip.keyframes.length > 0) {
        const punchKeyframe = clip.keyframes.find((kf) => kf.scale > 1.05);
        if (punchKeyframe) {
          zoomScale = Math.min(2.0, punchKeyframe.scale);
        }
      }

      const vFilters: string[] = [
        `trim=start=${sourceStart.toFixed(3)}:end=${sourceEnd.toFixed(3)}`,
        `setpts=PTS-STARTPTS`,
      ];

      if (Math.abs(speed - 1.0) > 0.01) {
        vFilters.push(`setpts=PTS/${speed.toFixed(3)}`);
      }

      // Enforce even dimension alignment for H.264 encoder
      if (zoomScale > 1.05) {
        const cropW = Math.trunc((targetWidth / zoomScale) / 2) * 2;
        const cropH = Math.trunc((targetHeight / zoomScale) / 2) * 2;
        vFilters.push(
          `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`,
          `scale=trunc(iw/2)*2:trunc(ih/2)*2`,
          `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black`,
          `crop=${cropW}:${cropH}:(in_w-${cropW})/2:(in_h-${cropH})/2`,
          `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`,
          `scale=trunc(iw/2)*2:trunc(ih/2)*2`
        );
      } else {
        vFilters.push(
          `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`,
          `scale=trunc(iw/2)*2:trunc(ih/2)*2`,
          `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black`
        );
      }

      const clipSource = clip.sourceUrl || requiredVideoFiles[0].sourceUrl;
      const inIdx = videoUrlToInputIndex.get(clipSource) ?? 0;

      vFilters.push(`fps=${fps}`);
      filterSteps.push(`[${inIdx}:v]${vFilters.join(',')}${vLabel}`);
      videoSegmentLabels.push(vLabel);

      const aFilters: string[] = [
        `atrim=start=${sourceStart.toFixed(3)}:end=${sourceEnd.toFixed(3)}`,
        `asetpts=PTS-STARTPTS`,
      ];

      if (Math.abs(speed - 1.0) > 0.01) {
        if (speed >= 0.5 && speed <= 2.0) {
          aFilters.push(`atempo=${speed.toFixed(3)}`);
        } else if (speed > 2.0) {
          aFilters.push(`atempo=2.0,atempo=${(speed / 2.0).toFixed(3)}`);
        } else if (speed < 0.5) {
          aFilters.push(`atempo=0.5,atempo=${(speed / 0.5).toFixed(3)}`);
        }
      }

      if (videoTrack?.isMuted) {
        aFilters.push('volume=0.0');
      } else if (clip.audioModifiers) {
        const vol = clip.audioModifiers.volume ?? 1.0;
        if (Math.abs(vol - 1.0) > 0.01) {
          aFilters.push(`volume=${vol.toFixed(2)}`);
        }
      }

      filterSteps.push(`[${inIdx}:a]${aFilters.join(',')}${aLabel}`);
      audioSegmentLabels.push(aLabel);
    });
  }

  // 2. Concatenate Video & Audio Segments (Standard Concat or xfade Visual Transitions)
  let currentVideoOut = '[v_concat]';
  let currentAudioOut = '[a_concat]';

  const hasAnyTransition = videoClips.some(
    (c, idx) => idx > 0 && c.transition?.type && c.transition.type !== 'none'
  );

  if (videoSegmentLabels.length === 1) {
    currentVideoOut = videoSegmentLabels[0];
    currentAudioOut = audioSegmentLabels[0];
  } else if (!hasAnyTransition) {
    // Ultra-fast standard concatenation when no transitions are specified
    const concatInputs = videoSegmentLabels
      .map((v, i) => `${v}${audioSegmentLabels[i]}`)
      .join('');
    filterSteps.push(
      `${concatInputs}concat=n=${videoSegmentLabels.length}:v=1:a=1${currentVideoOut}${currentAudioOut}`
    );
  } else {
    // Dynamic xfade transition chain
    let prevV = videoSegmentLabels[0];
    let prevA = audioSegmentLabels[0];
    let accumulatedDuration = Math.max(0.1, videoClips[0].duration);

    for (let i = 1; i < videoClips.length; i++) {
      const clip = videoClips[i];
      const trans = clip.transition;
      const isTransActive = trans && trans.type && trans.type !== 'none';
      const transType = isTransActive
        ? trans.type === 'flash'
          ? 'fadewhite'
          : trans.type
        : 'fade';

      const transDur = isTransActive
        ? Math.min(
            Math.min(clip.duration * 0.45, videoClips[i - 1].duration * 0.45),
            Math.max(0.1, trans.durationSec || 0.3)
          )
        : 0.005;

      const offset = Math.max(0, accumulatedDuration - transDur);
      const outV = i === videoClips.length - 1 ? '[v_concat]' : `[v_xfade_${i}]`;
      const outA = i === videoClips.length - 1 ? '[a_concat]' : `[a_xfade_${i}]`;

      filterSteps.push(
        `${prevV}${videoSegmentLabels[i]}xfade=transition=${transType}:duration=${transDur.toFixed(
          3
        )}:offset=${offset.toFixed(3)}${outV}`
      );
      filterSteps.push(
        `${prevA}${audioSegmentLabels[i]}acrossfade=d=${transDur.toFixed(3)}${outA}`
      );

      accumulatedDuration = offset + clip.duration;
      prevV = outV;
      prevA = outA;
    }

    currentVideoOut = '[v_concat]';
    currentAudioOut = '[a_concat]';
  }

  // 2b. Overlay B-Roll Clips on top of concatenated video
  if (brollClips.length > 0) {
    brollClips.forEach((bClip, bIdx) => {
      const bSource = bClip.sourceUrl;
      if (!bSource) return;
      const bInIdx = videoUrlToInputIndex.get(bSource) ?? 0;
      const bStart = Math.max(0, bClip.startOnTimeline).toFixed(3);
      const bEnd = Math.max(0, bClip.startOnTimeline + bClip.duration).toFixed(3);
      const bOffset = Math.max(0, bClip.sourceStartOffset || 0).toFixed(3);
      const bDur = Math.max(0.1, bClip.duration).toFixed(3);

      const bPrepLabel = `[v_broll_prep_${bIdx}]`;
      const bOutLabel = `[v_broll_out_${bIdx}]`;

      filterSteps.push(
        `[${bInIdx}:v]trim=start=${bOffset}:duration=${bDur},setpts=PTS-STARTPTS,scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=${fps}${bPrepLabel}`
      );
      filterSteps.push(
        `${currentVideoOut}${bPrepLabel}overlay=enable='between(t,${bStart},${bEnd})':shortest=0${bOutLabel}`
      );
      currentVideoOut = bOutLabel;
    });
  }

  // 3. Burn-in Kinetic Captions Overlay
  const textClips = (textTrack?.clips || []) as TextClip[];
  if (textTrack && !textTrack.isMuted && textClips.length > 0) {
    let prevVideoStage = currentVideoOut;

    textClips.forEach((tClip, idx) => {
      const textStageOut = `[v_text_${idx}]`;
      const cleanText = escapeFFmpegText(tClip.content || '');
      const startSec = Math.max(0, tClip.startOnTimeline).toFixed(3);
      const endSec = Math.max(0, tClip.startOnTimeline + tClip.duration).toFixed(3);
      const isWidescreen = targetWidth > targetHeight;
      const minDim = Math.min(targetWidth, targetHeight);
      const fontScale = minDim / 1080;
      let fontSize = Math.round(Math.max(18, Math.min(96, (tClip.style?.fontSize || 56) * fontScale)));

      // If text line is long, gently reduce font size to prevent line clipping
      if (cleanText.length > 28) {
        fontSize = Math.round(fontSize * 0.85);
      }

      let yExpr = '(h-text_h)/2';
      if (tClip.style?.position === 'top') {
        yExpr = isWidescreen ? 'h*0.14' : 'h*0.18';
      } else if (tClip.style?.position === 'bottom') {
        yExpr = isWidescreen ? 'h*0.84' : 'h*0.78';
      } else if (tClip.style?.position === 'middle') {
        yExpr = '(h-text_h)/2';
      }

      const fontColor = normalizeHexColor(tClip.style?.colorHex || '#FFFF00');
      const borderw = Math.max(0, tClip.style?.strokeWidth ?? 4);
      const borderColor = normalizeHexColor(tClip.style?.strokeColorHex || '#000000');
      const hasPill = !!tClip.style?.bannerPillColorHex || tClip.style?.animation === 'bannerPill';

      const drawTextParams: string[] = [
        `drawtext=fontfile='font.ttf'`,
        `fontsize=${fontSize}`,
        `text='${cleanText}'`,
        `fontcolor=${fontColor}`,
        `borderw=${borderw}`,
        `bordercolor=${borderColor}`,
        `shadowx=2`,
        `shadowy=2`,
        `shadowcolor=black@0.8`,
        `x=(w-text_w)/2`,
        `y=${yExpr}`,
        `enable='between(t\\,${startSec}\\,${endSec})'`,
      ];

      if (hasPill) {
        drawTextParams.push('box=1', 'boxcolor=black@0.65', 'boxborderw=12');
      }

      const drawTextFilter = drawTextParams.join(':');

      filterSteps.push(`${prevVideoStage}${drawTextFilter}${textStageOut}`);
      prevVideoStage = textStageOut;
    });

    currentVideoOut = prevVideoStage;
  }

  filterSteps.push(`${currentVideoOut}format=yuv420p[vout]`);

  // 4. Audio Mixing with Delayed SFX Overlays & Ducked Background Music
  const audioMixInputs: string[] = [currentAudioOut];
  const totalDuration = Math.max(0.1, Number((project.projectMetadata.totalDuration || 1).toFixed(3)));

  // If BGM is enabled, loop and dynamically duck under speech audio
  if (bgmInputIdx !== null && bgmAssetId) {
    const bgmVol = Math.max(0.01, Math.min(1.0, project.globalAudioTracks.bgmVolume || 0.25));
    const isDucking = project.globalAudioTracks.duckingEnabled ?? true;

    if (isDucking && videoClips.length > 0 && !videoTrack?.isMuted) {
      filterSteps.push(
        `${currentAudioOut}asplit=2[a_speech_mix][a_speech_sc]`,
        `[${bgmInputIdx}:a]aloop=loop=-1:size=2e+09,atrim=0:${totalDuration.toFixed(3)},volume=${bgmVol.toFixed(2)}[bgm_raw]`,
        `[bgm_raw][a_speech_sc]sidechaincompress=threshold=0.08:ratio=4:attack=60:release=350[bgm_ducked]`
      );
      audioMixInputs[0] = '[a_speech_mix]';
      audioMixInputs.push('[bgm_ducked]');
    } else {
      filterSteps.push(
        `[${bgmInputIdx}:a]aloop=loop=-1:size=2e+09,atrim=0:${totalDuration.toFixed(3)},volume=${bgmVol.toFixed(2)}[bgm_unducked]`
      );
      audioMixInputs.push('[bgm_unducked]');
    }
  }

  if (sfxClips.length > 0) {
    sfxClips.forEach((sfx, idx) => {
      const fileName = `sfx_${sfx.sfxAssetId || 'pop'}.wav`;
      const inIdx = sfxInputIndices.get(fileName);
      if (inIdx !== undefined) {
        const sfxLabel = `[sfx_delayed_${idx}]`;
        const delayMs = Math.max(0, Math.round(sfx.startOnTimeline * 1000));
        const vol = sfx.audioModifiers?.volume ?? 1.0;

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
    // normalize=0 prevents FFmpeg amix from dividing volume by number of inputs (1/N), keeping dialogue at 100% full clarity
    filterSteps.push(
      `${inputsStr}amix=inputs=${audioMixInputs.length}:duration=longest:dropout_transition=0:normalize=0,atrim=0:${totalDuration.toFixed(3)},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aout]`
    );
  }

  const filterComplex = filterSteps.join(';');

  return {
    inputArgs,
    inputIndexMap,
    filterComplex,
    outputVideoLabel: '[vout]',
    outputAudioLabel: '[aout]',
    requiredVideoFiles,
    requiredSfxFiles: Array.from(requiredSfxFilesSet),
    totalDuration: project.projectMetadata.totalDuration || 1,
  };
}

/**
 * Checks whether a TimelineProject is longer than threshold (default 60s)
 * requiring chunked segment export to conserve WebAssembly RAM.
 */
export function isChunkedProcessingRequired(project: TimelineProject, thresholdSec = 60): boolean {
  const dur = project.projectMetadata.totalDuration || 0;
  return dur > thresholdSec;
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

/**
 * Compiles a long project into sequential intermediate segments (< 45s each)
 * before a final concat pass to prevent WebAssembly RAM exhaustion.
 */
export function compileChunkedTimelineFiltergraphs(
  project: TimelineProject,
  options: FilterCompilerOptions & { maxChunkDurationSec?: number } = {}
): ChunkedFiltergraphPlan {
  const totalDur = project.projectMetadata.totalDuration || 0;
  const chunkDur = options.maxChunkDurationSec || 45;

  if (totalDur <= 60) {
    const single = compileTimelineToFiltergraph(project, options);
    return {
      isChunked: false,
      chunks: [
        {
          chunkIndex: 0,
          startTime: 0,
          endTime: totalDur,
          filtergraph: single,
          outputFileName: 'chunk_0.mp4',
        },
      ],
    };
  }

  const numChunks = Math.ceil(totalDur / chunkDur);
  const chunks: ChunkedFiltergraphPlan['chunks'] = [];

  for (let c = 0; c < numChunks; c++) {
    const startTime = c * chunkDur;
    const endTime = Math.min(totalDur, (c + 1) * chunkDur);

    // Create a sub-project scoped to this chunk window
    const chunkProject: TimelineProject = {
      ...project,
      projectMetadata: {
        ...project.projectMetadata,
        totalDuration: endTime - startTime,
      },
      tracks: project.tracks.map((tr) => ({
        ...tr,
        clips: tr.clips
          .filter((clip) => clip.startOnTimeline + clip.duration > startTime && clip.startOnTimeline < endTime)
          .map((clip) => {
            const clipStart = Math.max(0, clip.startOnTimeline - startTime);
            const clipDur = Math.min(clip.duration, endTime - (clip.startOnTimeline));
            return {
              ...clip,
              startOnTimeline: clipStart,
              duration: clipDur,
            };
          }),
      })),
    };

    const fg = compileTimelineToFiltergraph(chunkProject, options);
    chunks.push({
      chunkIndex: c,
      startTime,
      endTime,
      filtergraph: fg,
      outputFileName: `chunk_${c}.mp4`,
    });
  }

  // Final concatenation plan for the intermediate chunk outputs
  const chunkInputArgs: string[] = [];
  const chunkVideoInputs: string[] = [];
  const chunkAudioInputs: string[] = [];

  chunks.forEach((chunk) => {
    chunkInputArgs.push('-i', chunk.outputFileName);
    chunkVideoInputs.push(`[${chunk.chunkIndex}:v]`);
    chunkAudioInputs.push(`[${chunk.chunkIndex}:a]`);
  });

  const concatInputs = chunkVideoInputs
    .map((v, i) => `${v}${chunkAudioInputs[i]}`)
    .join('');
  const finalFilterComplex = `${concatInputs}concat=n=${chunks.length}:v=1:a=1[vout][aout]`;

  return {
    isChunked: true,
    chunks,
    finalConcatFilter: {
      inputArgs: chunkInputArgs,
      filterComplex: finalFilterComplex,
      outputVideoLabel: '[vout]',
      outputAudioLabel: '[aout]',
    },
  };
}
