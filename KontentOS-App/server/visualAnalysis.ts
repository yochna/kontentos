/**
 * Honest visual analysis for silent takes.
 *
 * This module never writes "what the creator said". It asks the model to describe only what is
 * observable in sampled frames, then returns copy and short on-screen text that are grounded in
 * those observations. The result is explicitly marked `visualOnly` so downstream code can label it
 * correctly instead of dressing it up as a transcript.
 */
import { GoogleGenAI } from '@google/genai';
import { engineTimeout, isEngineCeiling, readEngineJson } from './engine.js';
import { envGeminiKey } from './geminiKey.js';
import { DEFAULT_MODEL, ENGINE_MODELS } from './routes/caption.js';

export interface VisualFrameInput {
  timeSec: number;
  dataUrl: string;
  changeScore?: number;
  brightness?: number;
}

export interface VisualOnScreenText {
  text: string;
  startSec: number;
  endSec: number;
}

export interface VisualBeat {
  timeSec: number;
  label: string;
}

export interface VisualAnalysis {
  caption: string;
  hashtags: string[];
  onScreenText: VisualOnScreenText[];
  visualBeats: VisualBeat[];
  rationale: string;
  modelUsed: string;
  framesSampled: number;
  visualOnly: true;
}

interface RawVisualAnalysis {
  caption?: unknown;
  hashtags?: unknown;
  onScreenText?: unknown;
  visualBeats?: unknown;
  rationale?: unknown;
}

const MODEL_ATTEMPT_TIMEOUT_MS = 25_000;
const MAX_FRAMES = 8;
const MAX_FRAME_BYTES = 700_000;
const SPEECH_CLAIM =
  /\b(said|says|say|spoken|speech|dialogue|voice|voiceover|narrat\w*|audio|sound|music|podcast|interview|transcript|subtitles?)\b/i;
