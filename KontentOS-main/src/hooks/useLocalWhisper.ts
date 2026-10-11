/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { WordTimestamp } from '../types/timeline';

export interface ModelProgressInfo {
  status: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

export interface UseLocalWhisperReturn {
  modelReady: boolean;
  isLoadingModel: boolean;
  isTranscribing: boolean;
  device: 'webgpu' | 'wasm' | null;
  statusText: string;
  downloadProgress: number;
  words: WordTimestamp[];
  fullTranscript: string;
  error: string | null;
  loadModel: () => void;
  transcribeAudio: (wavBuffer: ArrayBuffer) => Promise<WordTimestamp[]>;
  resetError: () => void;
}

export function useLocalWhisper(): UseLocalWhisperReturn {
  const [modelReady, setModelReady] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [device, setDevice] = useState<'webgpu' | 'wasm' | null>(null);
  const [statusText, setStatusText] = useState('Idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [words, setWords] = useState<WordTimestamp[]>([]);
  const [fullTranscript, setFullTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const pendingRequests = useRef<
    Map<
      string,
      {
        resolve: (words: WordTimestamp[]) => void;
        reject: (error: Error) => void;
      }
    >
  >(new Map());

  useEffect(() => {
    try {
      const worker = new Worker(
        new URL('../workers/whisper.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (event: MessageEvent) => {
        const { type, id, error: errMsg, status, progressInfo, device: dev, text, words: wordList, stage } = event.data;

        switch (type) {
          case 'STATUS_UPDATE':
            if (status) setStatusText(status);
            break;

          case 'MODEL_PROGRESS':
            if (progressInfo) {
              if (typeof progressInfo.progress === 'number') {
                setDownloadProgress(Math.round(progressInfo.progress));
                setStatusText(
                  `Downloading Whisper neural model (${Math.round(progressInfo.progress)}%)...`
                );
              } else if (progressInfo.status) {
                setStatusText(progressInfo.status);
              }
            }
            break;

          case 'MODEL_READY':
            setModelReady(true);
            setIsLoadingModel(false);
            setDevice(dev || 'wasm');
            setStatusText(`Whisper model ready (${(dev || 'wasm').toUpperCase()})`);
            setError(null);
            break;

          case 'MODEL_ERROR':
            setIsLoadingModel(false);
            setError(errMsg || 'Failed to load speech recognition model');
            setStatusText('Model load failed');
            break;

          case 'TRANSCRIBE_STATUS':
            if (stage) setStatusText(stage);
            break;

          case 'TRANSCRIBE_SUCCESS': {
            setIsTranscribing(false);
            setStatusText('Transcription complete');
            if (text) setFullTranscript(text);
            if (wordList) setWords(wordList);

            const pending = pendingRequests.current.get(id);
            if (pending) {
              pending.resolve(wordList || []);
              pendingRequests.current.delete(id);
            }
            break;
          }

          case 'TRANSCRIBE_ERROR': {
            setIsTranscribing(false);
            const err = new Error(errMsg || 'Transcription encountered an error');
            setError(err.message);
            setStatusText('Transcription error');

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
        console.error('Whisper worker error:', err);
        setError(err.message || 'Speech recognition worker thread failure');
        setIsLoadingModel(false);
        setIsTranscribing(false);
      };

      workerRef.current = worker;

      return () => {
        worker.terminate();
        workerRef.current = null;
        pendingRequests.current.clear();
      };
    } catch (err: any) {
      setError(err?.message || 'Failed to start Whisper worker');
    }
  }, []);

  const loadModel = useCallback(() => {
    if (modelReady || isLoadingModel || !workerRef.current) return;
    setIsLoadingModel(true);
    setError(null);
    setStatusText('Requesting model initialization...');
    workerRef.current.postMessage({ type: 'INIT_MODEL' });
  }, [modelReady, isLoadingModel]);

  const transcribeAudio = useCallback(
    async (wavBuffer: ArrayBuffer): Promise<WordTimestamp[]> => {
      if (!workerRef.current) {
        throw new Error('Whisper speech recognition worker is not active');
      }

      setIsTranscribing(true);
      setError(null);
      setStatusText('Preparing audio for Whisper analysis...');

      const id = `transcribe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      return new Promise<WordTimestamp[]>((resolve, reject) => {
        pendingRequests.current.set(id, { resolve, reject });

        workerRef.current!.postMessage(
          {
            type: 'TRANSCRIBE',
            id,
            buffer: wavBuffer,
          },
          [wavBuffer]
        );
      });
    },
    []
  );

  const resetError = useCallback(() => {
    setError(null);
  }, []);

  return {
    modelReady,
    isLoadingModel,
    isTranscribing,
    device,
    statusText,
    downloadProgress,
    words,
    fullTranscript,
    error,
    loadModel,
    transcribeAudio,
    resetError,
  };
}
