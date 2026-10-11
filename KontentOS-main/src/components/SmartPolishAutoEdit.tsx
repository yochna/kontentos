/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Sparkles,
  Scissors,
  ZoomIn,
  Volume2,
  Type,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  CheckCircle2,
  Layers,
  Clock,
  Flame,
  FileCode,
  ArrowRight,
  TrendingDown,
  Loader2,
  Wand2,
  Download,
} from 'lucide-react';
import { useTimelineStore } from '../store/useTimelineStore';
import {
  requestAutoEdit,
  AutoEditResult,
  AutoEditOptions,
} from '../services/aiEditorService';
import {
  WordTimestamp,
} from '../types/timeline';
import { PreviewPlayer } from './editor/PreviewPlayer';
import { Timeline } from './editor/Timeline';
import { CommandSidebar } from './editor/CommandSidebar';
import { ExportModal } from './editor/ExportModal';

interface SmartPolishAutoEditProps {
  words: WordTimestamp[];
  selectedFile?: File | null;
  videoDuration?: number;
}

// Sample demo transcript if user wants to test immediately without uploading a video
const SAMPLE_DEMO_TRANSCRIPT: WordTimestamp[] = [
  { word: 'Stop', start: 0.2, end: 0.6 },
  { word: 'scrolling', start: 0.65, end: 1.15 },
  { word: 'right', start: 1.2, end: 1.45 },
  { word: 'now', start: 1.5, end: 1.8 },
  // 1.1s silence gap (> 0.4s) -> CUT OUT!
  { word: 'Here', start: 2.9, end: 3.15 },
  { word: 'is', start: 3.2, end: 3.35 },
  { word: 'how', start: 3.4, end: 3.6 },
  { word: 'creators', start: 3.65, end: 4.1 },
  { word: 'make', start: 4.15, end: 4.4 },
  { word: 'money', start: 4.45, end: 4.95 }, // SFX: cash_register + punch zoom
  // 1.25s silence gap (> 0.4s) -> CUT OUT!
  { word: 'Using', start: 6.2, end: 6.5 },
  { word: 'this', start: 6.55, end: 6.75 },
  { word: 'one', start: 6.8, end: 7.05 }, // SFX: pop
  { word: 'secret', start: 7.1, end: 7.55 }, // SFX: chime + punch zoom
  { word: 'automated', start: 7.6, end: 8.1 },
  { word: 'workflow', start: 8.15, end: 8.7 },
  // 0.9s silence gap (> 0.4s) -> CUT OUT!
  { word: 'Never', start: 9.6, end: 9.95 }, // SFX: vine_boom + punch zoom
  { word: 'waste', start: 10.0, end: 10.35 },
  { word: 'five', start: 10.4, end: 10.7 },
  { word: 'hours', start: 10.75, end: 11.15 },
  { word: 'editing', start: 11.2, end: 11.65 },
  { word: 'again', start: 11.7, end: 12.1 },
];

