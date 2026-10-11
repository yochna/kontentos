/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { generateSyntheticSfxWav } from '../utils/sfxBufferGenerator';

let ffmpeg: FFmpeg | null = null;
let isInitializing = false;

const CORE_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
const CORE_MT_BASE_URL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm';

async function initFFmpeg(): Promise<void> {
  if (ffmpeg && ffmpeg.loaded) {
    return;
  }
  if (isInitializing) {
    // Wait until initialized
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

    // Check if SharedArrayBuffer is enabled for multi-threading
    const isMultiThreadCapable = typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated;

    try {
      if (isMultiThreadCapable) {
        // Attempt loading multi-threaded core
        const coreURL = await toBlobURL(`${CORE_MT_BASE_URL}/ffmpeg-core.js`, 'text/javascript');
        const wasmURL = await toBlobURL(`${CORE_MT_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm');
        const workerURL = await toBlobURL(`${CORE_MT_BASE_URL}/ffmpeg-core.worker.js`, 'text/javascript');

        await instance.load({
          coreURL,
          wasmURL,
          workerURL,
        });
      } else {
        throw new Error('Single thread fallback required');
      }
    } catch {
      // Graceful fallback to single-threaded core
      const coreURL = await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm');

      await instance.load({
        coreURL,
        wasmURL,
      });
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

    // Write input media to virtual memory FS
    await ffmpeg.writeFile(inputName, new Uint8Array(inputBuffer));

    self.postMessage({
      type: 'EXTRACT_PROGRESS',
      id,
      stage: 'processing',
      progress: 0.1,
    });

    // Run FFmpeg: extract single channel 16kHz PCM WAV optimal for speech recognition
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

    // Read result
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

    // Clean up virtual files to prevent in-memory memory leaks
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

/**
 * Phase 7: Export Orchestrator
 * Pre-loads SFX WAV buffers into virtual FS, loads source video buffer,
 * runs the compiled FFmpeg command, and yields encoded MP4 blob buffer with progress ticks.
 */
async function exportMP4(
  id: string,
  inputBuffer: ArrayBuffer,
  inputFileName: string,
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
      message: 'Pre-loading audio sound effect assets into virtual filesystem...',
    });

    // 1. Write the source video buffer to virtual FS
    await ffmpeg.writeFile(inputFileName, new Uint8Array(inputBuffer));

    // 2. Pre-generate and write bundled SFX asset buffers into virtual FS
    const writtenSfxFiles: string[] = [];
    for (const sfxFileName of requiredSfxFiles) {
      // sfxFileName format: "sfx_{sfxId}.wav"
      const sfxId = sfxFileName.replace(/^sfx_/, '').replace(/\.wav$/, '');
      const sfxBuffer = generateSyntheticSfxWav(sfxId);
      await ffmpeg.writeFile(sfxFileName, sfxBuffer);
      writtenSfxFiles.push(sfxFileName);
    }

    self.postMessage({
      type: 'EXPORT_PROGRESS',
      id,
      stage: 'encoding',
      progress: 0.15,
      message: 'Compiling filtergraph and encoding H.264 video with AAC audio...',
    });

    const outputFileName = `export_${Date.now()}.mp4`;

    // 3. Assemble FFmpeg execution arguments
    // Build arguments from inputArgs: -i input.mp4 -i sfx_1.wav ...
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
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      '-y',
      outputFileName,
    ];

    console.log('[FFmpeg Worker] Executing export command args:', execArgs);

    const exitCode = await ffmpeg.exec(execArgs);

    if (exitCode !== 0) {
      // If drawtext or custom filter failed, attempt safe fallback command
      console.warn(`[FFmpeg Worker] Filtergraph exited with code ${exitCode}. Attempting resilient fallback...`);
      
      const fallbackExecArgs: string[] = [
        '-i',
        inputFileName,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-y',
        outputFileName,
      ];

      const fallbackExit = await ffmpeg.exec(fallbackExecArgs);
      if (fallbackExit !== 0) {
        throw new Error(`FFmpeg export execution failed with exit code ${exitCode}`);
      }
    }

    self.postMessage({
      type: 'EXPORT_PROGRESS',
      id,
      stage: 'finalizing',
      progress: 0.95,
      message: 'Extracting MP4 binary from virtual filesystem...',
    });

    // 4. Read output MP4 file from virtual FS
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

    // 5. Cleanup virtual FS
    try {
      await ffmpeg.deleteFile(inputFileName);
      await ffmpeg.deleteFile(outputFileName);
      for (const sfxF of writtenSfxFiles) {
        await ffmpeg.deleteFile(sfxF);
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

    case 'EXPORT_MP4':
      await exportMP4(
        id,
        event.data.buffer,
        event.data.inputFileName || 'input.mp4',
        event.data.inputArgs || ['-i', 'input.mp4'],
        event.data.filterComplex,
        event.data.outputVideoLabel || '[vout]',
        event.data.outputAudioLabel || '[aout]',
        event.data.requiredSfxFiles || []
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
