/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Type,
  Palette,
  Sliders,
  Check,
  Zap,
  Layers,
  Wand2,
  Clock,
  Flame,
  Layout,
  RefreshCw,
} from 'lucide-react';
import { useTimelineStore } from '../store/useTimelineStore';
import { TextClip, WordTimestamp } from '../types/timeline';

interface SubtitleInspectorProps {
  className?: string;
}

const FONT_PRESETS = [
  'Plus Jakarta Sans',
  'Playfair Display',
  'Montserrat',
  'Impact',
  'Bangers',
  'Outfit',
  'Inter',
];

export function SubtitleInspector({
  className = '',
}: SubtitleInspectorProps): React.ReactElement {
  const project = useTimelineStore((state) => state.project);
  const updateClip = useTimelineStore((state) => state.updateClip);

  // Find all text clips across project tracks
  const textTrack = project.tracks.find((t) => t.type === 'text');
  const textClips = (textTrack?.clips || []) as TextClip[];

  const [selectedClipId, setSelectedClipId] = useState<string | null>(
    textClips.length > 0 ? textClips[0].id : null
  );

  // Active Style State
  const activeClip = useMemo(() => {
    return textClips.find((c) => c.id === selectedClipId) || textClips[0] || null;
  }, [textClips, selectedClipId]);

  const [fontFamily, setFontFamily] = useState<string>('Plus Jakarta Sans');
  const [fontSize, setFontSize] = useState<number>(42);
  const [colorHex, setColorHex] = useState<string>('#ffffff');
  const [activeWordColorHex, setActiveWordColorHex] = useState<string>('#f59e0b');
  const [strokeColorHex, setStrokeColorHex] = useState<string>('#000000');
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [shadowColorHex, setShadowColorHex] = useState<string>('#6366f1');
  const [glowIntensity, setGlowIntensity] = useState<number>(60);
  const [bannerPillColorHex, setBannerPillColorHex] = useState<string>('#1e1b4b');
  const [animation, setAnimation] = useState<TextClip['style']['animation']>('karaoke');

  const [appliedBatchSuccess, setAppliedBatchSuccess] = useState(false);

  // Apply styles to selected single clip
  const handleApplySingle = () => {
    if (!activeClip || !textTrack) return;
    updateClip(textTrack.id, activeClip.id, {
      style: {
        ...activeClip.style,
        fontFamily,
        fontSize,
        colorHex,
        activeWordColorHex,
        strokeColorHex,
        strokeWidth,
        shadowColorHex,
        glowIntensity,
        bannerPillColorHex,
        animation,
      },
    } as Partial<TextClip>);
  };

  // Batch Apply styles to ALL text clips in project
  const handleBatchApplyAll = () => {
    if (!textTrack) return;
    textTrack.clips.forEach((clip) => {
      if (clip.type === 'text') {
        const textClip = clip as TextClip;
        updateClip(textTrack.id, textClip.id, {
          style: {
            ...textClip.style,
            fontFamily,
            fontSize,
            colorHex,
            activeWordColorHex,
            strokeColorHex,
            strokeWidth,
            shadowColorHex,
            glowIntensity,
            bannerPillColorHex,
            animation,
          },
        } as Partial<TextClip>);
      }
    });

    setAppliedBatchSuccess(true);
    setTimeout(() => setAppliedBatchSuccess(false), 2500);
  };

  return (
    <div className={`w-full bg-[#090e1c] border border-slate-800 rounded-2xl p-4 space-y-4 shadow-2xl text-slate-100 ${className}`}>
      {/* Inspector Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl text-white shadow-md">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Kinetic Subtitle & Caption Inspector
              <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">
                {textClips.length} Clips
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Karaoke word-by-word highlights, neon glow pulses, and batch subtitle styling
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleBatchApplyAll}
          className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer active:scale-95 transition-all"
        >
          {appliedBatchSuccess ? (
            <>
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              Applied to All!
            </>
          ) : (
            <>
              <Wand2 className="w-3.5 h-3.5" />
              Batch Apply All ({textClips.length})
            </>
          )}
        </button>
      </div>

      {/* Clip Selector Tabs if multiple clips exist */}
      {textClips.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {textClips.map((clip, idx) => (
            <button
              key={clip.id}
              type="button"
              onClick={() => setSelectedClipId(clip.id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                selectedClipId === clip.id
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              #{idx + 1}: "{clip.content.slice(0, 18)}{clip.content.length > 18 ? '...' : ''}"
            </button>
          ))}
        </div>
      )}

      {/* Kinetic Animation Preset Cards */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
          Kinetic Motion Style Preset
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { id: 'karaoke', name: '🎤 Karaoke', desc: 'Word-by-word active highlight' },
            { id: 'bouncePop', name: '💥 Bounce Pop', desc: 'Elastic spring pop scale' },
            { id: 'typewriter', name: '⌨️ Typewriter', desc: 'Sequential character typing' },
            { id: 'neonPulse', name: '⚡ Neon Pulse', desc: 'Electric pulsing drop shadow' },
            { id: 'bannerPill', name: '💊 Banner Pill', desc: 'Rounded solid backdrop' },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setAnimation(preset.id as TextClip['style']['animation']);
                handleApplySingle();
              }}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                animation === preset.id
                  ? 'bg-indigo-600/20 text-indigo-200 border-indigo-500 shadow-lg shadow-indigo-600/10'
                  : 'bg-slate-950/80 text-slate-400 hover:text-slate-200 border-slate-800'
              }`}
            >
              <div className="font-bold text-xs text-white">{preset.name}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">{preset.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Styling Controls Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#050914] p-3 rounded-xl border border-slate-800 text-xs">
        {/* Font Family */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase block">Font Family</label>
          <select
            value={fontFamily}
            onChange={(e) => {
              setFontFamily(e.target.value);
              handleApplySingle();
            }}
            className="w-full bg-slate-900 text-slate-200 border border-slate-800 rounded-lg px-2 py-1.5 font-medium cursor-pointer"
          >
            {FONT_PRESETS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        {/* Font Size */}
        <div className="space-y-1">
          <div className="flex justify-between text-slate-400">
            <label className="text-[10px] font-bold uppercase">Font Size</label>
            <span className="font-mono text-[10px] text-indigo-300">{fontSize}px</span>
          </div>
          <input
            type="range"
            min="20"
            max="96"
            value={fontSize}
            onChange={(e) => {
              setFontSize(Number(e.target.value));
              handleApplySingle();
            }}
            className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Primary Text Color */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase block">Base Text Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={colorHex}
              onChange={(e) => {
                setColorHex(e.target.value);
                handleApplySingle();
              }}
              className="w-8 h-7 rounded bg-transparent cursor-pointer border border-slate-700"
            />
            <span className="font-mono text-[10px] text-slate-300">{colorHex}</span>
          </div>
        </div>

        {/* Active Karaoke Highlight Word Color */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-amber-400 uppercase block">Karaoke Word Highlight</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={activeWordColorHex}
              onChange={(e) => {
                setActiveWordColorHex(e.target.value);
                handleApplySingle();
              }}
              className="w-8 h-7 rounded bg-transparent cursor-pointer border border-amber-500/40"
            />
            <span className="font-mono text-[10px] text-amber-300">{activeWordColorHex}</span>
          </div>
        </div>

        {/* Text Stroke Color & Width */}
        <div className="space-y-1">
          <div className="flex justify-between text-slate-400">
            <label className="text-[10px] font-bold uppercase">Stroke Outline</label>
            <span className="font-mono text-[10px] text-indigo-300">{strokeWidth}px</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={strokeColorHex}
              onChange={(e) => {
                setStrokeColorHex(e.target.value);
                handleApplySingle();
              }}
              className="w-6 h-6 rounded bg-transparent cursor-pointer border border-slate-700"
            />
            <input
              type="range"
              min="0"
              max="12"
              value={strokeWidth}
              onChange={(e) => {
                setStrokeWidth(Number(e.target.value));
                handleApplySingle();
              }}
              className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Text Glow Intensity */}
        <div className="space-y-1">
          <div className="flex justify-between text-slate-400">
            <label className="text-[10px] font-bold uppercase">Neon Glow Intensity</label>
            <span className="font-mono text-[10px] text-indigo-300">{glowIntensity}%</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={shadowColorHex}
              onChange={(e) => {
                setShadowColorHex(e.target.value);
                handleApplySingle();
              }}
              className="w-6 h-6 rounded bg-transparent cursor-pointer border border-slate-700"
            />
            <input
              type="range"
              min="0"
              max="100"
              value={glowIntensity}
              onChange={(e) => {
                setGlowIntensity(Number(e.target.value));
                handleApplySingle();
              }}
              className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Banner Pill Backdrop Color */}
        <div className="space-y-1 col-span-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase block">Banner Pill Background Box</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={bannerPillColorHex}
              onChange={(e) => {
                setBannerPillColorHex(e.target.value);
                handleApplySingle();
              }}
              className="w-7 h-7 rounded bg-transparent cursor-pointer border border-slate-700"
            />
            <span className="font-mono text-[10px] text-slate-300">{bannerPillColorHex}</span>
            <span className="text-[10px] text-slate-500 ml-auto">(Used for Banner Pill mode)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
export default SubtitleInspector;
