/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface FFmpegProgress {
  progress: number;
  time?: number;
  stage?: string;
}

export interface UseFFmpegAudioExtractorReturn {
  isReady: boolean;
  isLoading: boolean;
  isExtracting: boolean;
  progress: number;
  error: string | null;
  logs: string[];
  initEngine: () => Promise<void>;
  extractAudio: (videoFile: File | Blob) => Promise<ArrayBuffer>;
  resetError: () => void;
}

export function useFFmpegAudioExtractor(): UseFFmpegAudioExtractorReturn {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const workerRef = useRef<Worker | null>(null);
  const pendingRequests = useRef<
    Map<
      string,
      {
        resolve: (buffer: ArrayBuffer) => void;
        reject: (error: Error) => void;
      }
    >
  >(new Map());

  // Initialize Worker
  useEffect(() => {
    try {
      const worker = new Worker(
        new URL('../workers/ffmpeg.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (event: MessageEvent) => {
        const { type, id, buffer, progress: progValue, error: errMsg, message } = event.data;

        switch (type) {
          case 'INIT_SUCCESS':
            setIsReady(true);
            setIsLoading(false);
            setError(null);
            break;

          case 'INIT_ERROR':
            setIsReady(false);
            setIsLoading(false);
            setError(errMsg || 'Failed to initialize FFmpeg');
            break;

          case 'PROGRESS':
            if (typeof progValue === 'number') {
              setProgress(Math.round(progValue * 100));
            }
            break;

          case 'EXTRACT_PROGRESS':
            if (typeof progValue === 'number') {
              setProgress(Math.round(progValue * 100));
            }
            break;

          case 'LOG':
            if (message) {
              setLogs((prev) => [...prev.slice(-49), message]);
            }
            break;

          case 'EXTRACT_AUDIO_SUCCESS': {
            setIsExtracting(false);
            setProgress(100);
            const pending = pendingRequests.current.get(id);
            if (pending) {
              pending.resolve(buffer);
              pendingRequests.current.delete(id);
            }
            break;
          }

          case 'EXTRACT_AUDIO_ERROR': {
            setIsExtracting(false);
            const err = new Error(errMsg || 'Audio extraction failed');
            setError(err.message);
            const pending = pendingRequests.current.get(id);
            if (pending) {
              pending.reject(err);
              pendingRequests.current.delete(id);
            }
            break;
          }

          default:
            break;
        }
      };

      worker.onerror = (err) => {
        console.error('FFmpeg Worker uncaught error:', err);
        setError(err.message || 'Worker thread encountered an unexpected error');
        setIsLoading(false);
        setIsExtracting(false);
      };

      workerRef.current = worker;

      // Automatically trigger initialization
      setIsLoading(true);
      worker.postMessage({ type: 'INIT' });

      return () => {
        worker.terminate();
        workerRef.current = null;
        pendingRequests.current.clear();
      };
    } catch (err: any) {
      setError(err?.message || 'Unable to instantiate FFmpeg Web Worker');
      setIsLoading(false);
    }
  }, []);

  const initEngine = useCallback(async (): Promise<void> => {
    if (isReady || !workerRef.current) return;
    setIsLoading(true);
    setError(null);
    workerRef.current.postMessage({ type: 'INIT' });
  }, [isReady]);

  const extractAudio = useCallback(
    async (videoFile: File | Blob): Promise<ArrayBuffer> => {
      if (!workerRef.current) {
        throw new Error('FFmpeg Worker is not available in this environment');
      }

      // Memory safeguard: check file size (browser memory typically handles up to 1GB comfortably)
      if (videoFile.size > 1024 * 1024 * 1024) {
        throw new Error('Video file exceeds 1GB in-browser memory limit. Please use a shorter clip.');
      }

      setIsExtracting(true);
      setProgress(5);
      setError(null);

      const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const arrayBuffer = await videoFile.arrayBuffer();

      return new Promise<ArrayBuffer>((resolve, reject) => {
        pendingRequests.current.set(id, { resolve, reject });

        const fileName = (videoFile as File).name || 'input.mp4';
        workerRef.current!.postMessage(
          {
            type: 'EXTRACT_AUDIO',
            id,
            buffer: arrayBuffer,
            fileName,
          },
          [arrayBuffer]
        );
      });
    },
    []
  );

  const resetError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isReady,
    isLoading,
    isExtracting,
    progress,
    error,
    logs,
    initEngine,
    extractAudio,
    resetError,
  };
}
