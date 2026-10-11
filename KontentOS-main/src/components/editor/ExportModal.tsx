/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  FileVideo,
  Sparkles,
  Play,
  Share2,
  Film,
  Zap,
  Calendar,
} from 'lucide-react';
import { TimelineProject } from '../../types/timeline';
import { useExportMP4 } from '../../hooks/useExportMP4';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoFile: File | null;
  project: TimelineProject;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  videoFile,
  project,
}) => {
  const {
    isExporting,
    progress,
    exportedBlobUrl,
    exportedBlob,
    error,
    startExport,
    cancelExport,
    resetExport,
  } = useExportMP4();

  const [hasTriggeredAutoDownload, setHasTriggeredAutoDownload] = useState(false);
  const [downloadFileName, setDownloadFileName] = useState('kontentos_short.mp4');
  const [isPreparingSchedule, setIsPreparingSchedule] = useState(false);

  // Trigger download automatically when export completes
  useEffect(() => {
    if (exportedBlobUrl && !hasTriggeredAutoDownload) {
      setHasTriggeredAutoDownload(true);

      const titleSlug = (project.projectMetadata.title || 'kontentos_short')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_');
      const filename = `${titleSlug}_export.mp4`;
      setDownloadFileName(filename);

      // Automatic browser download trigger
      const link = document.createElement('a');
      link.href = exportedBlobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [exportedBlobUrl, hasTriggeredAutoDownload, project.projectMetadata.title]);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    if (!videoFile) return;
    setHasTriggeredAutoDownload(false);
    try {
      await startExport(videoFile, project);
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  const handleManualDownload = () => {
    if (!exportedBlobUrl) return;
    const link = document.createElement('a');
    link.href = exportedBlobUrl;
    link.download = downloadFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleScheduleReel = async () => {
    if (!exportedBlobUrl) return;
    setIsPreparingSchedule(true);

    try {
      const videoTitle = project.projectMetadata.title || 'Exported Master Reel';

      // Gather kinetic subtitles or captions from text tracks
      const textClips = project.tracks
        .filter((t) => t.type === 'text')
        .flatMap((t) => t.clips)
        .map((c) => ('content' in c ? (c as any).content : ''))
        .filter(Boolean);

      let derivedCaption = textClips.join(' ').trim();
      if (!derivedCaption) {
        derivedCaption = `✨ Check out our latest breakdown on ${videoTitle}! Let us know your thoughts in the comments 👇`;
      }

      const defaultHashtags = [
        '#CreatorEconomy',
        '#ViralReels',
        '#Shorts',
        '#VideoEditing',
        '#KontentOS',
      ];

      let registeredVideoId = `vid_${Date.now()}`;
      let savedVideoUrl = exportedBlobUrl;

      // Upload and register in backend library if exportedBlob is available
      if (exportedBlob) {
        try {
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const res = reader.result as string;
              resolve(res.split(',')[1] || res);
            };
            reader.onerror = reject;
          });
          reader.readAsDataURL(exportedBlob);
          const base64Data = await base64Promise;

          const uploadRes = await fetch('/api/upload/direct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: downloadFileName,
              fileData: base64Data,
              mimeType: 'video/mp4',
              title: videoTitle,
              aspectRatio: '9:16',
            }),
          });

          if (uploadRes.ok) {
            const uploadJson = await uploadRes.json();
            if (uploadJson.video) {
              registeredVideoId = uploadJson.video.id;
              savedVideoUrl = uploadJson.video.file_url;
            }
          }
        } catch (uploadErr) {
          console.warn('Could not auto-register uploaded file to backend, using local blobUrl:', uploadErr);
        }
      }

      const detail = {
        videoId: registeredVideoId,
        title: videoTitle,
        fileUrl: savedVideoUrl,
        caption: derivedCaption,
        hashtags: defaultHashtags,
        initialPlatform: 'instagram',
        redirectToSchedule: true,
      };

      if (typeof window !== 'undefined' && window.KontentOS?.openScheduleModal) {
        window.KontentOS.openScheduleModal(detail);
      } else {
        window.dispatchEvent(new CustomEvent('kontentos:schedule-reel', { detail }));
      }

      onClose();
    } catch (err) {
      console.error('Failed to bridge export to schedule:', err);
    } finally {
      setIsPreparingSchedule(false);
    }
  };

  const handleClose = () => {
    if (isExporting) {
      if (confirm('An export is currently in progress. Do you want to cancel it?')) {
        cancelExport();
        resetExport();
        onClose();
      }
    } else {
      resetExport();
      onClose();
    }
  };

  const videoTrack = project.tracks.find((t) => t.type === 'video');
  const sfxTrack = project.tracks.find((t) => t.type === 'sfx');
  const textTrack = project.tracks.find((t) => t.type === 'text');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-pink-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Export Master Video
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Client-Side FFmpeg
                </span>
              </h2>
              <p className="text-xs text-slate-400">1080x1920 MP4 H.264 / AAC Encoding</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Timeline Composition Specs */}
          <div className="grid grid-cols-3 gap-2.5 bg-slate-950/60 p-3 rounded-2xl border border-slate-800 text-center">
            <div className="space-y-0.5">
              <div className="text-[10px] uppercase font-bold text-slate-500">Duration</div>
              <div className="text-xs font-mono font-extrabold text-white">
                {(project.projectMetadata.totalDuration || 0).toFixed(1)}s
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[10px] uppercase font-bold text-slate-500">Resolution</div>
              <div className="text-xs font-mono font-extrabold text-white">
                {project.projectMetadata.width || 1080}x{project.projectMetadata.height || 1920}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[10px] uppercase font-bold text-slate-500">Layers</div>
              <div className="text-xs font-mono font-extrabold text-indigo-400">
                {(videoTrack?.clips.length || 0) + (sfxTrack?.clips.length || 0) + (textTrack?.clips.length || 0)} clips
              </div>
            </div>
          </div>

          {/* Missing Video Warning */}
          {!videoFile && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <span className="font-semibold">Source video file is not loaded.</span>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  Please upload or select an MP4 video file in the main workstation before launching client-side FFmpeg rendering.
                </p>
              </div>
            </div>
          )}

          {/* Active Encoding State */}
          {isExporting && (
            <div className="space-y-3 bg-indigo-950/30 border border-indigo-500/30 p-4 rounded-2xl">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-bold text-white">
                  <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                  <span>Encoding Video</span>
                </div>
                <span className="font-mono font-extrabold text-indigo-400 text-sm">
                  {progress.percentage}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(4, progress.percentage)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="truncate pr-2">{progress.message}</span>
                <button
                  type="button"
                  onClick={cancelExport}
                  className="text-rose-400 hover:text-rose-300 underline shrink-0 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Complete Success State */}
          {exportedBlobUrl && (
            <div className="space-y-4 bg-emerald-950/30 border border-emerald-500/30 p-4 rounded-2xl text-center">
              <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-sm font-bold text-white">Render Completed!</h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Your video has been encoded into MP4 with H.264 video and AAC audio.
                </p>
                {exportedBlob && (
                  <p className="text-[11px] font-mono text-emerald-400 mt-1">
                    File size: {(exportedBlob.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleScheduleReel}
                  disabled={isPreparingSchedule}
                  className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {isPreparingSchedule ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Preparing Scheduler...</span>
                    </>
                  ) : (
                    <>
                      <Calendar className="w-4 h-4 text-pink-200" />
                      <span>Schedule Reel & Cross-Post</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleManualDownload}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all border border-slate-700 flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Download MP4
                </button>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-3.5 bg-rose-950/40 border border-rose-500/40 rounded-2xl flex items-start gap-3 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Export Failed</span>
                <p className="text-slate-300 text-[11px] mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Pipeline Features Summary */}
          {!isExporting && !exportedBlobUrl && (
            <div className="space-y-2 text-xs text-slate-300">
              <div className="font-semibold text-slate-200">The export pipeline includes:</div>
              <ul className="space-y-1.5 text-[11px] text-slate-400">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  Hard-cuts, silence removal trims, and PTS timing synchronization
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-pink-400" />
                  Dynamic keyframe punch-in camera zooms (up to 1.5x)
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Multi-channel audio mixing with sample-accurate delayed SFX
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                  Burned-in kinetic captions rendered in H.264 yuv420p
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            {exportedBlobUrl ? 'Close' : 'Cancel'}
          </button>

          {!exportedBlobUrl && (
            <button
              type="button"
              onClick={handleStartExport}
              disabled={!videoFile || isExporting}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-pink-600 hover:from-indigo-500 hover:to-pink-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-2 active:scale-95 cursor-pointer disabled:cursor-not-allowed"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Encoding...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-pink-300" />
                  <span>Start MP4 Export</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
