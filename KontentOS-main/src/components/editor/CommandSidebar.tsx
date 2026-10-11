/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Loader2,
  Undo2,
  CheckCircle2,
  AlertCircle,
  Wand2,
  RotateCcw,
  Bot,
  User,
  Zap,
  Trash2,
  ChevronDown,
  Layers,
  Flame,
} from 'lucide-react';
import { useTimelineStore } from '../../store/useTimelineStore';
import { requestEditorCommand } from '../../services/aiEditorService';

export interface CommandMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actionSummary?: string;
  source?: 'gemini' | 'local_engine';
  isError?: boolean;
}

interface CommandSidebarProps {
  className?: string;
  onMutationSuccess?: (summary: string) => void;
}

const PRESET_SUGGESTIONS = [
  {
    label: '⚡ Punch-in on all questions',
    prompt: 'Add punch-in zoom keyframes (1.35x) on key emphasis moments and questions',
  },
  {
    label: '💥 Add Vine Boom to punchlines',
    prompt: 'Add vine boom sound effect on dramatic hooks and punchlines',
  },
  {
    label: '⏩ Fast-forward silence',
    prompt: 'Fast-forward silence and speed up video segments to 1.5x speed',
  },
  {
    label: '🎬 Remove all zooms',
    prompt: 'Remove all punch-in zooms and reset keyframes across video clips',
  },
  {
    label: '💰 Cash register on money words',
    prompt: 'Add cash register sound effect on mentions of money, revenue, or price',
  },
  {
    label: '✨ Neon yellow captions',
    prompt: 'Update kinetic captions to high-contrast neon yellow color',
  },
  {
    label: '💎 Cyan captions style',
    prompt: 'Change kinetic captions to electric cyan color with heavy drop shadow',
  },
  {
    label: '🔔 Insert chime at highlights',
    prompt: 'Add chime sound effect on breakthrough tips and key takeaways',
  },
];

