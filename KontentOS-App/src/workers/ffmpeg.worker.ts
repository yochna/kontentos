/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { compileTimelineToFiltergraph } from '../utils/ffmpegFilterCompiler';
import { generateSyntheticSfxWav, generateSyntheticBgmWav } from '../utils/sfxBufferGenerator';
import type { TimelineProject } from '../lib/timeline';

let ffmpeg: FFmpeg | null = null;
let isInitializing = false;
const logCollectors = new Set<(message: string) => void>();

const LOCAL_CORE_BASE = '/ffmpeg';
const UNPKG_CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
const UNPKG_CORE_MT_BASE = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm';

async function initFFmpeg(): Promise<void> {
  if (ffmpeg && ffmpeg.loaded) {
    return;
  }
  if (isInitializing) {
    while (isInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return;
  }

  isInitializing = true;

  try {
    const instance = new FFmpeg();

    instance.on('progress', ({ progress, time }) => {
      self.postMessage({
        type: 'PROGRESS',
        progress: Math.min(1, Math.max(0, progress)),
        time,
      });
    });

    instance.on('log', ({ message }) => {
      // Probe calls need the same log stream the UI sees, without a second FFmpeg instance.
      for (const collect of logCollectors) collect(message);
      self.postMessage({
        type: 'LOG',
        message,
      });
    });

    // 1. First priority: Load locally hosted WebAssembly binaries from /ffmpeg (zero CORS/network issues)
    let loaded = false;
    try {
      const coreURL = await toBlobURL(`${LOCAL_CORE_BASE}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${LOCAL_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm');
      await instance.load({ coreURL, wasmURL });
      loaded = true;
    } catch (localErr) {
      console.warn('[FFmpeg Worker] Local /ffmpeg core load failed, falling back to CDN:', localErr);
    }

    // 2. Second priority: Multi-threaded or single-threaded unpkg fallback
    if (!loaded) {
      const isMultiThreadCapable = typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated;
      if (isMultiThreadCapable) {
        try {
          const coreURL = await toBlobURL(`${UNPKG_CORE_MT_BASE}/ffmpeg-core.js`, 'text/javascript');
          const wasmURL = await toBlobURL(`${UNPKG_CORE_MT_BASE}/ffmpeg-core.wasm`, 'application/wasm');
          const workerURL = await toBlobURL(`${UNPKG_CORE_MT_BASE}/ffmpeg-core.worker.js`, 'text/javascript');
          await instance.load({ coreURL, wasmURL, workerURL });
          loaded = true;
        } catch {}
      }

      if (!loaded) {
        const coreURL = await toBlobURL(`${UNPKG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript');
        const wasmURL = await toBlobURL(`${UNPKG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm');
        await instance.load({ coreURL, wasmURL });
      }
    }

    ffmpeg = instance;
    isInitializing = false;
    self.postMessage({ type: 'INIT_SUCCESS' });
  } catch (error: any) {
    isInitializing = false;
    self.postMessage({
      type: 'INIT_ERROR',
      error: error?.message || 'Failed to initialize FFmpeg WebAssembly core',
    });
    throw error;
  }
}

async function extractAudio(id: string, inputBuffer: ArrayBuffer, fileName = 'input.mp4'): Promise<void> {
  try {
    if (!ffmpeg || !ffmpeg.loaded) {
      await initFFmpeg();
    }

    if (!ffmpeg) {
      throw new Error('FFmpeg instance is unavailable');
    }

    const inputName = `input_${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const outputName = `output_${Date.now()}.wav`;

    await ffmpeg.writeFile(inputName, new Uint8Array(inputBuffer));

    self.postMessage({
      type: 'EXTRACT_PROGRESS',
      id,
      stage: 'processing',
      progress: 0.1,
    });

    const exitCode = await ffmpeg.exec([
      '-i',
      inputName,
      '-vn',
      '-ar',
      '16000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      outputName,
    ]);

    if (exitCode !== 0) {
      throw new Error(`FFmpeg execution failed with exit code ${exitCode}. Check media codec support.`);
    }

    const wavData = await ffmpeg.readFile(outputName);
    let outputBuffer: ArrayBuffer;

    if (typeof wavData === 'string') {
      const encoder = new TextEncoder();
      outputBuffer = encoder.encode(wavData).buffer;
    } else if (wavData instanceof Uint8Array) {
      outputBuffer = wavData.buffer.slice(wavData.byteOffset, wavData.byteOffset + wavData.byteLength);
    } else {
      outputBuffer = (wavData as any).buffer || wavData;
    }

    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch {
      // Ignored non-fatal cleanup
    }

    (self as any).postMessage(
      {
        type: 'EXTRACT_AUDIO_SUCCESS',
        id,
        buffer: outputBuffer,
        byteLength: outputBuffer.byteLength,
      },
      [outputBuffer]
    );
  } catch (error: any) {
    self.postMessage({
      type: 'EXTRACT_AUDIO_ERROR',
      id,
      error: error?.message || 'Error occurred during audio demuxing',
    });
  }
}

async function exportMP4(
  id: string,
  videoBuffers: Array<{ fileName: string; buffer: ArrayBuffer }>,
  inputArgs: string[],
  filterComplex: string,
  outputVideoLabel: string,
  outputAudioLabel: string,
  requiredSfxFiles: string[] = []
): Promise<void> {
  try {
    if (!ffmpeg || !ffmpeg.loaded) {
      await initFFmpeg();
    }

    if (!ffmpeg) {
      throw new Error('FFmpeg instance is unavailable');
    }

    self.postMessage({
      type: 'EXPORT_PROGRESS',
      id,
      stage: 'preparing_assets',
      progress: 0.05,
      message: 'Pre-loading video and audio sound effect assets into virtual filesystem...',
    });

    for (const vItem of videoBuffers) {
      await ffmpeg.writeFile(vItem.fileName, new Uint8Array(vItem.buffer));
    }

    // Pre-load subtitle font into virtual filesystem
    let fontWritten = false;
    try {
      const fontRes = await fetch('/fonts/font.ttf');
      if (fontRes.ok) {
        const fontBuf = await fontRes.arrayBuffer();
        await ffmpeg.writeFile('font.ttf', new Uint8Array(fontBuf));
        fontWritten = true;
      }
    } catch (fontErr) {
      console.warn('[FFmpeg Worker] Could not load /fonts/font.ttf into virtual FS:', fontErr);
    }

    const writtenSfxFiles: string[] = [];
    for (const audioFileName of requiredSfxFiles) {
      if (audioFileName.startsWith('bgm_')) {
        const bgmId = audioFileName.replace(/^bgm_/, '').replace(/\.wav$/, '');
        const bgmBuffer = generateSyntheticBgmWav(bgmId, 60);
        await ffmpeg.writeFile(audioFileName, bgmBuffer);
        writtenSfxFiles.push(audioFileName);
      } else {
        const sfxId = audioFileName.replace(/^sfx_/, '').replace(/\.wav$/, '');
        const sfxBuffer = generateSyntheticSfxWav(sfxId);
        await ffmpeg.writeFile(audioFileName, sfxBuffer);
        writtenSfxFiles.push(audioFileName);
      }
    }

    self.postMessage({
      type: 'EXPORT_PROGRESS',
      id,
      stage: 'encoding',
      progress: 0.15,
      message: 'Compiling filtergraph and encoding H.264 video with AAC audio...',
    });

    const outputFileName = `export_${Date.now()}.mp4`;

    const execArgs: string[] = [
      ...inputArgs,
      '-filter_complex',
      filterComplex,
      '-map',
      outputVideoLabel,
      '-map',
      outputAudioLabel,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-threads',
      '1',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '20',
      '-c:a',
      'aac',
      '-b:a',
      '256k',
      '-shortest',
      '-movflags',
      '+faststart',
      '-y',
      outputFileName,
    ];

    console.log('[FFmpeg Worker] Executing export command args:', execArgs);
    console.log('[FFmpeg Worker] Filter complex:\n', filterComplex);

    // Wrap exec with a timeout to prevent infinite hangs in WASM
    const execPromise = ffmpeg.exec(execArgs);
    const timeoutPromise = new Promise<number>((_, reject) =>
      setTimeout(() => reject(new Error('FFmpeg render timed out after 120 seconds. The video may be too long or complex for browser-based rendering.')), 120_000)
    );
    const exitCode = await Promise.race([execPromise, timeoutPromise]);

    if (exitCode !== 0) {
      throw new Error(`FFmpeg export execution failed with exit code ${exitCode}. Please check filter configuration and media streams.`);
    }

    self.postMessage({
      type: 'EXPORT_PROGRESS',
      id,
      stage: 'finalizing',
      progress: 0.95,
      message: 'Extracting MP4 binary from virtual filesystem...',
    });

    const outputData = await ffmpeg.readFile(outputFileName);
    let outputBuffer: ArrayBuffer;

    if (typeof outputData === 'string') {
      const encoder = new TextEncoder();
      outputBuffer = encoder.encode(outputData).buffer;
    } else if (outputData instanceof Uint8Array) {
      outputBuffer = outputData.buffer.slice(
        outputData.byteOffset,
        outputData.byteOffset + outputData.byteLength
      );
    } else {
      outputBuffer = (outputData as any).buffer || outputData;
    }

    try {
      for (const vItem of videoBuffers) {
        try {
          await ffmpeg.deleteFile(vItem.fileName);
        } catch {}
      }
      await ffmpeg.deleteFile(outputFileName);
      for (const sfxF of writtenSfxFiles) {
        await ffmpeg.deleteFile(sfxF);
      }
      if (fontWritten) {
        await ffmpeg.deleteFile('font.ttf');
      }
    } catch {
      // Non-fatal cleanup
    }

    self.postMessage({
      type: 'EXPORT_PROGRESS',
      id,
      stage: 'complete',
      progress: 1.0,
      message: 'Render and encoding finished successfully!',
    });

    (self as any).postMessage(
      {
        type: 'EXPORT_SUCCESS',
        id,
        buffer: outputBuffer,
        byteLength: outputBuffer.byteLength,
        fileName: 'kontentos_export.mp4',
      },
      [outputBuffer]
    );
  } catch (error: any) {
    console.error('[FFmpeg Worker] Export error:', error);
    self.postMessage({
      type: 'EXPORT_ERROR',
      id,
      error: error?.message || 'Error occurred during MP4 export rendering',
    });
  }
}

/**
 * A source with no audio track is not an error: a screen recording can be silent. The filtergraph
 * still has to know, because a required `[0:a]` map would fail the whole export on such a file.
 * Log probing is enough here and avoids a second ffprobe binary in the browser bundle.
 */
async function probeAudioStreams(fileNames: string[]): Promise<Record<string, boolean>> {
  if (!ffmpeg) throw new Error('FFmpeg instance is unavailable');
  const result: Record<string, boolean> = {};

  for (const fileName of fileNames) {
    const messages: string[] = [];
    const collect = (message: string) => messages.push(message);
    logCollectors.add(collect);
    try {
      // No output is intentional: FFmpeg prints its stream table and exits with code 1.
      await ffmpeg.exec(['-hide_banner', '-i', fileName]);
    } finally {
      logCollectors.delete(collect);
    }

    const log = messages.join('\n');
    const hasVideo = /Stream #\d+:\d+.*\bVideo:/.test(log);
    const hasAudio = /Stream #\d+:\d+.*\bAudio:/.test(log);
    if (!hasVideo && !hasAudio) {
      throw new Error(`The source ${fileName} could not be inspected, so its audio track cannot be reported honestly.`);
    }
    result[fileName] = hasAudio;
  }
  return result;
}

interface TimelineExportRequest {
  project: TimelineProject;
  sourceBuffers: Array<{ fileName: string; sourceUrl: string; buffer: ArrayBuffer }>;
  width?: number;
  height?: number;
  fps?: number;
  crf?: number;
}

/**
 * Renders an editor timeline straight from its EDL. Unlike the canvas recorder, every output frame
 * is addressed by source time, so a throttled tab, slow seek or dropped animation frame cannot move
 * a caption or a cut.
 */
async function exportTimeline(id: string, req: TimelineExportRequest): Promise<void> {
  const writtenFiles: string[] = [];
  let outputFileName = '';
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const cleanup = async () => {
    if (!ffmpeg?.loaded) return;
    for (const name of writtenFiles) {
      try { await ffmpeg.deleteFile(name); } catch { /* already gone */ }
    }
  };

  try {
    if (!ffmpeg || !ffmpeg.loaded) await initFFmpeg();
    if (!ffmpeg) throw new Error('FFmpeg instance is unavailable');

    self.postMessage({
      type: 'EXPORT_PROGRESS', id, stage: 'preparing_assets', progress: 0.04,
      message: 'Loading timeline sources into the render bench…',
    });

    for (const source of req.sourceBuffers) {
      await ffmpeg.writeFile(source.fileName, new Uint8Array(source.buffer));
      writtenFiles.push(source.fileName);
    }

    self.postMessage({
      type: 'EXPORT_PROGRESS', id, stage: 'preparing_assets', progress: 0.09,
      message: 'Checking which sources actually carry audio…',
    });
    const probed = await probeAudioStreams(req.sourceBuffers.map((source) => source.fileName));
    const sourceHasAudio: Record<string, boolean> = {};
    for (const source of req.sourceBuffers) {
      const hasAudio = probed[source.fileName] ?? false;
      sourceHasAudio[source.fileName] = hasAudio;
      sourceHasAudio[source.sourceUrl] = hasAudio;
    }

    const compiled = compileTimelineToFiltergraph(req.project, {
      width: req.width,
      height: req.height,
      fps: req.fps,
      sourceHasAudio,
    });

    if (compiled.hasCaptions) {
      // Words the creator can read in the editor must be in the file. A missing font or text file
      // is an error, not a quiet export without captions.
      const fontRes = await fetch('/fonts/font.ttf');
      if (!fontRes.ok) throw new Error('The caption font could not be loaded, so captions could not be burned in.');
      await ffmpeg.writeFile('font.ttf', new Uint8Array(await fontRes.arrayBuffer()));
      writtenFiles.push('font.ttf');
      for (const file of compiled.captionFiles) {
        await ffmpeg.writeFile(file.name, new TextEncoder().encode(file.text));
        writtenFiles.push(file.name);
      }
    }

    for (const audioFileName of compiled.requiredSfxFiles) {
      if (audioFileName.startsWith('bgm_')) {
        const bgmId = audioFileName.replace(/^bgm_/, '').replace(/\.wav$/, '');
        await ffmpeg.writeFile(audioFileName, generateSyntheticBgmWav(bgmId, Math.ceil(compiled.totalDuration) + 1));
      } else {
        const sfxId = audioFileName.replace(/^sfx_/, '').replace(/\.wav$/, '');
        await ffmpeg.writeFile(audioFileName, generateSyntheticSfxWav(sfxId));
      }
      writtenFiles.push(audioFileName);
    }

    self.postMessage({
      type: 'EXPORT_PROGRESS', id, stage: 'encoding', progress: 0.15,
      message: `Rendering ${compiled.totalDuration.toFixed(1)}s frame-accurately as H.264…`,
    });

    outputFileName = `timeline_${Date.now()}.mp4`;
    writtenFiles.push(outputFileName);
    const execArgs = [
      ...compiled.inputArgs,
      '-filter_complex', compiled.filterComplex,
      '-map', compiled.outputVideoLabel,
      '-map', compiled.outputAudioLabel,
      '-t', compiled.totalDuration.toFixed(3),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-threads', '1',
      '-pix_fmt', 'yuv420p',
      '-crf', String(req.crf ?? 20),
      '-c:a', 'aac',
      '-b:a', '256k',
      '-movflags', '+faststart',
      '-avoid_negative_ts', 'make_zero',
      '-y', outputFileName,
    ];

    const execPromise = ffmpeg.exec(execArgs);
    const timeoutPromise = new Promise<number>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error('The frame-accurate render timed out after 120 seconds. Try a shorter timeline or a lower resolution.')),
        120_000
      );
    });
    const exitCode = await Promise.race([execPromise, timeoutPromise]);
    if (timeout) clearTimeout(timeout);
    timeout = null;
    if (exitCode !== 0) {
      throw new Error(`FFmpeg could not render the timeline (exit code ${exitCode}).`);
    }

    self.postMessage({
      type: 'EXPORT_PROGRESS', id, stage: 'finalizing', progress: 0.95,
      message: 'Writing the finished MP4…',
    });
    const outputData = await ffmpeg.readFile(outputFileName);
    let outputBuffer: ArrayBuffer;
    if (typeof outputData === 'string') {
      outputBuffer = new TextEncoder().encode(outputData).buffer;
    } else if (outputData instanceof Uint8Array) {
      outputBuffer = outputData.buffer.slice(outputData.byteOffset, outputData.byteOffset + outputData.byteLength);
    } else {
      outputBuffer = (outputData as any).buffer || outputData;
    }

    if (outputBuffer.byteLength === 0) throw new Error('FFmpeg produced an empty MP4.');
    await cleanup();

    self.postMessage({
      type: 'EXPORT_PROGRESS', id, stage: 'done', progress: 1,
      message: 'Frame-accurate render finished.',
    });
    (self as any).postMessage(
      {
        type: 'EXPORT_SUCCESS', id, buffer: outputBuffer, byteLength: outputBuffer.byteLength,
        fileName: 'kontentos_timeline.mp4', captionsBurned: compiled.hasCaptions,
      },
      [outputBuffer]
    );
  } catch (error: any) {
    if (timeout) clearTimeout(timeout);
    console.error('[FFmpeg Worker] Timeline export error:', error);
    await cleanup();
    self.postMessage({
      type: 'EXPORT_ERROR', id,
      error: error?.message || 'The frame-accurate export could not be completed.',
    });
  }
}

/**
 * Cuts one timecode span out of a source clip and re-encodes it as a standalone MP4.
 *
 * `-ss` sits before `-i` so ffmpeg seeks instead of decoding from the top of the file, and the
 * audio map is optional (`0:a:0?`) because a screen recording can arrive without a sound track —
 * a required map would fail the whole cut on a span that has pictures to show.
 *
 * `filter` is the frame-fitting chain from `src/lib/frameFit`, never a string assembled by a screen:
 * the only thing a caller may ask for is a shape, and this side decides what that shape costs.
 */
async function cutSpan(
  id: string,
  inputBuffer: ArrayBuffer,
  fileName: string,
  start: number,
  duration: number,
  filter?: string,
  captionFiles?: Array<{ name: string; text: string }>
): Promise<void> {
  let writtenInput = false;
  let outputFileName = '';
  const writtenCaptionFiles: string[] = [];

  try {
    if (!ffmpeg || !ffmpeg.loaded) {
      await initFFmpeg();
    }
    if (!ffmpeg) {
      throw new Error('FFmpeg instance is unavailable');
    }

    outputFileName = `cut_${Date.now()}.mp4`;

    self.postMessage({
      type: 'EXPORT_PROGRESS',
      id,
      stage: 'preparing_assets',
      progress: 0.05,
      message: 'Reading the source into the cut bench...',
    });

    await ffmpeg.writeFile(fileName, new Uint8Array(inputBuffer));
    writtenInput = true;

    // Captions burned into the frames need the font and one text file per page next to the source.
    // A missing font is an error, not a quiet fallback to a reel without the words the creator asked for.
    if (captionFiles && captionFiles.length > 0) {
      const fontRes = await fetch('/fonts/font.ttf');
      if (!fontRes.ok) throw new Error('The caption font could not be loaded, so the captions could not be burned in.');
      await ffmpeg.writeFile('font.ttf', new Uint8Array(await fontRes.arrayBuffer()));
      writtenCaptionFiles.push('font.ttf');
      for (const file of captionFiles) {
        await ffmpeg.writeFile(file.name, new TextEncoder().encode(file.text));
        writtenCaptionFiles.push(file.name);
      }
    }

    self.postMessage({
      type: 'EXPORT_PROGRESS',
      id,
      stage: 'encoding',
      progress: 0.15,
      message: `Cutting ${duration.toFixed(1)}s from ${start.toFixed(1)}s and encoding H.264...`,
    });

    const execArgs: string[] = [
      '-ss', start.toFixed(3),
      '-i', fileName,
      '-t', duration.toFixed(3),
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-threads', '1',
      ...(filter ? ['-vf', filter] : []),
      '-pix_fmt', 'yuv420p',
      '-crf', '20',
      '-c:a', 'aac',
      '-b:a', '256k',
      '-movflags', '+faststart',
      '-avoid_negative_ts', 'make_zero',
      '-y',
      outputFileName,
    ];

    const execPromise = ffmpeg.exec(execArgs);
    const timeoutPromise = new Promise<number>((_, reject) =>
      setTimeout(
        () => reject(new Error('The browser cut timed out after 120 seconds. The span or the source may be too large to render here.')),
        120_000
      )
    );
    const exitCode = await Promise.race([execPromise, timeoutPromise]);
    if (exitCode !== 0) {
      throw new Error(`The cut failed with exit code ${exitCode}.`);
    }

    self.postMessage({
      type: 'EXPORT_PROGRESS',
      id,
      stage: 'finalizing',
      progress: 0.95,
      message: 'Writing the cut file...',
    });

    const outputData = await ffmpeg.readFile(outputFileName);
    let outputBuffer: ArrayBuffer;
    if (typeof outputData === 'string') {
      outputBuffer = new TextEncoder().encode(outputData).buffer;
    } else if (outputData instanceof Uint8Array) {
      outputBuffer = outputData.buffer.slice(outputData.byteOffset, outputData.byteOffset + outputData.byteLength);
    } else {
      outputBuffer = (outputData as any).buffer || outputData;
    }

    try {
      await ffmpeg.deleteFile(fileName);
      await ffmpeg.deleteFile(outputFileName);
      for (const name of writtenCaptionFiles) await ffmpeg.deleteFile(name);
    } catch {
      // Non-fatal cleanup
    }

    (self as any).postMessage(
      {
        type: 'CUT_SUCCESS',
        id,
        buffer: outputBuffer,
        byteLength: outputBuffer.byteLength,
        fileName: 'kontentos_cut.mp4',
      },
      [outputBuffer]
    );
  } catch (error: any) {
    console.error('[FFmpeg Worker] Cut error:', error);
    try {
      if (ffmpeg?.loaded) {
        if (writtenInput) await ffmpeg.deleteFile(fileName);
        if (outputFileName) await ffmpeg.deleteFile(outputFileName);
        for (const name of writtenCaptionFiles) await ffmpeg.deleteFile(name);
      }
    } catch {
      /* leaving the virtual filesystem is not worth failing the answer over */
    }
    self.postMessage({
      type: 'CUT_ERROR',
      id,
      error: error?.message || 'The browser cut could not be completed',
    });
  }
}

self.onmessage = async (event: MessageEvent) => {
  const { type, id } = event.data;

  switch (type) {
    case 'INIT':
      try {
        await initFFmpeg();
      } catch {
        // Handled in initFFmpeg
      }
      break;

    case 'EXTRACT_AUDIO':
      await extractAudio(id, event.data.buffer, event.data.fileName);
      break;

    case 'EXPORT_MP4': {
      const videoBuffers: Array<{ fileName: string; buffer: ArrayBuffer }> =
        event.data.videoBuffers || [
          {
            fileName: event.data.inputFileName || 'input.mp4',
            buffer: event.data.buffer,
          },
        ];

      await exportMP4(
        id,
        videoBuffers,
        event.data.inputArgs || ['-i', 'input.mp4'],
        event.data.filterComplex,
        event.data.outputVideoLabel || '[vout]',
        event.data.outputAudioLabel || '[aout]',
        event.data.requiredSfxFiles || []
      );
      break;
    }

    case 'EXPORT_TIMELINE':
      await exportTimeline(id, {
        project: event.data.project,
        sourceBuffers: event.data.sourceBuffers || [],
        width: event.data.width,
        height: event.data.height,
        fps: event.data.fps,
        crf: event.data.crf,
      });
      break;

    case 'CUT_SPAN':
      await cutSpan(
        id,
        event.data.buffer,
        event.data.inputFileName || 'input.mp4',
        Number(event.data.start) || 0,
        Number(event.data.duration) || 0,
        typeof event.data.filter === 'string' ? event.data.filter : undefined,
        Array.isArray(event.data.captionFiles) ? event.data.captionFiles : undefined
      );
      break;

    default:
      self.postMessage({
        type: 'UNKNOWN_COMMAND',
        error: `Unrecognized worker command: ${type}`,
      });
      break;
  }
};
