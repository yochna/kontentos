/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { TimelineProject } from '../types/timeline';
import { compileTimelineToFiltergraph } from '../utils/ffmpegFilterCompiler';

export interface ExportProgressState {
  stage: 'idle' | 'preparing_assets' | 'encoding' | 'finalizing' | 'complete' | 'error';
  percentage: number;
  message: string;
}

export interface UseExportMP4Return {
  isExporting: boolean;
  progress: ExportProgressState;
  exportedBlobUrl: string | null;
  exportedBlob: Blob | null;
  error: string | null;
  startExport: (videoFile: File, project: TimelineProject) => Promise<{ blobUrl: string; blob: Blob }>;
  cancelExport: () => void;
  resetExport: () => void;
}

export function useExportMP4(): UseExportMP4Return {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgressState>({
    stage: 'idle',
    percentage: 0,
    message: 'Ready to export',
  });
  const [exportedBlobUrl, setExportedBlobUrl] = useState<string | null>(null);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const pendingPromiseRef = useRef<{
    resolve: (val: { blobUrl: string; blob: Blob }) => void;
    reject: (err: Error) => void;
  } | null>(null);

  // Initialize or recycle worker
  const getOrCreateWorker = useCallback((): Worker => {
    if (workerRef.current) {
      return workerRef.current;
    }

    const worker = new Worker(
      new URL('../workers/ffmpeg.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event: MessageEvent) => {
      const { type, id, buffer, progress: progValue, stage, message, error: errMsg, fileName } = event.data;

      if (id && activeRequestIdRef.current && id !== activeRequestIdRef.current) {
        return;
      }

      switch (type) {
        case 'EXPORT_PROGRESS': {
          const pct = Math.min(100, Math.max(0, Math.round((progValue || 0) * 100)));
          setProgress({
            stage: stage || 'encoding',
            percentage: pct,
            message: message || `Encoding MP4 (${pct}%)...`,
          });
          break;
        }

        case 'PROGRESS': {
          if (typeof progValue === 'number') {
            const pct = Math.min(99, Math.max(15, Math.round(progValue * 100)));
            setProgress((prev) => ({
              ...prev,
              percentage: pct,
              message: `FFmpeg transcoding in progress: ${pct}%`,
            }));
          }
          break;
        }

        case 'EXPORT_SUCCESS': {
          setIsExporting(false);
          const blob = new Blob([buffer], { type: 'video/mp4' });
          const blobUrl = URL.createObjectURL(blob);

          setExportedBlob(blob);
          setExportedBlobUrl(blobUrl);
          setProgress({
            stage: 'complete',
            percentage: 100,
            message: 'Export complete! Ready for download.',
          });

          if (pendingPromiseRef.current) {
            pendingPromiseRef.current.resolve({ blobUrl, blob });
            pendingPromiseRef.current = null;
          }
          break;
        }

        case 'EXPORT_ERROR': {
          setIsExporting(false);
          const errorMsg = errMsg || 'An error occurred during video export.';
          setError(errorMsg);
          setProgress({
            stage: 'error',
            percentage: 0,
            message: `Export failed: ${errorMsg}`,
          });

          if (pendingPromiseRef.current) {
            pendingPromiseRef.current.reject(new Error(errorMsg));
            pendingPromiseRef.current = null;
          }
          break;
        }

        default:
          break;
      }
    };

    worker.onerror = (err) => {
      console.error('[Export Worker Error]:', err);
      setIsExporting(false);
      const msg = 'Worker thread encountered an unexpected execution error.';
      setError(msg);
      setProgress({ stage: 'error', percentage: 0, message: msg });
      if (pendingPromiseRef.current) {
        pendingPromiseRef.current.reject(new Error(msg));
        pendingPromiseRef.current = null;
      }
    };

    workerRef.current = worker;
    return worker;
  }, []);

  const cancelExport = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsExporting(false);
    setProgress({
      stage: 'idle',
      percentage: 0,
      message: 'Export cancelled',
    });
    if (pendingPromiseRef.current) {
      pendingPromiseRef.current.reject(new Error('Export was cancelled by the user.'));
      pendingPromiseRef.current = null;
    }
  }, []);

  const resetExport = useCallback(() => {
    if (exportedBlobUrl) {
      URL.revokeObjectURL(exportedBlobUrl);
    }
    setExportedBlobUrl(null);
    setExportedBlob(null);
    setError(null);
    setProgress({
      stage: 'idle',
      percentage: 0,
      message: 'Ready to export',
    });
  }, [exportedBlobUrl]);

  const startExport = useCallback(
    async (videoFile: File, project: TimelineProject): Promise<{ blobUrl: string; blob: Blob }> => {
      resetExport();
      setIsExporting(true);
      setError(null);

      const requestId = `export_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      activeRequestIdRef.current = requestId;

      setProgress({
        stage: 'preparing_assets',
        percentage: 5,
        message: 'Reading video file and compiling FFmpeg filtergraph...',
      });

      return new Promise<{ blobUrl: string; blob: Blob }>(async (resolve, reject) => {
        pendingPromiseRef.current = { resolve, reject };

        try {
          // 1. Read video file into ArrayBuffer
          const videoBuffer = await videoFile.arrayBuffer();

          // 2. Compile TimelineProject to FFmpeg Filtergraph
          const sanitizedFileName = 'input.mp4';
          const compiled = compileTimelineToFiltergraph(project, {
            inputVideoFileName: sanitizedFileName,
            width: project.projectMetadata.width || 1080,
            height: project.projectMetadata.height || 1920,
            fps: project.projectMetadata.frameRate || 30,
          });

          console.log('[useExportMP4] Compiled filtergraph:', compiled.filterComplex);

          // 3. Dispatch to FFmpeg Worker
          const worker = getOrCreateWorker();
          worker.postMessage(
            {
              type: 'EXPORT_MP4',
              id: requestId,
              buffer: videoBuffer,
              inputFileName: sanitizedFileName,
              inputArgs: compiled.inputArgs,
              filterComplex: compiled.filterComplex,
              outputVideoLabel: compiled.outputVideoLabel,
              outputAudioLabel: compiled.outputAudioLabel,
              requiredSfxFiles: compiled.requiredSfxFiles,
            },
            [videoBuffer]
          );
        } catch (err: any) {
          setIsExporting(false);
          const errorMsg = err?.message || 'Failed to start export pipeline';
          setError(errorMsg);
          setProgress({ stage: 'error', percentage: 0, message: errorMsg });
          reject(new Error(errorMsg));
          pendingPromiseRef.current = null;
        }
      });
    },
    [getOrCreateWorker, resetExport]
  );

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      if (exportedBlobUrl) {
        URL.revokeObjectURL(exportedBlobUrl);
      }
    };
  }, [exportedBlobUrl]);

  return {
    isExporting,
    progress,
    exportedBlobUrl,
    exportedBlob,
    error,
    startExport,
    cancelExport,
    resetExport,
  };
}