export function SmartPolishAutoEdit({
  words: propWords,
  selectedFile,
  videoDuration = 0,
}: SmartPolishAutoEditProps): React.ReactElement {
  const {
    project,
    currentTime,
    isPlaying,
    setCurrentTime,
    setIsPlaying,
    hydrateFromEDL,
    loadSourceVideoFile,
    updateProjectDuration,
    undo,
    redo,
    history,
  } = useTimelineStore();

  const [activeWords, setActiveWords] = useState<WordTimestamp[]>(propWords);
  const [usingDemoData, setUsingDemoData] = useState(false);

  // Automatically load source video into timeline store when selected
  useEffect(() => {
    if (selectedFile) {
      const videoTrack = project.tracks.find((t) => t.type === 'video');
      const isEmpty = !videoTrack || videoTrack.clips.length === 0;
      if (isEmpty || project.projectMetadata.totalDuration <= 0) {
        loadSourceVideoFile(selectedFile, videoDuration > 0 ? videoDuration : 10);
      } else if (videoDuration > 0 && isEmpty) {
        updateProjectDuration(videoDuration);
      }
    }
  }, [selectedFile, videoDuration, loadSourceVideoFile, updateProjectDuration]);

  // Sync prop words whenever user completes a Whisper transcription
  useEffect(() => {
    if (propWords && propWords.length > 0) {
      setActiveWords(propWords);
      setUsingDemoData(false);
    }
  }, [propWords]);

  const [options, setOptions] = useState<AutoEditOptions>({
    silenceThresholdSec: 0.4,
    punchZoomEnabled: true,
    sfxEnabled: true,
    captionsEnabled: true,
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [lastResult, setLastResult] = useState<AutoEditResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Load sample demo transcript to test immediately
  const handleLoadDemo = () => {
    setActiveWords(SAMPLE_DEMO_TRANSCRIPT);
    setUsingDemoData(true);
    setErrorMessage(null);
  };

  // Run the full Phase 4 Smart-Polish Auto-Edit pipeline
  const handleRunAutoEdit = async () => {
    if (activeWords.length === 0) {
      setErrorMessage('Please provide word timestamps or click "Load Sample Reel Data".');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      setProcessingStep('Analyzing speech cadence and silence gaps with Gemini Flash...');
      await new Promise((r) => setTimeout(r, 400));

      const inputMetadata = {
        id: selectedFile ? `file_${selectedFile.name.replace(/\.[^/.]+$/, '')}` : 'kontentos_smart_demo',
        title: selectedFile ? `Smart Reel: ${selectedFile.name}` : 'Viral Hook Short (1-Click Polish)',
        duration: videoDuration > 0 ? videoDuration : activeWords[activeWords.length - 1].end + 1,
        targetAspectRatio: '9:16' as const,
      };

      setProcessingStep('Detecting punch-in zoom keyframes, viral SFX, and kinetic captions...');
      const result = await requestAutoEdit(inputMetadata, activeWords, options);

      setProcessingStep('Validating EDL schema compliance & hydrating Timeline Store...');
      await new Promise((r) => setTimeout(r, 200));

      // Hydrate Zustand state store with the validated EDL
      hydrateFromEDL(result.project);
      setLastResult(result);
      setCurrentTime(0);
      setIsPlaying(false);
    } catch (err: any) {
      console.error('Auto-edit error:', err);
      setErrorMessage(err.message || 'Auto-Edit generation failed.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  return (
    <div className="w-full bg-[#0d1322] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-5 sm:p-7 space-y-6 text-slate-100">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-gradient-to-tr from-violet-600 to-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-600/25">
            <Wand2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
                AI Smart Auto-Edit Engine
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 tracking-wider">
                Gemini 2.5 Flash
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              Automated dead-air trimming (&gt;0.4s), dynamic punch-in zoom keyframes, viral SFX, & kinetic captions.
            </p>
          </div>
        </div>

        {/* Action Trigger & Demo Load */}
        <div className="flex flex-wrap items-center gap-2.5">
          {activeWords.length === 0 && (
            <button
              type="button"
              onClick={handleLoadDemo}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold transition-all shadow-sm active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 text-pink-400" /> Load Sample Viral Reel
            </button>
          )}

          <button
            type="button"
            onClick={handleRunAutoEdit}
            disabled={isProcessing}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 via-indigo-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Processing Smart-Polish...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 text-pink-200" /> Run AI 1-Click Polish
              </>
            )}
          </button>
        </div>
      </div>

      {/* Demo Notice Badge */}
      {usingDemoData && (
        <div className="p-3.5 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl flex items-center justify-between text-xs text-indigo-200 shadow-sm">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-pink-400 shrink-0" />
            <span className="font-medium">
              Loaded sample viral spoken transcript (22 words, multiple 1.0s+ dead air pauses). Click "Run AI 1-Click Polish" to generate your timeline EDL.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveWords([]);
              setUsingDemoData(false);
            }}
            className="text-xs text-indigo-400 hover:text-white underline font-semibold ml-3 shrink-0"
          >
            Clear
          </button>
        </div>
      )}

      {/* Processing Step Indicator */}
      {isProcessing && (
        <div className="p-4 bg-slate-950/90 border border-indigo-500/40 rounded-2xl space-y-2.5 shadow-inner">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>{processingStep}</span>
          </div>
          <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden">
            <div className="bg-gradient-to-r from-violet-500 via-indigo-500 to-pink-500 h-2 rounded-full animate-pulse w-3/4 transition-all duration-300" />
          </div>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs">
          {errorMessage}
        </div>
      )}

      {/* Configuration Switches */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
          options.silenceThresholdSec !== undefined
            ? 'bg-amber-500/10 border-amber-500/30 shadow-sm'
            : 'bg-slate-950/60 border-slate-800/80 opacity-70 hover:opacity-100'
        }`}>
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <Scissors className="w-3.5 h-3.5 text-amber-400" /> Silence Cut
            </div>
            <div className="text-[10px] text-slate-400">&gt; 0.4s pauses removed</div>
          </div>
          <input
            type="checkbox"
            checked={options.silenceThresholdSec !== undefined}
            onChange={(e) =>
              setOptions((prev) => ({
                ...prev,
                silenceThresholdSec: e.target.checked ? 0.4 : undefined,
              }))
            }
            className="rounded text-amber-500 focus:ring-amber-500 w-4 h-4 accent-amber-500"
          />
        </label>

        <label className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
          options.punchZoomEnabled
            ? 'bg-pink-500/10 border-pink-500/30 shadow-sm'
            : 'bg-slate-950/60 border-slate-800/80 opacity-70 hover:opacity-100'
        }`}>
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <ZoomIn className="w-3.5 h-3.5 text-pink-400" /> Punch Zooms
            </div>
            <div className="text-[10px] text-slate-400">1.0x → 1.35x keyframes</div>
          </div>
          <input
            type="checkbox"
            checked={options.punchZoomEnabled}
            onChange={(e) =>
              setOptions((prev) => ({ ...prev, punchZoomEnabled: e.target.checked }))
            }
            className="rounded text-pink-500 focus:ring-pink-500 w-4 h-4 accent-pink-500"
          />
        </label>

        <label className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
          options.sfxEnabled
            ? 'bg-emerald-500/10 border-emerald-500/30 shadow-sm'
            : 'bg-slate-950/60 border-slate-800/80 opacity-70 hover:opacity-100'
        }`}>
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> Viral SFX
            </div>
            <div className="text-[10px] text-slate-400">Boom, chime, cash drops</div>
          </div>
          <input
            type="checkbox"
            checked={options.sfxEnabled}
            onChange={(e) =>
              setOptions((prev) => ({ ...prev, sfxEnabled: e.target.checked }))
            }
            className="rounded text-emerald-500 focus:ring-emerald-500 w-4 h-4 accent-emerald-500"
          />
        </label>

        <label className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
          options.captionsEnabled
            ? 'bg-indigo-500/10 border-indigo-500/30 shadow-sm'
            : 'bg-slate-950/60 border-slate-800/80 opacity-70 hover:opacity-100'
        }`}>
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-indigo-400" /> Captions
            </div>
            <div className="text-[10px] text-slate-400">Kinetic word pop-ins</div>
          </div>
          <input
            type="checkbox"
            checked={options.captionsEnabled}
            onChange={(e) =>
              setOptions((prev) => ({ ...prev, captionsEnabled: e.target.checked }))
            }
            className="rounded text-indigo-500 focus:ring-indigo-500 w-4 h-4 accent-indigo-500"
          />
        </label>
      </div>

      {/* Auto-Edit Optimization Stats Bar */}
      {lastResult && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 bg-slate-950/80 border border-emerald-500/30 rounded-2xl shadow-inner">
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-emerald-400" /> Dead Air Cut
            </div>
            <div className="text-lg font-extrabold text-emerald-400 font-mono">
              -{lastResult.stats.silenceRemovedSec}s
            </div>
            <div className="text-[10px] text-slate-500">
              {lastResult.stats.originalDurationSec}s → {lastResult.stats.trimmedDurationSec}s
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Scissors className="w-3 h-3 text-amber-400" /> Video Cuts
            </div>
            <div className="text-lg font-extrabold text-white font-mono">
              {lastResult.stats.cutsCount}
            </div>
            <div className="text-[10px] text-slate-500">tight segments</div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <ZoomIn className="w-3 h-3 text-pink-400" /> Punch Zooms
            </div>
            <div className="text-lg font-extrabold text-pink-400 font-mono">
              {lastResult.stats.punchZoomsCount}
            </div>
            <div className="text-[10px] text-slate-500">1.35x keyframes</div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Volume2 className="w-3 h-3 text-violet-400" /> SFX Triggers
            </div>
            <div className="text-lg font-extrabold text-violet-400 font-mono">
              {lastResult.stats.sfxCount}
            </div>
            <div className="text-[10px] text-slate-500">overlay clips</div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Type className="w-3 h-3 text-yellow-400" /> Captions
            </div>
            <div className="text-lg font-extrabold text-yellow-400 font-mono">
              {lastResult.stats.captionsCount}
            </div>
            <div className="text-[10px] text-slate-500">kinetic bursts</div>
          </div>
        </div>
      )}

      {/* Phase 5 & 6: Multi-Track Timeline UI, Canvas Preview Engine & Conversational AI Copilot */}
      <div className="space-y-6 pt-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Interactive Workstation: Preview Canvas, AI Copilot & Multi-Track Timeline
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 font-bold">
                <Sparkles className="w-3 h-3 text-pink-400" /> Live Sync
              </span>
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Real-time multi-track EDL synchronization with Gemini Flash state mutations. Keyboard shortcuts: <kbd className="px-1.5 py-0.5 bg-slate-900 rounded font-mono text-slate-300 border border-slate-800">Space</kbd> play/pause, <kbd className="px-1.5 py-0.5 bg-slate-900 rounded font-mono text-slate-300 border border-slate-800">S</kbd> split, <kbd className="px-1.5 py-0.5 bg-slate-900 rounded font-mono text-slate-300 border border-slate-800">Ctrl+Z</kbd> undo.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowJsonModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-mono font-medium border border-slate-800 hover:border-slate-700 transition-all shadow-sm cursor-pointer active:scale-95"
            >
              <FileCode className="w-3.5 h-3.5 text-indigo-400" /> View EDL JSON
            </button>

            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-600 via-indigo-500 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/25 active:scale-95 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-pink-200" />
              <span>Export MP4</span>
            </button>
          </div>
        </div>

        {/* Workstation Center Stage: 9:16 Canvas Preview Player on Left + AI Command Sidebar on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 flex justify-center">
            <PreviewPlayer
              videoSource={selectedFile}
              className="w-full max-w-sm shadow-2xl"
            />
          </div>

          <div className="lg:col-span-7">
            <CommandSidebar className="w-full shadow-2xl" />
          </div>
        </div>

        {/* Bottom: Full Multi-Track Timeline with Scrubber, Tracks and Toolbar */}
        <Timeline className="w-full shadow-2xl" />
      </div>

      {/* Full EDL JSON Modal */}
      {showJsonModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div className="flex items-center gap-2 font-bold text-sm text-white">
                <FileCode className="w-4 h-4 text-indigo-400" />
                Validated TimelineProject JSON Schema (EDL)
              </div>
              <button
                type="button"
                onClick={() => setShowJsonModal(false)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 bg-slate-800 rounded-lg"
              >
                Close
              </button>
            </div>
            <div className="p-4 overflow-y-auto font-mono text-xs text-slate-300 bg-slate-950/90">
              <pre>{JSON.stringify(project, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Phase 7: Client-Side FFmpeg MP4 Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        videoFile={selectedFile || null}
        project={project}
      />
    </div>
  );
}
export default SmartPolishAutoEdit;