export const CommandSidebar: React.FC<CommandSidebarProps> = ({
  className = '',
  onMutationSuccess,
}) => {
  const project = useTimelineStore((state) => state.project);
  const history = useTimelineStore((state) => state.history);
  const applyMutation = useTimelineStore((state) => state.applyMutation);
  const undo = useTimelineStore((state) => state.undo);

  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('Analyzing timeline state...');
  const [messages, setMessages] = useState<CommandMessage[]>([
    {
      id: 'welcome_msg',
      role: 'assistant',
      content:
        'Hi! I am your AI Video Editor Copilot. Tell me what to change on the timeline (e.g., "Add vine boom when I say money", "Make clip 2 1.5x speed", "Remove all zooms"), or click a quick suggestion below.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actionSummary: 'Copilot initialized and synchronized with active multi-track timeline.',
      source: 'gemini',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll chat history
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendCommand = async (instructionToRun?: string) => {
    const promptToExecute = (instructionToRun || inputPrompt).trim();
    if (!promptToExecute || isLoading) return;

    const userMessage: CommandMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: promptToExecute,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputPrompt('');
    setIsLoading(true);
    setLoadingStep('Consulting Gemini Flash with System Prompt B...');

    const stepTimer = setTimeout(() => {
      setLoadingStep('Synthesizing timeline state mutation...');
    }, 1200);

    try {
      const result = await requestEditorCommand(project, promptToExecute);

      clearTimeout(stepTimer);
      setLoadingStep('Hydrating multi-track store and pushing undo snapshot...');

      // Hydrate state and push undo snapshot to store
      applyMutation(result.project, true);

      const assistantMessage: CommandMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: result.message,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionSummary: result.actionSummary,
        source: result.source,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      onMutationSuccess?.(result.actionSummary || promptToExecute);
    } catch (err: any) {
      clearTimeout(stepTimer);
      console.error('CommandSidebar mutation error:', err);

      const errorMessage: CommandMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `Error applying command: ${err?.message || 'Failed to communicate with AI mutator'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendCommand();
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: `fresh_${Date.now()}`,
        role: 'assistant',
        content: 'Chat history cleared. What would you like to edit next on the timeline?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        source: 'gemini',
      },
    ]);
  };

  return (
    <div
      className={`flex flex-col bg-[#0b101d] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md ${className}`}
      style={{ height: '560px' }}
    >
      {/* Top Header */}
      <div className="px-4 py-3 bg-[#070b14] border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-pink-500 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-black text-white flex items-center gap-1.5 tracking-tight">
              AI Command Copilot
              <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 text-[9px] font-mono rounded-full border border-indigo-500/20 font-bold">
                Flash Mutator
              </span>
            </h3>
            <p className="text-[10px] text-slate-400 font-medium">Conversational multi-track EDL editor</p>
          </div>
        </div>

        {/* Header Actions: Undo & Clear */}
        <div className="flex items-center gap-1.5">
          {history.past.length > 0 && (
            <button
              type="button"
              onClick={undo}
              className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-xl text-[10px] font-bold border border-amber-500/30 transition-all shadow-sm cursor-pointer"
              title="Undo last change (Ctrl+Z)"
            >
              <Undo2 className="w-3 h-3 text-amber-400" />
              <span>Undo ({history.past.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleClearChat}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer"
            title="Clear message history"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Preset Quick-Action Suggestion Pills Carousel */}
      <div className="px-3.5 py-2.5 bg-[#080d1a]/60 border-b border-slate-800/80">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 mb-2">
          <Zap className="w-3 h-3 text-indigo-400" />
          <span>Quick Suggestions</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {PRESET_SUGGESTIONS.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isLoading}
              onClick={() => handleSendCommand(preset.prompt)}
              className="whitespace-nowrap px-3 py-1 bg-slate-900/90 hover:bg-indigo-600/20 hover:border-indigo-400/40 text-slate-300 hover:text-white border border-slate-800 rounded-full text-[10px] font-semibold transition-all shadow-sm shrink-0 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-800">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            } animate-in fade-in duration-200`}
          >
            <div
              className={`max-w-[92%] rounded-2xl p-3.5 text-xs shadow-md ${
                msg.role === 'user'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-tr-none'
                  : msg.isError
                  ? 'bg-rose-950/40 border border-rose-800/60 text-rose-200 rounded-tl-none'
                  : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-tl-none'
              }`}
            >
              {/* Message Header */}
              <div className="flex items-center justify-between gap-2 mb-1.5 opacity-80 text-[10px]">
                <span className="flex items-center gap-1.5 font-bold">
                  {msg.role === 'user' ? (
                    <>
                      <User className="w-3 h-3" /> You
                    </>
                  ) : (
                    <>
                      <Bot className="w-3 h-3 text-indigo-400" /> KontentOS AI
                    </>
                  )}
                </span>
                <span className="font-mono text-[9px] text-slate-400">{msg.timestamp}</span>
              </div>

              {/* Message Content */}
              <p className="leading-relaxed whitespace-pre-wrap text-[11px] font-normal">{msg.content}</p>

              {/* Assistant Metadata & Action Summary Badge */}
              {msg.actionSummary && (
                <div className="mt-2.5 pt-2 border-t border-slate-800 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      {msg.actionSummary}
                    </span>
                    {msg.source && (
                      <span className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-slate-950/80 text-slate-400 border border-slate-800">
                        {msg.source === 'gemini' ? 'Gemini 2.5 Flash' : 'Local Engine'}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Optimistic Loading State */}
        {isLoading && (
          <div className="flex items-start animate-in fade-in duration-150">
            <div className="max-w-[92%] bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 rounded-2xl rounded-tl-none p-3.5 text-xs shadow-lg space-y-2.5">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                <span className="font-bold text-[11px] text-white">Mutating Timeline Project</span>
              </div>
              <p className="text-[10px] text-indigo-300 font-mono flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                {loadingStep}
              </p>
              {/* Timeline Progress Bar Simulation */}
              <div className="w-full h-1.5 bg-indigo-950 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-500 via-indigo-500 to-pink-500 animate-pulse w-3/4 rounded-full" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box Area */}
      <div className="p-3.5 bg-[#070b14] border-t border-slate-800/80">
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="Ask AI to edit timeline (e.g. 'Add vine boom when I say money')..."
            className="w-full bg-slate-900/90 border border-slate-700/80 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs text-white rounded-xl pl-3.5 pr-10 py-2.5 outline-none placeholder:text-slate-500 transition-all disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => handleSendCommand()}
            disabled={!inputPrompt.trim() || isLoading}
            className="absolute right-1.5 p-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 disabled:hover:from-indigo-600 disabled:hover:to-violet-600 text-white rounded-lg transition-all shadow-md active:scale-95 cursor-pointer"
            title="Send command (Enter)"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="flex items-center justify-between text-[9px] text-slate-500 mt-2 px-1 font-medium">
          <span className="flex items-center gap-1">
            Press <kbd className="px-1.5 py-0.5 bg-slate-900 rounded font-mono text-slate-400 border border-slate-800">Enter</kbd> to run
          </span>
          <span>Undo supported via <kbd className="px-1.5 py-0.5 bg-slate-900 rounded font-mono text-slate-400 border border-slate-800">Ctrl+Z</kbd></span>
        </div>
      </div>
    </div>
  );
};
