/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { pipeline, env } from '@huggingface/transformers';
import { WordTimestamp } from '../types/timeline';

// Configure transformers.js environment for browser worker execution
env.allowLocalModels = false;

let transcriber: any = null;
let isModelLoading = false;
let activeDevice: 'webgpu' | 'wasm' = 'wasm';

/**
 * Converts a 16kHz 1-channel 16-bit PCM WAV ArrayBuffer into Float32Array (-1.0 to 1.0)
 */
function wavToFloat32Array(buffer: ArrayBuffer): Float32Array {
  const dataView = new DataView(buffer);
  let pcmDataOffset = 44; // Default standard WAV header length
  let pcmByteLength = buffer.byteLength - pcmDataOffset;

  // Scan RIFF chunks to find the exact 'data' chunk
  try {
    let offset = 12;
    while (offset < buffer.byteLength - 8) {
      const chunkId = String.fromCharCode(
        dataView.getUint8(offset),
        dataView.getUint8(offset + 1),
        dataView.getUint8(offset + 2),
        dataView.getUint8(offset + 3)
      );
      const chunkSize = dataView.getUint32(offset + 4, true);
      if (chunkId === 'data') {
        pcmDataOffset = offset + 8;
        pcmByteLength = Math.min(chunkSize, buffer.byteLength - pcmDataOffset);
        break;
      }
      offset += 8 + chunkSize;
    }
  } catch (e) {
    console.warn('WAV chunk parsing fallback to 44-byte offset', e);
  }

  const numSamples = Math.floor(pcmByteLength / 2);
  const int16Array = new Int16Array(buffer, pcmDataOffset, numSamples);
  const float32Array = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    float32Array[i] = Math.max(-1, Math.min(1, int16Array[i] / 32768.0));
  }

  return float32Array;
}

/**
 * Initializes the automatic-speech-recognition pipeline with WebGPU and fallback to WASM
 */
async function loadWhisperModel(): Promise<void> {
  if (transcriber) return;
  if (isModelLoading) {
    while (isModelLoading) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return;
  }

  isModelLoading = true;

  const modelId = 'onnx-community/whisper-tiny.en';
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;

  try {
    if (hasWebGPU) {
      self.postMessage({
        type: 'STATUS_UPDATE',
        status: 'Checking WebGPU acceleration...',
      });

      try {
        transcriber = await pipeline('automatic-speech-recognition', modelId, {
          device: 'webgpu',
          dtype: 'fp32',
          progress_callback: (progressInfo: any) => {
            self.postMessage({ type: 'MODEL_PROGRESS', progressInfo });
          },
        });
        activeDevice = 'webgpu';
      } catch (webgpuErr) {
        console.warn('WebGPU Whisper pipeline initialization failed, falling back to WASM:', webgpuErr);
        throw webgpuErr;
      }
    } else {
      throw new Error('WebGPU unavailable in this browser environment');
    }
  } catch {
    self.postMessage({
      type: 'STATUS_UPDATE',
      status: 'Loading Whisper model via WebAssembly engine...',
    });

    transcriber = await pipeline('automatic-speech-recognition', modelId, {
      device: 'wasm',
      dtype: 'fp32',
      progress_callback: (progressInfo: any) => {
        self.postMessage({ type: 'MODEL_PROGRESS', progressInfo });
      },
    });
    activeDevice = 'wasm';
  }

  isModelLoading = false;
  self.postMessage({
    type: 'MODEL_READY',
    device: activeDevice,
    modelId,
  });
}

/**
 * Transcribes audio buffer and extracts word-level timestamps
 */
async function transcribe(id: string, wavBuffer: ArrayBuffer): Promise<void> {
  try {
    if (!transcriber) {
      await loadWhisperModel();
    }

    if (!transcriber) {
      throw new Error('Whisper model failed to initialize');
    }

    self.postMessage({
      type: 'TRANSCRIBE_STATUS',
      id,
      stage: 'Converting PCM audio samples...',
      progress: 0.1,
    });

    const audioSamples = wavToFloat32Array(wavBuffer);
    if (audioSamples.length === 0) {
      throw new Error('Audio buffer contains no decodable PCM audio samples');
    }

    self.postMessage({
      type: 'TRANSCRIBE_STATUS',
      id,
      stage: `Running local Whisper STT on ${activeDevice.toUpperCase()}...`,
      progress: 0.3,
    });

    const output: any = await transcriber(audioSamples, {
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const rawChunks = output.chunks || [];
    const words: WordTimestamp[] = [];

    for (const chunk of rawChunks) {
      const text = (chunk.text || '').trim();
      if (!text) continue;

      const start = Array.isArray(chunk.timestamp) && typeof chunk.timestamp[0] === 'number'
        ? Math.round(chunk.timestamp[0] * 100) / 100
        : 0;
      const end = Array.isArray(chunk.timestamp) && typeof chunk.timestamp[1] === 'number'
        ? Math.round(chunk.timestamp[1] * 100) / 100
        : start + 0.3;

      words.push({
        word: text,
        start,
        end: Math.max(end, start + 0.05),
        confidence: typeof chunk.confidence === 'number' ? Math.round(chunk.confidence * 100) / 100 : undefined,
      });
    }

    self.postMessage({
      type: 'TRANSCRIBE_SUCCESS',
      id,
      text: (output.text || '').trim(),
      words,
      sampleRate: 16000,
      durationSec: Math.round((audioSamples.length / 16000) * 10) / 10,
    });
  } catch (error: any) {
    self.postMessage({
      type: 'TRANSCRIBE_ERROR',
      id,
      error: error?.message || 'Local Whisper transcription failed',
    });
  }
}

self.onmessage = async (event: MessageEvent) => {
  const { type, id, buffer } = event.data;

  switch (type) {
    case 'INIT_MODEL':
      try {
        await loadWhisperModel();
      } catch (err: any) {
        self.postMessage({
          type: 'MODEL_ERROR',
          error: err?.message || 'Failed to initialize Whisper model',
        });
      }
      break;

    case 'TRANSCRIBE':
      await transcribe(id, buffer);
      break;

    default:
      console.warn('Unknown message type in whisper worker:', type);
      break;
  }
};
