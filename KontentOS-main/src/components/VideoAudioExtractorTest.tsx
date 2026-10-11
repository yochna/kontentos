/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Film,
  Music,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  Terminal,
  FileCheck,
  RefreshCw,
  Sparkles,
  Loader2,
  Volume2,
  Folder,
  Undo2,
  Redo2,
  Scissors,
  Type,
  Trash2,
  Magnet,
  Maximize2,
  Lightbulb,
  FileText,
  Check,
  Settings,
  Share2,
  Wand2,
  Sliders,
  MoreVertical,
  ChevronDown,
  ChevronRight,
  Plus,
  Video,
  Layers,
  Edit3,
  Copy,
  Hash,
  Palette,
  ExternalLink,
  Download,
  X,
  RotateCcw,
  SkipBack,
  SkipForward,
  PanelLeftClose,
  PanelLeftOpen,
  PanelLeft,
  Zap,
  Calendar,
} from 'lucide-react';
import { useFFmpegAudioExtractor } from '../hooks/useFFmpegAudioExtractor';
import { useLocalWhisper } from '../hooks/useLocalWhisper';
import { useTimelineStore } from '../store/useTimelineStore';
import { PreviewPlayer } from './editor/PreviewPlayer';
import { Timeline } from './editor/Timeline';
import { CommandSidebar } from './editor/CommandSidebar';
import { ExportModal } from './editor/ExportModal';
import { SubtitleInspector } from './SubtitleInspector';
import { requestAutoEdit, requestEditorCommand } from '../services/aiEditorService';

interface SubtitleLine {
  id: string;
  timeRange: string;
  startSec: number;
  endSec: number;
  text: string;
}

const DEFAULT_SUBTITLES: SubtitleLine[] = [
  {
    id: 'sub-1',
    timeRange: '00:00-00:02',
    startSec: 0,
    endSec: 2,
    text: 'Hey everyone!',
  },
  {
    id: 'sub-2',
    timeRange: '00:03-00:06',
    startSec: 3,
    endSec: 6,
    text: 'Check out my top tips for editing vertical video!',
  },
  {
    id: 'sub-3',
    timeRange: '00:03-00:06',
    startSec: 3,
    endSec: 6,
    text: 'Check out mwy top tips editor for editing vertical video!',
  },
  {
    id: 'sub-4',
    timeRange: '00:05-00:12',
    startSec: 5,
    endSec: 12,
    text: 'Check out my top tips for...',
  },
];

const SUBTITLE_PRESETS = [
  {
    name: 'Viral Yellow',
    badge: '🔥 POPULAR',
    color: '#fbbf24',
    prompt: 'Update kinetic captions to bold neon yellow font (#fbbf24) with black stroke and pop-in animation',
  },
  {
    name: 'Cyber Cyan',
    badge: '⚡ TECH',
    color: '#38bdf8',
    prompt: 'Update kinetic captions to high-contrast cyan font (#38bdf8) with heavy drop shadow and slide-up animation',
  },
  {
    name: 'Neon Magenta',
    badge: '✨ VIBRANT',
    color: '#f43f5e',
    prompt: 'Update kinetic captions to vibrant electric magenta font (#f43f5e) with pulse glow effect',
  },
  {
    name: 'Clean Minimal',
    badge: '🎙️ SLEEK',
    color: '#ffffff',
    prompt: 'Update kinetic captions to clean white font (#ffffff) with subtle dark translucent pill background',
  },
  {
    name: 'Emerald Pop',
    badge: '💰 BOLD',
    color: '#34d399',
    prompt: 'Update kinetic captions to punchy emerald green font (#34d399) with bold typography',
  },
];