const META_TALK =
  /\b(as an ai|language model|this prompt|provided (above|below)|please (provide|supply|share|paste)|unable to (write|generate|create|produce)|no (input|context) (was )?given|i (do not|don't) have)\b/i;
const FILENAME_HINT = /\.(mp4|mov|m4v|webm|avi|mkv)\b|\(\d+\)|\b\d{4,}-\d+\b/i;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round2 = (value: number) => Math.round(value * 100) / 100;
const plainText = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

function decodeFrame(frame: VisualFrameInput): { mimeType: string; data: string } | null {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
    String(frame?.dataUrl ?? '').trim(),
  );
  if (!match) return null;
  const data = match[2];
  if (data.length < 200 || data.length > MAX_FRAME_BYTES) return null;
  return {
    mimeType: match[1] === 'image/jpg' ? 'image/jpeg' : match[1],
    data,
  };
}

function cleanCreatorContext(title: unknown): string {
  const value = plainText(title);
  if (!value || value.length > 120 || FILENAME_HINT.test(value)) return '';
  return value;
}

export function cleanCaption(value: unknown): string {
  let caption = plainText(value).replace(/^["'“”]+|["'“”]+$/g, '').trim();
  if (caption.length < 35 || caption.length > 260) return '';
  if (SPEECH_CLAIM.test(caption) || META_TALK.test(caption) || FILENAME_HINT.test(caption)) return '';
  caption = caption.replace(/^(this video|the video|the clip)\s+(shows|is|features)\s+/i, '');
  return caption.charAt(0).toUpperCase() + caption.slice(1);
}

function cleanHashtags(value: unknown, caption: string): string[] {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,]+/) : [];
  const cleaned: string[] = [];
  for (const item of source) {
    const tag = plainText(item)
      .replace(/^#+/, '')
      .replace(/[^A-Za-z0-9_]/g, '')
      .toLowerCase();
    if (!tag || tag.length > 24 || SPEECH_CLAIM.test(tag)) continue;
    const normalized = `#${tag}`;
    if (!cleaned.includes(normalized)) cleaned.push(normalized);
    if (cleaned.length >= 8) break;
  }
  if (cleaned.length < 3) {
    for (const fallback of ['reels', 'shortform', 'creators', 'behindthescenes']) {
      if (cleaned.length >= 5) break;
      const normalized = `#${fallback}`;
      if (!cleaned.includes(normalized)) cleaned.push(normalized);
    }
  }
  void caption;
  return cleaned.slice(0, 8);
}

function cleanOnScreenText(value: unknown, durationSec: number): VisualOnScreenText[] {
  if (!Array.isArray(value)) return [];
  const lines: VisualOnScreenText[] = [];
  for (const item of value.slice(0, 5)) {
    const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const text = plainText(record.text)
      .replace(/^["'“”]+|["'“”]+$/g, '')
      .trim();
    const startSec = Number(record.startSec);
    const endSec = Number(record.endSec);
    if (!text || text.length > 64 || SPEECH_CLAIM.test(text) || META_TALK.test(text)) continue;
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) continue;
    const start = round2(clamp(startSec, 0, Math.max(0, durationSec - 0.6)));
    const end = round2(clamp(endSec, start + 0.6, durationSec));
    lines.push({ text, startSec: start, endSec: end });
  }
  return lines;
}

function cleanVisualBeats(value: unknown, durationSec: number): VisualBeat[] {
  if (!Array.isArray(value)) return [];
  const beats: VisualBeat[] = [];
  for (const item of value.slice(0, 6)) {
    const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const label = plainText(record.label ?? record.description);
    const timeSec = Number(record.timeSec);
    if (!label || label.length > 70 || SPEECH_CLAIM.test(label)) continue;
    if (!Number.isFinite(timeSec)) continue;
    beats.push({ timeSec: round2(clamp(timeSec, 0, durationSec)), label });
  }
  return beats;
}

function buildPrompt(durationSec: number, title: string, frameTimes: number[]): string {
  const context = title ? `\nCreator-provided title (context only, never a filename): ${title}` : '';
  return `You are the visual editor for a silent short-form reel. You can see ${frameTimes.length} sampled frames from the actual video at these source times: ${frameTimes.join(', ')} seconds. Total duration: ${round2(durationSec)} seconds.${context}

Describe ONLY what is visible in those frames. Do not infer speech, audio, music, identity, intent, or facts that are not shown. Never treat a filename as a topic. Never write words as if the creator spoke them.

Return strict JSON with this shape:
{
  "caption": "A social caption of 45-220 characters grounded in the visible subject, action and mood. No references to speech or audio.",
  "hashtags": ["#topic", "#topic", "#topic"],
  "onScreenText": [{"text": "short visible-idea line", "startSec": 0, "endSec": 1.5}],
  "visualBeats": [{"timeSec": 0.8, "label": "what visibly changes here"}],
  "rationale": "One sentence explaining the cut and text choices from the frames."
}

Rules for onScreenText: 2-5 short lines, each 3-64 characters, spread across the clip, inside 0..${round2(durationSec)} seconds. They are visual overlays, never subtitles or quotes. Use fragments like "The setup", "Close-up detail", "The result" only when the frames actually support them. If the frames are unclear, return fewer lines.
Rules for visualBeats: 2-5 timestamps at visible changes or action peaks. Do not invent changes.
Return JSON only.`;
}

/** Analyse real frames from a silent clip. Returns null when no engine answers honestly. */
export async function analyzeVisualFrames(
  frames: VisualFrameInput[],
  options: { durationSec: number; title?: string; preferredModel?: string },
): Promise<VisualAnalysis | null> {
  const apiKey = envGeminiKey();
  if (!apiKey) return null;

  const usableFrames = frames.slice(0, MAX_FRAMES).map(decodeFrame).filter(Boolean) as Array<{
    mimeType: string;
    data: string;
  }>;
  if (!usableFrames.length) return null;

  const durationSec = clamp(Number(options.durationSec) || 12, 1, 600);
  const title = cleanCreatorContext(options.title);
  const times = frames.slice(0, usableFrames.length).map((frame) => Number(frame.timeSec) || 0);
  const prompt = buildPrompt(durationSec, title, times);

  const parts: any[] = [{ text: prompt }];
  usableFrames.forEach((frame, index) => {
    parts.push({
      text: `\nFrame at ${round2(times[index] ?? 0)}s:`,
    });
    parts.push({ inlineData: { mimeType: frame.mimeType, data: frame.data } });
  });

  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'kontentos-editorial-studio' } } });
    const modelsToTry = Array.from(
      new Set([options.preferredModel, DEFAULT_MODEL, ...ENGINE_MODELS].filter(Boolean)),
    ) as string[];
    let raw: RawVisualAnalysis | null = null;
    let modelUsed = DEFAULT_MODEL;

    for (const model of modelsToTry) {
      try {
        const response = await engineTimeout(
          ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts }],
            config: {
              responseMimeType: 'application/json',
              temperature: 0.25,
            },
          }),
          MODEL_ATTEMPT_TIMEOUT_MS,
          `Timeout with model ${model}`,
        );
        const text = typeof response?.text === 'string' ? response.text : '';
        raw = text ? readEngineJson<RawVisualAnalysis>(text) : null;
        if (raw) {
          modelUsed = model;
          break;
        }
      } catch (error: any) {
        if (isEngineCeiling(error?.message)) break;
      }
    }

    const caption = cleanCaption(raw?.caption);
    if (!raw || !caption) return null;

    return {
      caption,
      hashtags: cleanHashtags(raw.hashtags, caption),
      onScreenText: cleanOnScreenText(raw.onScreenText, durationSec),
      visualBeats: cleanVisualBeats(raw.visualBeats, durationSec),
      rationale: plainText(raw.rationale).slice(0, 240) || 'Edited from observable visual beats.',
      modelUsed,
      framesSampled: usableFrames.length,
      visualOnly: true,
    };
  } catch (error) {
    console.warn('Visual analysis skipped:', error instanceof Error ? error.message : error);
    return null;
  }
}
