/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { generateSyntheticSfxWav, generateSyntheticBgmWav } from '../utils/sfxBufferGenerator';

let ffmpeg: FFmpeg | null = null;
let isInitializing = false;

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
      'ultrafast',
      '-threads',
      '1',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
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

    default:
      self.postMessage({
        type: 'UNKNOWN_COMMAND',
        error: `Unrecognized worker command: ${type}`,
      });
      break;
  }
};
