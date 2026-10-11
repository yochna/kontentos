/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Search,
  Clock,
  Volume2,
  Copy,
  Check,
  Download,
  Flame,
  Scissors,
  Eye,
  Layers,
} from 'lucide-react';
import { WordTimestamp } from '../types/timeline';

interface TranscriptInspectorProps {
  words: WordTimestamp[];
  fullTranscript?: string;
  isTranscribing?: boolean;
  activeTime?: number;
  onSeek?: (timeSeconds: number) => void;
  device?: 'webgpu' | 'wasm' | null;
}

export function TranscriptInspector({
  words,
  fullTranscript,
  isTranscribing = false,
  activeTime = 0,
  onSeek,
  device,
}: TranscriptInspectorProps): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'tokens' | 'paragraph'>('tokens');

  // Compute stats: silence gaps (> 0.4s), word count, average duration
  const { filteredWords, silenceGapsCount, potentialHooks } = useMemo(() => {
    let gaps = 0;
    const hooks: number[] = [];

    const filtered = words.filter((w, idx) => {
      // Check for silence gap prior to this word
      if (idx > 0) {
        const prevEnd = words[idx - 1].end;
        if (w.start - prevEnd >= 0.4) {
          gaps++;
        }
      }

      // Detect potential hooks / trigger words for Phase 4
      const lower = w.word.toLowerCase();
      if (
        ['boom', 'money', 'secret', 'stop', 'listen', 'never', 'always', 'shocking', 'truth', 'huge', 'insane'].some(
          (trigger) => lower.includes(trigger)
        )
      ) {
        hooks.push(idx);
      }

      if (!searchQuery.trim()) return true;
      return w.word.toLowerCase().includes(searchQuery.toLowerCase().trim());
    });

    return {
      filteredWords: filtered,
      silenceGapsCount: gaps,
      potentialHooks: hooks,
    };
  }, [words, searchQuery]);

  const handleCopyTranscript = () => {
    const text = fullTranscript || words.map((w) => w.word).join(' ');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(words, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `transcript_whisper_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl space-y-4 p-5 text-slate-100">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">Word-Level Transcript</h3>
              {device && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                  {device}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              High-precision word alignments extracted locally by Whisper WebGPU
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyTranscript}
            disabled={words.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors disabled:opacity-50"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          <button
            type="button"
            onClick={handleExportJSON}
            disabled={words.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </button>
        </div>
      </div>

      {/* Metrics & Filter Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between">
          <span className="text-xs text-slate-400">Total Words</span>
          <span className="text-sm font-bold text-indigo-400 font-mono">{words.length}</span>
        </div>

        <div className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Scissors className="w-3.5 h-3.5 text-amber-400" />
            Silence Gaps
          </span>
          <span className="text-sm font-bold text-amber-400 font-mono">{silenceGapsCount}</span>
        </div>

        <div className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-pink-400" />
            SFX Keywords
          </span>
          <span className="text-sm font-bold text-pink-400 font-mono">{potentialHooks.length}</span>
        </div>

        <div className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between">
          <span className="text-xs text-slate-400">Duration</span>
          <span className="text-sm font-bold text-emerald-400 font-mono">
            {words.length > 0 ? `${words[words.length - 1].end}s` : '0.0s'}
          </span>
        </div>
      </div>

      {/* Controls Bar: Search & View Toggle */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search spoken words..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setViewMode('tokens')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'tokens'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Word Chips
          </button>
          <button
            type="button"
            onClick={() => setViewMode('paragraph')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              viewMode === 'paragraph'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" /> Paragraph
          </button>
        </div>
      </div>

      {/* Main Words Display View */}
      {words.length === 0 ? (
        <div className="p-10 border border-dashed border-slate-800 rounded-xl text-center space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
            <Volume2 className="w-5 h-5" />
          </div>
          <div className="text-sm font-semibold text-slate-300">
            {isTranscribing ? 'Transcribing in browser via Whisper...' : 'No transcript available'}
          </div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Extract audio from a video clip and run local Whisper to inspect word timestamps.
          </p>
        </div>
      ) : viewMode === 'tokens' ? (
        /* Word Chips with Start/End Timestamps */
        <div className="max-h-72 overflow-y-auto p-3 bg-slate-950/90 border border-slate-800/80 rounded-xl flex flex-wrap gap-1.5 scrollbar-thin">
          {filteredWords.map((wordObj, idx) => {
            const isSelected = selectedWordIndex === idx;
            const isPlaying = activeTime >= wordObj.start && activeTime <= wordObj.end;
            const isSilenceBefore =
              idx > 0 && wordObj.start - words[idx - 1]?.end >= 0.4;

            return (
              <React.Fragment key={`${wordObj.word}_${wordObj.start}_${idx}`}>
                {/* Silence Gap Indicator */}
                {isSilenceBefore && (
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-amber-400/80 bg-amber-500/10 border border-amber-500/20"
                    title={`Dead air silence of ${(wordObj.start - words[idx - 1].end).toFixed(2)}s`}
                  >
                    gap: {(wordObj.start - words[idx - 1].end).toFixed(2)}s
                  </span>
                )}

                {/* Word Button Chip */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWordIndex(idx);
                    onSeek?.(wordObj.start);
                  }}
                  className={`group relative flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    isPlaying
                      ? 'bg-indigo-500 text-white ring-2 ring-indigo-400 scale-105 shadow-md shadow-indigo-500/20'
                      : isSelected
                      ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800'
                  }`}
                >
                  <span className="font-sans">{wordObj.word}</span>
                  <span
                    className={`font-mono text-[9px] ${
                      isPlaying
                        ? 'text-indigo-200'
                        : 'text-slate-500 group-hover:text-slate-300'
                    }`}
                  >
                    {wordObj.start.toFixed(1)}s
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        /* Continuous Paragraph Mode */
        <div className="max-h-72 overflow-y-auto p-4 bg-slate-950/90 border border-slate-800/80 rounded-xl leading-relaxed text-sm text-slate-300 font-sans space-y-2">
          <p>
            {words.map((w, idx) => {
              const isPlaying = activeTime >= w.start && activeTime <= w.end;
              return (
                <span
                  key={idx}
                  onClick={() => onSeek?.(w.start)}
                  className={`cursor-pointer transition-colors px-0.5 rounded ${
                    isPlaying
                      ? 'bg-indigo-500 text-white font-bold'
                      : 'hover:bg-slate-800 hover:text-white'
                  }`}
                  title={`${w.start.toFixed(2)}s - ${w.end.toFixed(2)}s`}
                >
                  {w.word}{' '}
                </span>
              );
            })}
          </p>
        </div>
      )}

      {/* Selected Word Details Panel */}
      {selectedWordIndex !== null && words[selectedWordIndex] && (
        <div className="p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="font-bold text-white text-sm">
              "{words[selectedWordIndex].word}"
            </span>
            <span className="flex items-center gap-1 font-mono text-indigo-300">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              {words[selectedWordIndex].start.toFixed(2)}s →{' '}
              {words[selectedWordIndex].end.toFixed(2)}s (
              {(
                words[selectedWordIndex].end - words[selectedWordIndex].start
              ).toFixed(2)}
              s)
            </span>
          </div>

          <button
            type="button"
            onClick={() => onSeek?.(words[selectedWordIndex].start)}
            className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Volume2 className="w-3 h-3" /> Jump & Play
          </button>
        </div>
      )}
    </div>
  );
}
export default TranscriptInspector;