export function VideoAudioExtractorTest(): React.ReactElement {
  // Engines & Hooks
  const {
    isReady: isFFmpegReady,
    isLoading: isFFmpegLoading,
    isExtracting,
    progress: ffmpegProgress,
    error: ffmpegError,
    logs: ffmpegLogs,
    initEngine: initFFmpeg,
    extractAudio,
    resetError: resetFFmpegError,
  } = useFFmpegAudioExtractor();

  const {
    modelReady: isWhisperReady,
    isLoadingModel: isWhisperLoading,
    isTranscribing,
    device: whisperDevice,
    statusText: whisperStatus,
    downloadProgress: whisperDownloadProgress,
    words,
    fullTranscript,
    error: whisperError,
    loadModel: initWhisperModel,
    transcribeAudio,
    resetError: resetWhisperError,
  } = useLocalWhisper();

  const {
    project,
    currentTime,
    isPlaying,
    setCurrentTime,
    setIsPlaying,
    undo,
    redo,
    history,
    hydrateFromEDL,
    applyMutation,
    loadSourceVideoFile,
    updateProjectDuration,
    splitClip,
    deleteClip,
    selectedClipIds,
  } = useTimelineStore();

  // Local State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedWavUrl, setExtractedWavUrl] = useState<string | null>(null);
  const [rawWavBuffer, setRawWavBuffer] = useState<ArrayBuffer | null>(null);
  const [extractedStats, setExtractedStats] = useState<{
    byteLength: number;
    durationEstimateSec: number;
  } | null>(null);

  // Toggle state for outer navigation sidebar (desktop-sidebar)
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(() => {
    if (typeof document !== 'undefined') {
      const sidebar = document.getElementById('desktop-sidebar');
      return sidebar ? !sidebar.classList.contains('collapsed') : true;
    }
    return true;
  });

  const toggleDesktopSidebar = () => {
    const sidebar = document.getElementById('desktop-sidebar');
    if (sidebar) {
      sidebar.classList.toggle('collapsed');
      setIsDesktopSidebarOpen(!sidebar.classList.contains('collapsed'));
    }
  };

  const [activeTab, setActiveTab] = useState<'Project' | 'Edit' | 'Share'>('Edit');
  const [leftNavTab, setLeftNavTab] = useState<'Assets' | 'Effects' | 'Text' | 'Audio' | 'Settings'>('Assets');

  const [showExportModal, setShowExportModal] = useState(false);
  const [showAssetsModal, setShowAssetsModal] = useState(false);
  const [showCopilotModal, setShowCopilotModal] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState('');

  // Subtitles state
  const [subtitles, setSubtitles] = useState<SubtitleLine[]>(DEFAULT_SUBTITLES);
  const [editingSubId, setEditingSubId] = useState<string | null>(null);

  // Mobile Workspace Tab State (for Phones & Small Viewports)
  const [mobileTab, setMobileTab] = useState<'preview' | 'subtitles' | 'tools'>('preview');
  const [showFullTimelineOnMobile, setShowFullTimelineOnMobile] = useState(false);
  const [showAdvancedInspectorOnMobile, setShowAdvancedInspectorOnMobile] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  // Total Duration Computation across all timeline tracks
  const totalDuration = useMemo(() => {
    let max = project.projectMetadata.totalDuration || 10;
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        const end = clip.startOnTimeline + clip.duration;
        if (end > max) max = end;
      }
    }
    return Math.max(max, 1);
  }, [project]);

  // Mobile Time Formatter (mm:ss.s)
  const formatMobileTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  // Quick Schedule Bridge to Schedule Planner Modal
  const handleQuickSchedule = () => {
    const videoTitle =
      project.projectMetadata.title ||
      (selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, '') : 'Smart Editor Reel');
    const subsText = subtitles.map((s) => s.text).filter(Boolean).join(' ');
    const fileUrl = selectedFile ? URL.createObjectURL(selectedFile) : '';

    const detail = {
      videoId: `vid_${Date.now()}`,
      title: videoTitle,
      fileUrl: fileUrl,
      caption: subsText ? `✨ ${videoTitle}\n\n${subsText}` : `✨ Check out our latest breakdown on ${videoTitle}!`,
      hashtags: ['#CreatorEconomy', '#ViralReels', '#VideoMarketing', '#KontentOS', '#GrowFast'],
      initialPlatform: 'instagram',
      redirectToSchedule: true,
    };

    if (typeof window !== 'undefined' && window.KontentOS?.openScheduleModal) {
      window.KontentOS.openScheduleModal(detail);
    } else {
      window.dispatchEvent(new CustomEvent('kontentos:schedule-reel', { detail }));
    }
  };

  // Mobile Split at Playhead
  const handleMobileSplit = () => {
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (
          currentTime > clip.startOnTimeline + 0.05 &&
          currentTime < clip.startOnTimeline + clip.duration - 0.05
        ) {
          splitClip(clip.id, currentTime);
          return;
        }
      }
    }
  };

  // Mobile Delete Active or Selected Clip
  const handleMobileDelete = () => {
    if (selectedClipIds.length > 0) {
      selectedClipIds.forEach((id) => deleteClip(id));
      return;
    }
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (
          currentTime >= clip.startOnTimeline &&
          currentTime <= clip.startOnTimeline + clip.duration
        ) {
          deleteClip(clip.id);
          return;
        }
      }
    }
  };

  // Mobile Jump Time (-1s / +1s)
  const handleJumpTime = (delta: number) => {
    const next = Math.max(0, Math.min(totalDuration, currentTime + delta));
    setCurrentTime(next);
  };

  // Mobile Auto Silence Remover
  const handleAutoCutSilence = async () => {
    setIsProcessingAi(true);
    setAiStatusMessage('AI scanning & cutting dead-air silence...');
    try {
      const mutated = await requestEditorCommand(
        project,
        'Auto-detect silent pauses longer than 0.5s and ripple delete dead-air gaps'
      );
      applyMutation(mutated.project, true);
    } catch (err: any) {
      console.error('Silence cut error:', err);
    } finally {
      setIsProcessingAi(false);
      setAiStatusMessage('');
    }
  };

  // 1-Tap Subtitle Preset Stylist
  const applySubtitlePreset = async (styleName: string, promptText: string) => {
    setIsProcessingAi(true);
    setAiStatusMessage(`Applying ${styleName} subtitle style...`);
    try {
      const mutated = await requestEditorCommand(project, promptText);
      applyMutation(mutated.project, true);
    } catch (err: any) {
      console.error('Preset error:', err);
    } finally {
      setIsProcessingAi(false);
      setAiStatusMessage('');
    }
  };

  // Copy Full Transcript
  const handleCopyTranscript = () => {
    const fullText = subtitles.map((s) => s.text).join('\n');
    navigator.clipboard.writeText(fullText);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  // Platform Exports Toggles
  const [platformExports, setPlatformExports] = useState({
    instagram: true,
    tiktok: true,
    youtube: false,
    custom: false,
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto update subtitles when Whisper STT words finish
  useEffect(() => {
    if (words && words.length > 0) {
      const newSubs: SubtitleLine[] = [];
      const chunkSize = 4;
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize);
        const start = chunk[0].start;
        const end = chunk[chunk.length - 1].end;
        const text = chunk.map((w) => w.word).join(' ');

        const formatTime = (s: number) => {
          const m = Math.floor(s / 60);
          const sec = Math.floor(s % 60);
          return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        };

        newSubs.push({
          id: `sub_whisper_${i}`,
          timeRange: `${formatTime(start)}-${formatTime(end)}`,
          startSec: start,
          endSec: end,
          text,
        });
      }
      setSubtitles(newSubs);
    }
  }, [words]);

  // Clean up WAV URL
  useEffect(() => {
    return () => {
      if (extractedWavUrl) {
        URL.revokeObjectURL(extractedWavUrl);
      }
    };
  }, [extractedWavUrl]);

  // Handle File Selection & Auto-Demux
  const handleFileSelect = async (file: File) => {
    resetFFmpegError();
    resetWhisperError();
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mov|webm|mkv|avi|m4v)$/i)) {
      alert('Please upload a valid video file (.mp4, .mov, .webm, .mkv)');
      return;
    }

    setSelectedFile(file);
    setShowAssetsModal(false);

    if (extractedWavUrl) {
      URL.revokeObjectURL(extractedWavUrl);
      setExtractedWavUrl(null);
      setRawWavBuffer(null);
      setExtractedStats(null);
    }

    try {
      const buffer = await extractAudio(file);
      const bufferClone = buffer.slice(0);
      setRawWavBuffer(bufferClone);

      const blob = new Blob([buffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      setExtractedWavUrl(url);

      const durationEstimate = Math.max(0, (buffer.byteLength - 44) / 32000);
      setExtractedStats({
        byteLength: buffer.byteLength,
        durationEstimateSec: Math.round(durationEstimate * 10) / 10,
      });

      loadSourceVideoFile(file, durationEstimate > 0 ? durationEstimate : 30);

      if (isWhisperReady && bufferClone.byteLength > 0) {
        await transcribeAudio(bufferClone);
      }
    } catch (err) {
      console.error('Audio extraction failed:', err);
    }
  };

  // AI Actions Trigger
  const handleAiCatchphrase = async () => {
    setIsProcessingAi(true);
    setAiStatusMessage('Generating Creative Catchphrase with Gemini...');
    try {
      const mutated = await requestEditorCommand(
        project,
        'Add creative catchy headline caption at the top of the video in bold cyan font'
      );
      applyMutation(mutated.project, true);
    } catch (err: any) {
      console.error('Catchphrase generation error:', err);
    } finally {
      setIsProcessingAi(false);
      setAiStatusMessage('');
    }
  };

  const handleAiHashtags = async () => {
    setIsProcessingAi(true);
    setAiStatusMessage('Adding Trending Hashtags (#VerticalVideo #EditingTips)...');
    try {
      const mutated = await requestEditorCommand(
        project,
        'Add trending hashtags #VerticalVideo #EditingTips at the bottom of the captions'
      );
      applyMutation(mutated.project, true);
    } catch (err: any) {
      console.error('Hashtag error:', err);
    } finally {
      setIsProcessingAi(false);
      setAiStatusMessage('');
    }
  };

  const handleAiDynamicStyle = async () => {
    setIsProcessingAi(true);
    setAiStatusMessage('Applying Kinetic Dynamic Text Style...');
    try {
      const mutated = await requestEditorCommand(
        project,
        'Update kinetic captions to high-contrast neon yellow color with popIn animation'
      );
      applyMutation(mutated.project, true);
    } catch (err: any) {
      console.error('Dynamic style error:', err);
    } finally {
      setIsProcessingAi(false);
      setAiStatusMessage('');
    }
  };

  // Subtitle edit handler
  const handleSubtitleTextChange = (id: string, newText: string) => {
    setSubtitles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, text: newText } : item))
    );
  };

  return (
    <div className="w-full h-screen bg-[#0e121d] text-slate-100 flex flex-col font-sans select-none overflow-hidden">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.mov,.webm,.mkv"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
          }
        }}
      />

      {/* TOP KONTENTOS HEADER NAVBAR */}
      <header className="h-14 bg-[#0f1422] border-b border-[#1c2438] px-3 sm:px-4 flex items-center justify-between z-30 shrink-0">
        {/* Left: Brand Logo & Breadcrumb */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Toggle Outer Desktop Sidebar Button (Desktop only) */}
          <button
            type="button"
            onClick={toggleDesktopSidebar}
            className="hidden lg:flex p-1.5 text-slate-400 hover:text-white hover:bg-[#1a2236] rounded-lg transition-colors cursor-pointer"
            title={isDesktopSidebarOpen ? 'Collapse Outer Sidebar' : 'Expand Outer Sidebar'}
          >
            {isDesktopSidebarOpen ? (
              <PanelLeftClose className="w-5 h-5 text-blue-400" />
            ) : (
              <PanelLeftOpen className="w-5 h-5 text-blue-400" />
            )}
          </button>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-blue-600/30 shrink-0">
              K
            </div>
            <div>
              <span className="font-extrabold text-sm tracking-tight text-white leading-none block">
                KontentOS
              </span>
              <span className="text-[10px] text-slate-400 font-medium leading-none block mt-0.5">
                Raw-to-Reel
              </span>
            </div>
          </div>

          <div className="h-4 w-[1px] bg-[#222d46] mx-1 hidden sm:block" />

          <div className="text-xs text-slate-300 font-medium hidden sm:flex items-center gap-1.5">
            <span className="text-slate-400">Raw-to-Reel</span>
            <span className="text-slate-600">/</span>
            <span className="text-white font-semibold">Video Editor</span>
          </div>
        </div>

        {/* Center: Nav Switcher Tabs (Hidden on mobile) */}
        <div className="hidden md:flex items-center gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('Project')}
            className={`flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'Project'
                ? 'text-blue-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Folder className="w-4 h-4 text-slate-400" />
            <span>Project</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('Edit')}
            className={`flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'Edit'
                ? 'text-blue-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Edit3 className="w-4 h-4 text-blue-500" />
            <span>Edit</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('Share');
              handleQuickSchedule();
            }}
            className={`flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'Share'
                ? 'text-indigo-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Schedule and Cross-Post Reel"
          >
            <Calendar className="w-4 h-4 text-indigo-400" />
            <span>Schedule</span>
          </button>
        </div>

        {/* Right: Actions (Undo, Redo, Schedule, Export) */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={history.past.length === 0}
            className="p-2 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-[#1a2236] transition-colors cursor-pointer"
            title="Undo"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={redo}
            disabled={history.future.length === 0}
            className="p-2 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-[#1a2236] transition-colors cursor-pointer"
            title="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleQuickSchedule}
            className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/35 rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-600/10 cursor-pointer active:scale-95"
            title="Schedule this reel directly to Calendar"
          >
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Schedule</span>
          </button>

          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-blue-600/30 cursor-pointer active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* MOBILE SEGMENTED VIEW CONTROLLER (Touch-optimized for Phones < lg) */}
      <div className="lg:hidden flex items-center bg-[#0b0f1a] border-b border-[#1c2438] p-1.5 gap-1 shrink-0 sticky top-0 z-20">
        <button
          type="button"
          onClick={() => setMobileTab('preview')}
          className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] ${
            mobileTab === 'preview'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-slate-200 bg-[#121828]'
          }`}
        >
          <Video className="w-4 h-4" />
          <span>Edit & Cut</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('subtitles')}
          className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] ${
            mobileTab === 'subtitles'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-slate-200 bg-[#121828]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Subtitles ({subtitles.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('tools')}
          className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] ${
            mobileTab === 'tools'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-slate-200 bg-[#121828]'
          }`}
        >
          <Wand2 className="w-4 h-4" />
          <span>AI Magic</span>
        </button>
      </div>

      {/* MAIN WORKSPACE BODY */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT TOOLBAR COLUMN (DESKTOP ONLY) */}
        <aside className="hidden lg:flex w-16 bg-[#101522] border-r border-[#1d263b] flex-col items-center py-3 gap-5 shrink-0 z-20">
          <button
            type="button"
            onClick={() => {
              setLeftNavTab('Assets');
              setShowAssetsModal(true);
            }}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer w-12 ${
              leftNavTab === 'Assets'
                ? 'text-blue-400 bg-blue-500/10 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#182136]'
            }`}
          >
            <Video className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Assets</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setLeftNavTab('Effects');
              setShowCopilotModal(true);
            }}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer w-12 ${
              leftNavTab === 'Effects'
                ? 'text-blue-400 bg-blue-500/10 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#182136]'
            }`}
          >
            <Wand2 className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Effects</span>
          </button>

          <button
            type="button"
            onClick={() => setLeftNavTab('Text')}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer w-12 ${
              leftNavTab === 'Text'
                ? 'text-blue-400 bg-blue-500/10 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#182136]'
            }`}
          >
            <Type className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Text</span>
          </button>

          <button
            type="button"
            onClick={() => setLeftNavTab('Audio')}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer w-12 ${
              leftNavTab === 'Audio'
                ? 'text-blue-400 bg-blue-500/10 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#182136]'
            }`}
          >
            <Music className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Audio</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setLeftNavTab('Settings');
              setShowLogs(!showLogs);
            }}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all cursor-pointer w-12 ${
              leftNavTab === 'Settings'
                ? 'text-blue-400 bg-blue-500/10 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#182136]'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Settings</span>
          </button>
        </aside>

        {/* CENTER COLUMN: PREVIEW PLAYER CANVAS & TIMELINE */}
        <div className={`flex-1 flex-col overflow-hidden bg-[#090d17] ${mobileTab === 'preview' ? 'flex' : 'hidden lg:flex'}`}>
          {/* PREVIEW PLAYER CANVAS CONTAINER */}
          <div className="flex-1 flex flex-col items-center justify-center relative p-1.5 sm:p-4 min-h-0 overflow-hidden">
            <PreviewPlayer
              videoSource={selectedFile}
              className="w-full max-w-sm h-full max-h-[460px] shadow-2xl"
              onFileSelect={handleFileSelect}
            />

            {/* AI Status Notification Overlay */}
            {isProcessingAi && (
              <div className="absolute top-3 inset-x-auto px-4 py-2 bg-blue-600/90 text-white rounded-xl text-xs font-semibold shadow-xl flex items-center gap-2 animate-pulse z-40">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{aiStatusMessage}</span>
              </div>
            )}
          </div>

          {/* SIMPLIFIED MOBILE SCRUBBER & CUT DECK (Only rendered on phones/tablets < lg) */}
          <div className="lg:hidden border-t border-[#1d263b] bg-[#0c101d] shrink-0 p-3 space-y-2.5 shadow-2xl">
            {/* Timecode & Scrubber */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 font-bold px-1">
                <span className="text-blue-400">{formatMobileTime(currentTime)}</span>
                <span className="text-slate-500">Duration: {formatMobileTime(totalDuration)}</span>
              </div>
              <input
                type="range"
                min="0"
                max={totalDuration}
                step="0.05"
                value={currentTime}
                onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-800 accent-blue-500 rounded-lg cursor-pointer"
              />
            </div>

            {/* Primary Thumb Control Row (Large touch targets) */}
            <div className="flex items-center justify-between gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => handleJumpTime(-1)}
                className="flex-1 py-2.5 bg-[#141b2c] hover:bg-[#1a233a] border border-[#232f48] rounded-xl text-xs font-bold text-slate-300 flex items-center justify-center gap-1 active:scale-95 cursor-pointer min-h-[44px]"
                title="Back 1 Second"
              >
                <SkipBack className="w-3.5 h-3.5" /> -1s
              </button>

              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-600/40 active:scale-90 transition-transform cursor-pointer shrink-0"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>

              <button
                type="button"
                onClick={() => handleJumpTime(1)}
                className="flex-1 py-2.5 bg-[#141b2c] hover:bg-[#1a233a] border border-[#232f48] rounded-xl text-xs font-bold text-slate-300 flex items-center justify-center gap-1 active:scale-95 cursor-pointer min-h-[44px]"
                title="Forward 1 Second"
              >
                +1s <SkipForward className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleMobileSplit}
                className="px-3.5 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-400 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer min-h-[44px]"
                title="Split Clip at Playhead"
              >
                <Scissors className="w-4 h-4" />
                <span>Split</span>
              </button>

              <button
                type="button"
                onClick={handleMobileDelete}
                className="p-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-xl text-xs font-bold flex items-center justify-center active:scale-95 cursor-pointer min-h-[44px] min-w-[44px]"
                title="Delete Selected or Current Clip"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Action Pills Carousel */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 no-scrollbar text-xs font-semibold">
              <button
                type="button"
                onClick={() => setShowAssetsModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#141b2d] hover:bg-[#1c263e] text-slate-200 border border-[#222e48] rounded-xl whitespace-nowrap active:scale-95 shrink-0"
              >
                <Video className="w-3.5 h-3.5 text-blue-400" />
                <span>Import Video</span>
              </button>

              <button
                type="button"
                onClick={handleAutoCutSilence}
                disabled={isProcessingAi}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 rounded-xl whitespace-nowrap active:scale-95 shrink-0"
              >
                <Zap className="w-3.5 h-3.5 text-blue-400" />
                <span>Auto-Cut Silence</span>
              </button>

              <button
                type="button"
                onClick={() => setMobileTab('subtitles')}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#141b2d] hover:bg-[#1c263e] text-slate-200 border border-[#222e48] rounded-xl whitespace-nowrap active:scale-95 shrink-0"
              >
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                <span>Subtitles</span>
              </button>

              <button
                type="button"
                onClick={handleAiDynamicStyle}
                disabled={isProcessingAi}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#141b2d] hover:bg-[#1c263e] text-slate-200 border border-[#222e48] rounded-xl whitespace-nowrap active:scale-95 shrink-0"
              >
                <Palette className="w-3.5 h-3.5 text-pink-400" />
                <span>Kinetic Style</span>
              </button>

              <button
                type="button"
                onClick={handleAiCatchphrase}
                disabled={isProcessingAi}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#141b2d] hover:bg-[#1c263e] text-slate-200 border border-[#222e48] rounded-xl whitespace-nowrap active:scale-95 shrink-0"
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                <span>Viral Hook</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCopilotModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 rounded-xl whitespace-nowrap active:scale-95 shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>AI Copilot</span>
              </button>
            </div>

            {/* Expandable Full Multi-Track Timeline Toggle (For Pro phone creators) */}
            <div>
              <button
                type="button"
                onClick={() => setShowFullTimelineOnMobile(!showFullTimelineOnMobile)}
                className="w-full py-1.5 text-[11px] font-bold text-slate-400 hover:text-slate-200 bg-[#0e1424] hover:bg-[#131b30] border border-[#1d273d] rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span>{showFullTimelineOnMobile ? '📱 Hide Detailed Multi-Track Timeline' : '📊 Show Full Multi-Track Timeline'}</span>
              </button>

              {showFullTimelineOnMobile && (
                <div className="h-[220px] mt-2 border border-[#202a42] rounded-xl bg-[#0d111d] overflow-x-auto">
                  <Timeline className="h-full w-full min-w-[500px]" />
                </div>
              )}
            </div>
          </div>

          {/* DESKTOP MULTI-TRACK TIMELINE (Always visible on lg screens) */}
          <div className="hidden lg:block h-[240px] sm:h-[270px] shrink-0 border-t border-[#1d263b] bg-[#0d111d] overflow-x-auto">
            <Timeline className="h-full w-full min-w-[500px] lg:min-w-0" />
          </div>
        </div>

        {/* RIGHT SIDEBAR: SUBTITLES EDITOR */}
        <aside className={`w-full lg:w-88 bg-[#0f1422] lg:border-l border-[#1d263b] flex-col shrink-0 overflow-y-auto p-3 sm:p-4 space-y-3.5 text-slate-200 ${mobileTab === 'subtitles' ? 'flex flex-1' : 'hidden lg:flex'}`}>
          {/* MOBILE 1-TAP KINETIC PRESETS RIBBON */}
          <div className="lg:hidden bg-[#131929] border border-[#222c44] rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-pink-400" />
                1-Tap Kinetic Caption Styles
              </span>
              <span className="text-[10px] text-pink-400 font-bold uppercase tracking-wider">
                Instant
              </span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {SUBTITLE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => applySubtitlePreset(preset.name, preset.prompt)}
                  disabled={isProcessingAi}
                  className="px-3 py-2 bg-[#0c111e] hover:bg-[#182238] border border-[#232e48] rounded-xl text-left shrink-0 active:scale-95 transition-transform cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: preset.color }}
                    />
                    <span className="text-xs font-bold text-white whitespace-nowrap">
                      {preset.name}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 block mt-0.5">
                    {preset.badge}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* DESKTOP / ADVANCED SUBTITLE INSPECTOR */}
          <div className="hidden lg:block">
            <SubtitleInspector />
          </div>

          {/* MOBILE TOGGLE FOR ADVANCED SUBTITLE INSPECTOR */}
          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setShowAdvancedInspectorOnMobile(!showAdvancedInspectorOnMobile)}
              className="w-full py-2 bg-[#121828] hover:bg-[#182136] text-slate-300 border border-[#222d46] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-blue-400" />
              <span>
                {showAdvancedInspectorOnMobile
                  ? '▲ Hide Advanced Typography Settings'
                  : '▼ Open Advanced Typography & Shadows'}
              </span>
            </button>
            {showAdvancedInspectorOnMobile && (
              <div className="mt-2.5">
                <SubtitleInspector />
              </div>
            )}
          </div>

          {/* SUBTITLES EDITOR CARD */}
          <div className="bg-[#141a2a] border border-[#202940] rounded-2xl p-3.5 sm:p-4 shadow-xl space-y-3 relative">
            <div className="flex items-center justify-between pb-2 border-b border-[#1f283f]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-500/15 text-blue-400 rounded-lg border border-blue-500/20">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-white">
                    Subtitles ({subtitles.length})
                  </h3>
                  <span className="text-[10px] text-slate-400 font-medium block">
                    Tap timestamp to seek video
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyTranscript}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-500/10 px-2 py-1 rounded-lg border border-blue-500/20"
                title="Copy Full Transcript"
              >
                {copiedTranscript ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedTranscript ? 'Copied' : 'Copy All'}</span>
              </button>
            </div>

            {/* Subtitle Lines List */}
            <div className="space-y-2 max-h-64 sm:max-h-52 overflow-y-auto pr-0.5">
              {subtitles.map((sub) => {
                const isSelected = currentTime >= sub.startSec && currentTime <= sub.endSec;
                return (
                  <div
                    key={sub.id}
                    className={`p-2.5 rounded-xl border text-xs transition-all ${
                      isSelected
                        ? 'bg-[#182238] border-blue-500/80 border-l-4 border-l-blue-500 text-white shadow-md shadow-blue-500/10'
                        : 'bg-[#0d121f] border-[#1c2438] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="text-[10px] font-mono mb-1.5 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setCurrentTime(sub.startSec)}
                        className="bg-[#080d17] hover:bg-blue-600 hover:text-white text-blue-400 px-2 py-0.5 rounded-md border border-blue-500/20 font-bold transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>{sub.timeRange}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubtitles((prev) => prev.filter((s) => s.id !== sub.id))}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors"
                        title="Delete Subtitle Line"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={sub.text}
                      onChange={(e) => handleSubtitleTextChange(sub.id, e.target.value)}
                      className="w-full bg-[#080c14] border border-[#1c253b] focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none font-medium transition-colors"
                      placeholder="Enter caption text..."
                    />
                  </div>
                );
              })}
            </div>

            {/* Add Line Action */}
            <button
              type="button"
              onClick={() => {
                const start = Math.floor(currentTime);
                const end = start + 3;
                const format = (s: number) => {
                  const m = Math.floor(s / 60);
                  const sec = Math.floor(s % 60);
                  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
                };
                const newSub: SubtitleLine = {
                  id: `sub_manual_${Date.now()}`,
                  timeRange: `${format(start)}-${format(end)}`,
                  startSec: start,
                  endSec: end,
                  text: 'New subtitle caption line...',
                };
                setSubtitles((prev) => [...prev, newSub]);
              }}
              className="w-full py-2.5 bg-[#0d121f] hover:bg-[#182136] text-blue-400 hover:text-blue-300 border border-[#1f283f] hover:border-blue-500/40 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[44px]"
            >
              <Plus className="w-4 h-4" /> Add Subtitle at Current Time
            </button>
          </div>

          {/* AI CAPTION TOOLS */}
          <div className="bg-gradient-to-b from-[#181e30] to-[#121726] border border-amber-500/50 rounded-2xl p-3.5 shadow-xl space-y-2.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-[#242f48]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
                  AI Caption Hooks
                </h3>
              </div>
              <span className="text-[9px] font-bold text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                Gemini
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
              <button
                type="button"
                onClick={handleAiCatchphrase}
                disabled={isProcessingAi}
                className="w-full p-2.5 bg-[#172034] hover:bg-[#1e2a44] border border-amber-500/30 rounded-xl flex items-center justify-between text-xs transition-all cursor-pointer min-h-[44px]"
              >
                <div className="flex items-center gap-2 text-left">
                  <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-bold text-white text-xs">Viral Opening Hook</div>
                    <div className="text-[10px] text-slate-400">Add catchy headline</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  Generate
                </span>
              </button>

              <button
                type="button"
                onClick={handleAiHashtags}
                disabled={isProcessingAi}
                className="w-full p-2.5 bg-[#172034] hover:bg-[#1e2a44] border border-pink-500/30 rounded-xl flex items-center justify-between text-xs transition-all cursor-pointer min-h-[44px]"
              >
                <div className="flex items-center gap-2 text-left">
                  <Hash className="w-4 h-4 text-pink-400 shrink-0" />
                  <div>
                    <div className="font-bold text-white text-xs">Trending Hashtags</div>
                    <div className="text-[10px] text-slate-400">Auto-add tags</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-pink-300 bg-pink-500/10 px-2 py-0.5 rounded border border-pink-500/20">
                  Generate
                </span>
              </button>
            </div>
          </div>
        </aside>

        {/* MOBILE AI TOOLS PANEL (when mobileTab === 'tools' on phones) */}
        <div className={`lg:hidden flex-1 overflow-y-auto p-3.5 bg-[#090d17] space-y-3.5 ${mobileTab === 'tools' ? 'block' : 'hidden'}`}>
          <div className="bg-[#121828] border border-[#202b44] rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#1f283f]">
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-white">
                  Mobile Creator AI Deck
                </h3>
              </div>
              <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20">
                1-Tap Tools
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleAutoCutSilence}
                disabled={isProcessingAi}
                className="p-3.5 bg-[#162035] hover:bg-[#1e2a47] border border-blue-500/30 rounded-xl flex flex-col items-center gap-2 text-center transition-all cursor-pointer active:scale-95"
              >
                <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-xl">
                  <Zap className="w-5 h-5" />
                </div>
                <div className="font-bold text-xs text-white">Auto-Cut Silence</div>
                <div className="text-[10px] text-slate-400">Remove dead-air pauses</div>
              </button>

              <button
                type="button"
                onClick={handleAiCatchphrase}
                disabled={isProcessingAi}
                className="p-3.5 bg-[#162035] hover:bg-[#1e2a47] border border-amber-500/30 rounded-xl flex flex-col items-center gap-2 text-center transition-all cursor-pointer active:scale-95"
              >
                <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl">
                  <Lightbulb className="w-5 h-5" />
                </div>
                <div className="font-bold text-xs text-white">Viral Hook</div>
                <div className="text-[10px] text-slate-400">Opening catchphrase</div>
              </button>

              <button
                type="button"
                onClick={handleAiHashtags}
                disabled={isProcessingAi}
                className="p-3.5 bg-[#162035] hover:bg-[#1e2a47] border border-pink-500/30 rounded-xl flex flex-col items-center gap-2 text-center transition-all cursor-pointer active:scale-95"
              >
                <div className="p-2.5 bg-pink-500/20 text-pink-400 rounded-xl">
                  <Hash className="w-5 h-5" />
                </div>
                <div className="font-bold text-xs text-white">Trending Tags</div>
                <div className="text-[10px] text-slate-400">Reels / Shorts tags</div>
              </button>

              <button
                type="button"
                onClick={handleAiDynamicStyle}
                disabled={isProcessingAi}
                className="p-3.5 bg-[#162035] hover:bg-[#1e2a47] border border-emerald-500/30 rounded-xl flex flex-col items-center gap-2 text-center transition-all cursor-pointer active:scale-95"
              >
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl">
                  <Palette className="w-5 h-5" />
                </div>
                <div className="font-bold text-xs text-white">Kinetic Subtitles</div>
                <div className="text-[10px] text-slate-400">Neon pop animations</div>
              </button>

              <button
                type="button"
                onClick={() => setShowCopilotModal(true)}
                className="p-3.5 bg-[#162035] hover:bg-[#1e2a47] border border-purple-500/30 rounded-xl flex flex-col items-center gap-2 text-center transition-all cursor-pointer active:scale-95"
              >
                <div className="p-2.5 bg-purple-500/20 text-purple-400 rounded-xl">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="font-bold text-xs text-white">AI Copilot</div>
                <div className="text-[10px] text-slate-400">Natural prompt editing</div>
              </button>

              <button
                type="button"
                onClick={() => setShowAssetsModal(true)}
                className="p-3.5 bg-[#162035] hover:bg-[#1e2a47] border border-[#253352] rounded-xl flex flex-col items-center gap-2 text-center transition-all cursor-pointer active:scale-95"
              >
                <div className="p-2.5 bg-blue-500/15 text-blue-400 rounded-xl">
                  <Video className="w-5 h-5" />
                </div>
                <div className="font-bold text-xs text-white">Import Video</div>
                <div className="text-[10px] text-slate-400">Select MP4/MOV</div>
              </button>

              <button
                type="button"
                onClick={handleCopyTranscript}
                className="p-3.5 bg-[#162035] hover:bg-[#1e2a47] border border-[#253352] rounded-xl flex flex-col items-center gap-2 text-center transition-all cursor-pointer active:scale-95"
              >
                <div className="p-2.5 bg-cyan-500/15 text-cyan-400 rounded-xl">
                  {copiedTranscript ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                </div>
                <div className="font-bold text-xs text-white">
                  {copiedTranscript ? 'Copied!' : 'Copy Transcript'}
                </div>
                <div className="text-[10px] text-slate-400">All captions to clipboard</div>
              </button>

              <button
                type="button"
                onClick={() => setShowLogs(!showLogs)}
                className="p-3.5 bg-[#162035] hover:bg-[#1e2a47] border border-[#253352] rounded-xl flex flex-col items-center gap-2 text-center transition-all cursor-pointer active:scale-95"
              >
                <div className="p-2.5 bg-amber-500/15 text-amber-400 rounded-xl">
                  <Terminal className="w-5 h-5" />
                </div>
                <div className="font-bold text-xs text-white">WASM Logs</div>
                <div className="text-[10px] text-slate-400">Engine console</div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ASSETS MODAL / FILE UPLOADER */}
      {showAssetsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121828] border border-[#232f4a] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowAssetsModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Import Video Asset</h3>
                <p className="text-xs text-slate-400">
                  Select a video file (.mp4, .mov, .webm) to demux audio and generate captions.
                </p>
              </div>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#283554] hover:border-blue-500 bg-[#0a0f1d] hover:bg-[#0e1529] rounded-2xl p-8 text-center cursor-pointer transition-all space-y-3"
            >
              <Video className="w-10 h-10 text-blue-400 mx-auto animate-bounce" />
              <div>
                <div className="text-sm font-semibold text-white">
                  Click to select video or drop file here
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Processes 100% locally in browser via FFmpeg WASM
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI COPILOT MODAL */}
      {showCopilotModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121828] border border-[#232f4a] rounded-2xl max-w-xl w-full p-4 relative shadow-2xl">
            <button
              type="button"
              onClick={() => setShowCopilotModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <CommandSidebar className="w-full border-none shadow-none" />
          </div>
        </div>
      )}

      {/* EXPORT MODAL */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        videoFile={selectedFile}
        project={project}
      />

      {/* WASM CONSOLE LOGS DRAWER */}
      {showLogs && (
        <div className="fixed bottom-0 inset-x-0 bg-[#090d16] border-t border-[#1f273d] z-50 p-4 max-h-56 overflow-y-auto font-mono text-xs text-slate-400 space-y-1 shadow-2xl">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1f273d] text-white">
            <span className="flex items-center gap-2 font-bold">
              <Terminal className="w-4 h-4 text-blue-400" /> FFmpeg WASM Virtual Console Logs
            </span>
            <button
              type="button"
              onClick={() => setShowLogs(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Close ✕
            </button>
          </div>
          {ffmpegLogs.length === 0 ? (
            <div className="text-slate-600 italic">No output logs recorded yet...</div>
          ) : (
            ffmpegLogs.map((log, idx) => (
              <div key={idx} className="leading-relaxed">
                <span className="text-blue-400 select-none mr-2">&gt;</span>
                {log}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default VideoAudioExtractorTest;
