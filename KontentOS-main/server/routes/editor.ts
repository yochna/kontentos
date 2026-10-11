import express from 'express';
import { GoogleGenAI } from '@google/genai';
import {
  TimelineProject,
  TimelineTrack,
  VideoClip,
  SFXClip,
  TextClip,
  WordTimestamp,
} from '../../src/types/timeline.js';

const router = express.Router();

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key' || apiKey.startsWith('your_')) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMsg)), ms)
    ),
  ]);
}

/**
 * System Prompt A: Directives for silence trimming, punch zoom keyframes, viral SFX, and kinetic captions
 */
const SYSTEM_PROMPT_A = `You are KontentOS Smart-Polish, an elite AI short-form video editor specialized in viral TikToks, Instagram Reels, and YouTube Shorts.
Your mission is to take raw word-level speech transcripts with precise timestamps and produce a broadcast-ready Edit Decision List (EDL) strictly compliant with the TimelineProject JSON schema.

CRITICAL RULES:
1. SILENCE TRIMMING (> 0.4s):
   - Detect any pause or dead-air silence between consecutive words that is >= 0.4 seconds (as well as silence before first word or after last word).
   - Create trimmed video clip segments that ONLY contain spoken words (with a tiny 0.05s head/tail pad).
   - Cut out all dead air and awkward pauses.
   - Video clips MUST be placed sequentially on "track-video" with contiguous startOnTimeline (clip 0 starts at 0.0, clip 1 starts at clip 0 duration, etc.).
   - Each video clip's sourceStartOffset must be the start time in the original source video, and duration is (sourceEnd - sourceStart).

2. PUNCH-IN ZOOM KEYFRAMES (1.0x to 1.35x):
   - Identify high-emphasis words, surprising statistics, questions, and topic shifts.
   - Add transform keyframes on the corresponding VideoClip:
     - Baseline keyframe: { "timeOffset": 0, "scale": 1.0, "position": { "x": 0, "y": 0 }, "easing": "linear" }
     - Punch-in keyframe at the emphasis word: { "timeOffset": <offset_in_clip>, "scale": 1.35, "position": { "x": 0, "y": -0.05 }, "easing": "easeInOut" }
     - Reset keyframe: { "timeOffset": <offset_in_clip + 1.2>, "scale": 1.0, "position": { "x": 0, "y": 0 }, "easing": "easeOut" }

3. VIRAL SFX INSERTS:
   - On "track-sfx", insert SFX clips at exact keyword timestamps on the edited master timeline:
     - 'vine_boom': On dramatic reveals, shock, "STOP", "NEVER", or plot twists.
     - 'cash_register': On mentions of money, revenue, profit, cost, dollar amounts, earnings.
     - 'chime': On key takeaways, positive tips, "secret", "solution", or breakthrough insights.
     - 'pop': On fast transition points, lists ("first", "second"), or rapid callouts.
   - Each SFX clip must have:
     id, name, type: "sfx", sfxAssetId ("vine_boom" | "cash_register" | "chime" | "pop"),
     startOnTimeline (aligned with the timestamp on the edited timeline),
     duration (0.6s to 1.5s), sourceStartOffset: 0,
     audioModifiers: { "pitchShiftCents": 0, "volume": 1.0, "fadeInSec": 0, "fadeOutSec": 0.1 }

4. KINETIC CAPTIONS:
   - On "track-text", generate 2-3 word kinetic caption clips covering the spoken words.
   - Never show more than 3 words at once to maximize visual retention.
   - Each text clip must have:
     id, name, type: "text",
     content (2-3 words in UPPERCASE, e.g. "STOP SCROLLING", "HERE IS WHY"),
     startOnTimeline (aligned with the edited timeline),
     duration, sourceStartOffset: 0,
     style: {
       "fontFamily": "Impact, sans-serif",
       "fontSize": 48,
       "colorHex": "#FFFF00",
       "strokeColorHex": "#000000",
       "strokeWidth": 4,
       "position": "middle",
       "animation": "popIn"
     }

5. TIMELINEPROJECT JSON SCHEMA:
Return ONLY a valid JSON object matching:
{
  "schemaVersion": "1.0.0",
  "projectMetadata": {
    "id": "proj_smart_edit",
    "title": "Smart-Polished Reel",
    "targetAspectRatio": "9:16",
    "width": 1080,
    "height": 1920,
    "frameRate": 30,
    "totalDuration": <total edited duration in seconds>
  },
  "globalAudioTracks": {
    "bgmVolume": 0.25,
    "duckingEnabled": true
  },
  "tracks": [
    {
      "id": "track-text",
      "name": "Kinetic Captions",
      "type": "text",
      "isMuted": false,
      "isLocked": false,
      "zIndex": 30,
      "clips": []
    },
    {
      "id": "track-sfx",
      "name": "SFX Overlays",
      "type": "sfx",
      "isMuted": false,
      "isLocked": false,
      "zIndex": 20,
      "clips": []
    },
    {
      "id": "track-video",
      "name": "Primary Video",
      "type": "video",
      "isMuted": false,
      "isLocked": false,
      "zIndex": 10,
      "clips": []
    }
  ]
}
`;

/**
 * System Prompt B: State Mutator for Conversational AI Video Editing
 */
const SYSTEM_PROMPT_B = `You are KontentOS State Mutator, an expert conversational AI video editor copilot specialized in mutating an in-browser TimelineProject state.
You receive a JSON object containing:
- "currentState": The full TimelineProject representing the current video timeline (projectMetadata, globalAudioTracks, tracks: track-text, track-sfx, track-video).
- "userInstruction": The natural language command from the user describing the desired changes.

CRITICAL RULES FOR STATE MUTATION:
1. TARGETED MUTATIONS ONLY:
   - Do NOT regenerate the whole timeline from scratch. Only modify the specific clips, keyframes, or tracks requested by the user.
   - Retain IDs, source offsets, and timing of clips that are not affected.
   - Maintain the standard tracks: "track-text" (zIndex: 30), "track-sfx" (zIndex: 20), "track-video" (zIndex: 10).

2. COMMON EDIT INSTRUCTIONS:
   - "Add vine boom when I say money" / "Add sound effect X":
     * Add a new SFXClip on "track-sfx".
     * Assign a unique id (e.g. "sfx_mut_...").
     * Set sfxAssetId ("vine_boom" | "cash_register" | "chime" | "pop" | "whoosh" | "glitch").
     * Position it at the appropriate startOnTimeline (matching speech or specified time, default duration 0.8-1.2s).
     * audioModifiers: { "pitchShiftCents": 0, "volume": 1.0, "fadeInSec": 0, "fadeOutSec": 0.1 }.
   - "Make clip [N] [X]x speed" / "Speed up clip":
     * Locate the clip on "track-video" (by index or name).
     * Set speedMultiplier (e.g. 1.5).
     * Adjust duration = originalDuration / speedMultiplier.
     * Shift startOnTimeline for subsequent clips on "track-video" to maintain contiguous playback.
   - "Remove all zooms" / "Clear punch-in zooms":
     * On all clips in "track-video", set keyframes: [].
   - "Punch-in on all questions" / "Add punch zoom":
     * Add keyframes to the relevant VideoClips:
       [
         { "timeOffset": 0, "scale": 1.0, "position": { "x": 0, "y": 0 }, "easing": "linear" },
         { "timeOffset": 0.25, "scale": 1.35, "position": { "x": 0, "y": -0.05 }, "easing": "easeInOut" },
         { "timeOffset": 1.4, "scale": 1.0, "position": { "x": 0, "y": 0 }, "easing": "easeOut" }
       ]
   - "Fast-forward silence" / "Speed up clips":
     * Adjust speedMultiplier (e.g. 2.0x) on target clips.
   - "Change captions style / color / font":
     * Update style properties on TextClips in "track-text" (e.g., colorHex: "#FFFF00", "#38BDF8", "#F43F5E", etc.).
   - "Mute background audio" / "Ducking":
     * Update globalAudioTracks settings (bgmVolume, duckingEnabled).

3. RECOMPUTE & INTEGRITY:
   - Recompute projectMetadata.totalDuration if clip lengths or positions changed.
   - Update projectMetadata.updatedAt to current ISO timestamp.

4. RESPONSE FORMAT:
   Return ONLY a valid JSON object strictly conforming to the TimelineProject schema.
`;

/**
 * Deterministic local state mutator for instant zero-latency commands
 */
function mutateTimelineLocally(
  current: TimelineProject,
  instruction: string
): { project: TimelineProject; summary: string } {
  const cloned: TimelineProject = JSON.parse(JSON.stringify(current));
  const lower = instruction.toLowerCase().trim();

  const videoTrack = cloned.tracks.find((t) => t.type === 'video');
  const sfxTrack = cloned.tracks.find((t) => t.type === 'sfx');
  const textTrack = cloned.tracks.find((t) => t.type === 'text');

  let summary = `Applied edit: "${instruction}"`;

  // 1. Remove all zooms / clear punch-ins
  if (
    lower.includes('remove all zoom') ||
    lower.includes('remove zoom') ||
    lower.includes('clear zoom') ||
    lower.includes('no zoom') ||
    lower.includes('reset zoom')
  ) {
    if (videoTrack) {
      videoTrack.clips.forEach((c) => {
        (c as VideoClip).keyframes = [];
      });
      summary = 'Removed all punch-in zoom keyframes across video tracks.';
    }
  }
  // 2. Punch in / Add zoom
  else if (
    lower.includes('punch-in') ||
    lower.includes('punch in') ||
    lower.includes('add zoom') ||
    lower.includes('zoom in')
  ) {
    if (videoTrack && videoTrack.clips.length > 0) {
      videoTrack.clips.forEach((c) => {
        const vClip = c as VideoClip;
        vClip.keyframes = [
          { timeOffset: 0, scale: 1.0, position: { x: 0, y: 0 }, easing: 'linear' },
          { timeOffset: 0.25, scale: 1.35, position: { x: 0, y: -0.05 }, easing: 'easeInOut' },
          { timeOffset: Math.min(vClip.duration, 1.4), scale: 1.0, position: { x: 0, y: 0 }, easing: 'easeOut' },
        ];
      });
      summary = 'Added dynamic 1.35x punch-in zoom keyframes to video clips.';
    }
  }
  // 3. Add Vine Boom
  else if (lower.includes('vine boom') || lower.includes('vine_boom') || lower.includes('boom')) {
    if (sfxTrack) {
      const targetTime = Math.min(1.2, cloned.projectMetadata.totalDuration * 0.3);
      const newSfx: SFXClip = {
        id: `sfx_vb_${Date.now()}`,
        name: 'Vine Boom',
        type: 'sfx',
        sfxAssetId: 'vine_boom',
        startOnTimeline: Number(targetTime.toFixed(2)),
        duration: 1.2,
        sourceStartOffset: 0,
        audioModifiers: { pitchShiftCents: 0, volume: 1.0, fadeInSec: 0, fadeOutSec: 0.1 },
      };
      sfxTrack.clips.push(newSfx);
      sfxTrack.clips.sort((a, b) => a.startOnTimeline - b.startOnTimeline);
      summary = `Added Vine Boom SFX at ${targetTime.toFixed(2)}s.`;
    }
  }
  // 4. Add Cash Register
  else if (lower.includes('cash register') || lower.includes('money') || lower.includes('register')) {
    if (sfxTrack) {
      const targetTime = Math.min(2.0, cloned.projectMetadata.totalDuration * 0.5);
      const newSfx: SFXClip = {
        id: `sfx_cash_${Date.now()}`,
        name: 'Cash Register',
        type: 'sfx',
        sfxAssetId: 'cash_register',
        startOnTimeline: Number(targetTime.toFixed(2)),
        duration: 1.0,
        sourceStartOffset: 0,
        audioModifiers: { pitchShiftCents: 0, volume: 1.0, fadeInSec: 0, fadeOutSec: 0.1 },
      };
      sfxTrack.clips.push(newSfx);
      sfxTrack.clips.sort((a, b) => a.startOnTimeline - b.startOnTimeline);
      summary = `Added Cash Register SFX at ${targetTime.toFixed(2)}s.`;
    }
  }
  // 5. Add Chime / Pop / Whoosh / Glitch
  else if (lower.includes('chime')) {
    if (sfxTrack) {
      const newSfx: SFXClip = {
        id: `sfx_chime_${Date.now()}`,
        name: 'Chime Insight',
        type: 'sfx',
        sfxAssetId: 'chime',
        startOnTimeline: 0.5,
        duration: 0.8,
        sourceStartOffset: 0,
        audioModifiers: { pitchShiftCents: 0, volume: 1.0, fadeInSec: 0, fadeOutSec: 0.1 },
      };
      sfxTrack.clips.push(newSfx);
      summary = 'Added Chime SFX at key insight moment.';
    }
  } else if (lower.includes('pop') || lower.includes('whoosh') || lower.includes('glitch')) {
    const sfxAssetId = lower.includes('pop') ? 'pop' : lower.includes('whoosh') ? 'whoosh' : 'glitch';
    if (sfxTrack) {
      const newSfx: SFXClip = {
        id: `sfx_${sfxAssetId}_${Date.now()}`,
        name: sfxAssetId.toUpperCase(),
        type: 'sfx',
        sfxAssetId,
        startOnTimeline: 1.0,
        duration: 0.6,
        sourceStartOffset: 0,
        audioModifiers: { pitchShiftCents: 0, volume: 1.0, fadeInSec: 0, fadeOutSec: 0.1 },
      };
      sfxTrack.clips.push(newSfx);
      summary = `Added ${sfxAssetId} sound effect.`;
    }
  }
  // 6. Speed adjustment (e.g. "make clip 2 1.5x speed", "speed up to 1.5x", "fast-forward silence")
  else if (lower.includes('speed') || lower.includes('fast-forward') || lower.includes('fast forward')) {
    let speed = 1.5;
    const match = lower.match(/([0-9]+(?:\.[0-9]+)?)\s*x/);
    if (match) {
      speed = Math.max(0.25, Math.min(4.0, parseFloat(match[1])));
    } else if (lower.includes('fast-forward') || lower.includes('fast forward')) {
      speed = 2.0;
    }

    if (videoTrack && videoTrack.clips.length > 0) {
      let clipIdx = 0;
      const clipMatch = lower.match(/clip\s*([0-9]+)/);
      if (clipMatch) {
        clipIdx = Math.max(0, Math.min(videoTrack.clips.length - 1, parseInt(clipMatch[1], 10) - 1));
      }

      const target = videoTrack.clips[clipIdx] as VideoClip;
      target.speedMultiplier = speed;
      target.duration = Number((target.duration / speed).toFixed(3));

      let timelineCursor = target.startOnTimeline + target.duration;
      for (let i = clipIdx + 1; i < videoTrack.clips.length; i++) {
        videoTrack.clips[i].startOnTimeline = Number(timelineCursor.toFixed(3));
        timelineCursor += videoTrack.clips[i].duration;
      }

      summary = `Updated clip ${clipIdx + 1} speed to ${speed}x and recalculated timeline boundaries.`;
    }
  }
  // 7. Captions color or styling
  else if (
    lower.includes('caption') ||
    lower.includes('yellow') ||
    lower.includes('cyan') ||
    lower.includes('pink') ||
    lower.includes('neon') ||
    lower.includes('white')
  ) {
    let color = '#FFFF00';
    if (lower.includes('cyan') || lower.includes('blue')) color = '#38BDF8';
    else if (lower.includes('pink') || lower.includes('magenta')) color = '#F43F5E';
    else if (lower.includes('white')) color = '#FFFFFF';
    else if (lower.includes('green') || lower.includes('neon')) color = '#10B981';

    if (textTrack) {
      textTrack.clips.forEach((c) => {
        const tClip = c as TextClip;
        if (!tClip.style) {
          tClip.style = {
            fontFamily: 'Impact, sans-serif',
            fontSize: 48,
            colorHex: color,
            strokeColorHex: '#000000',
            strokeWidth: 4,
            position: 'middle',
            animation: 'popIn',
          };
        } else {
          tClip.style.colorHex = color;
        }
      });
      summary = `Updated kinetic caption styling color to ${color}.`;
    }
  }

  // Recalculate total duration
  let maxDur = 0;
  cloned.tracks.forEach((t) => {
    t.clips.forEach((c) => {
      const end = c.startOnTimeline + c.duration;
      if (end > maxDur) maxDur = end;
    });
  });
  cloned.projectMetadata.totalDuration = Number(maxDur.toFixed(3));
  cloned.projectMetadata.updatedAt = new Date().toISOString();

  return { project: cloned, summary };
}

/**
 * Deterministic Fallback & Normalizer Engine
 * Generates or cleans an EDL project with mathematical precision.
 */
function generateDeterministicAutoEdit(
  videoMetadata: {
    id: string;
    title?: string;
    duration: number;
    width?: number;
    height?: number;
    targetAspectRatio?: '9:16' | '16:9' | '1:1';
    sourceUrl?: string;
  },
  words: WordTimestamp[],
  options?: {
    silenceThresholdSec?: number;
    sfxEnabled?: boolean;
    punchZoomEnabled?: boolean;
    captionsEnabled?: boolean;
  }
): TimelineProject {
  const silenceThreshold = options?.silenceThresholdSec ?? 0.4;
  const sfxEnabled = options?.sfxEnabled ?? true;
  const punchZoomEnabled = options?.punchZoomEnabled ?? true;
  const captionsEnabled = options?.captionsEnabled ?? true;

  const rawDuration = videoMetadata.duration || (words.length > 0 ? words[words.length - 1].end + 1 : 10);

  // If no words exist, create 1 continuous video clip
  if (!words || words.length === 0) {
    return {
      schemaVersion: '1.0.0',
      projectMetadata: {
        id: `proj_${Date.now()}`,
        title: videoMetadata.title || 'Smart Reel',
        targetAspectRatio: videoMetadata.targetAspectRatio || '9:16',
        width: videoMetadata.width || 1080,
        height: videoMetadata.height || 1920,
        frameRate: 30,
        totalDuration: rawDuration,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      globalAudioTracks: { bgmVolume: 0.25, duckingEnabled: true },
      tracks: [
        { id: 'track-text', name: 'Kinetic Captions', type: 'text', isMuted: false, isLocked: false, zIndex: 30, clips: [] },
        { id: 'track-sfx', name: 'SFX Overlays', type: 'sfx', isMuted: false, isLocked: false, zIndex: 20, clips: [] },
        {
          id: 'track-video',
          name: 'Primary Video',
          type: 'video',
          isMuted: false,
          isLocked: false,
          zIndex: 10,
          clips: [
            {
              id: 'vclip_0',
              name: 'Raw Video',
              type: 'video',
              startOnTimeline: 0,
              duration: rawDuration,
              sourceStartOffset: 0,
              sourceFileId: videoMetadata.id,
              sourceUrl: videoMetadata.sourceUrl,
              speedMultiplier: 1.0,
              keyframes: [],
              audioModifiers: { pitchShiftCents: 0, volume: 1.0, fadeInSec: 0, fadeOutSec: 0 },
            },
          ],
        },
      ],
    };
  }

  // 1. Group words into speech blocks separated by silences > silenceThreshold
  const speechBlocks: WordTimestamp[][] = [];
  let currentBlock: WordTimestamp[] = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const prevWord = words[i - 1];
    const currWord = words[i];
    const gap = currWord.start - prevWord.end;

    if (gap >= silenceThreshold) {
      speechBlocks.push(currentBlock);
      currentBlock = [currWord];
    } else {
      currentBlock.push(currWord);
    }
  }
  if (currentBlock.length > 0) {
    speechBlocks.push(currentBlock);
  }

  // 2. Build trimmed VideoClips and build a time-mapping helper
  const videoClips: VideoClip[] = [];
  let currentTimelineTime = 0;

  interface SegmentMapping {
    rawStart: number;
    rawEnd: number;
    timelineStart: number;
    duration: number;
  }
  const mappings: SegmentMapping[] = [];

  speechBlocks.forEach((block, idx) => {
    const firstWord = block[0];
    const lastWord = block[block.length - 1];

    const rawStart = Math.max(0, firstWord.start - 0.08);
    const rawEnd = Math.min(rawDuration, lastWord.end + 0.08);
    const duration = Math.max(0.2, Number((rawEnd - rawStart).toFixed(3)));

    const mapping: SegmentMapping = {
      rawStart,
      rawEnd,
      timelineStart: currentTimelineTime,
      duration,
    };
    mappings.push(mapping);

    // Check for emphasis punch zooms inside this block
    const keyframes: VideoClip['keyframes'] = [];
    if (punchZoomEnabled) {
      // Find prominent emphasis words
      block.forEach((w) => {
        const clean = w.word.toLowerCase().replace(/[^a-z0-9]/g, '');
        const isEmphasis = [
          'stop', 'listen', 'money', 'revenue', 'dollar', 'profit', 'secret',
          'never', 'always', 'truth', 'huge', 'insane', 'boom', 'hack', 'free',
          'growth', 'warning', 'scale', 'game', 'results', 'instant', 'million',
        ].includes(clean);

        if (isEmphasis) {
          const timeInClip = Math.max(0, Number((w.start - rawStart).toFixed(3)));
          // Add punch zoom keyframe if not too crowded
          if (!keyframes.some((kf) => Math.abs(kf.timeOffset - timeInClip) < 0.6)) {
            keyframes.push({
              timeOffset: Math.max(0, timeInClip - 0.05),
              scale: 1.0,
              position: { x: 0, y: 0 },
              easing: 'linear',
            });
            keyframes.push({
              timeOffset: timeInClip,
              scale: 1.35,
              position: { x: 0, y: -0.05 },
              easing: 'easeInOut',
            });
            keyframes.push({
              timeOffset: Math.min(duration, timeInClip + 1.2),
              scale: 1.0,
              position: { x: 0, y: 0 },
              easing: 'easeOut',
            });
          }
        }
      });
    }

    videoClips.push({
      id: `vclip_${idx}_${Date.now()}`,
      name: `Clip ${idx + 1}: ${block.slice(0, 3).map((w) => w.word).join(' ')}`,
      type: 'video',
      startOnTimeline: currentTimelineTime,
      duration,
      sourceStartOffset: Number(rawStart.toFixed(3)),
      sourceFileId: videoMetadata.id,
      sourceUrl: videoMetadata.sourceUrl,
      speedMultiplier: 1.0,
      keyframes,
      audioModifiers: { pitchShiftCents: 0, volume: 1.0, fadeInSec: 0, fadeOutSec: 0 },
    });

    currentTimelineTime = Number((currentTimelineTime + duration).toFixed(3));
  });

  // Helper to translate raw source time into master timeline time
  function mapRawToTimeline(rawTime: number): number {
    for (const m of mappings) {
      if (rawTime >= m.rawStart && rawTime <= m.rawEnd) {
        return Number((m.timelineStart + (rawTime - m.rawStart)).toFixed(3));
      }
    }
    // If between segments, clamp to nearest segment
    for (let i = 0; i < mappings.length; i++) {
      if (rawTime < mappings[i].rawStart) {
        return mappings[i].timelineStart;
      }
    }
    return mappings.length > 0
      ? mappings[mappings.length - 1].timelineStart + mappings[mappings.length - 1].duration
      : rawTime;
  }

  // 3. Build SFX clips on track-sfx
  const sfxClips: SFXClip[] = [];
  if (sfxEnabled) {
    words.forEach((w, idx) => {
      const clean = w.word.toLowerCase().replace(/[^a-z0-9]/g, '');
      let sfxId: SFXClip['sfxAssetId'] | null = null;
      let sfxName = 'SFX';
      let duration = 0.8;

      if (['money', 'revenue', 'dollar', 'profit', 'cash', 'earn', 'cost', 'pay', 'million', 'billion'].includes(clean)) {
        sfxId = 'cash_register';
        sfxName = 'Cash Register';
        duration = 1.0;
      } else if (['boom', 'stop', 'secret', 'never', 'shocking', 'insane', 'crazy', 'warning'].includes(clean)) {
        sfxId = 'vine_boom';
        sfxName = 'Vine Boom';
        duration = 1.2;
      } else if (['tip', 'hack', 'win', 'solution', 'easy', 'key', 'free', 'smart', 'result'].includes(clean)) {
        sfxId = 'chime';
        sfxName = 'Success Chime';
        duration = 0.8;
      } else if (['first', 'second', 'third', 'step', 'one', 'two', 'now', 'look', 'click'].includes(clean)) {
        sfxId = 'pop';
        sfxName = 'Pop Sound';
        duration = 0.4;
      }

      if (sfxId) {
        const timelineTime = mapRawToTimeline(w.start);
        // Avoid placing SFX clips closer than 0.8s to avoid overlapping cacophony
        const isTooClose = sfxClips.some((sc) => Math.abs(sc.startOnTimeline - timelineTime) < 0.8);
        if (!isTooClose) {
          sfxClips.push({
            id: `sfx_${idx}_${Date.now()}`,
            name: sfxName,
            type: 'sfx',
            sfxAssetId: sfxId,
            startOnTimeline: timelineTime,
            duration,
            sourceStartOffset: 0,
            audioModifiers: { pitchShiftCents: 0, volume: 1.0, fadeInSec: 0, fadeOutSec: 0.1 },
          });
        }
      }
    });
  }

  // 4. Build Kinetic Captions (2-3 words per clip)
  const textClips: TextClip[] = [];
  if (captionsEnabled) {
    let wordCursor = 0;
    while (wordCursor < words.length) {
      // Pick 2 or 3 words (if 4 words left, split into 2 and 2)
      const remaining = words.length - wordCursor;
      const chunkSize = remaining === 4 ? 2 : remaining >= 3 ? 3 : remaining;
      const chunk = words.slice(wordCursor, wordCursor + chunkSize);
      wordCursor += chunkSize;

      const firstW = chunk[0];
      const lastW = chunk[chunk.length - 1];

      const startTime = mapRawToTimeline(firstW.start);
      const endTime = mapRawToTimeline(lastW.end);
      const duration = Math.max(0.3, Number((endTime - startTime).toFixed(3)));

      const content = chunk.map((w) => w.word.trim()).join(' ').toUpperCase();
      const hasEmphasis = chunk.some((w) => {
        const c = w.word.toLowerCase();
        return ['stop', 'money', 'secret', 'never', 'always', 'huge', 'insane', 'free', 'boom'].some((t) => c.includes(t));
      });

      textClips.push({
        id: `caption_${textClips.length}_${Date.now()}`,
        name: `Caption: ${content.slice(0, 16)}`,
        type: 'text',
        content,
        startOnTimeline: startTime,
        duration,
        sourceStartOffset: 0,
        style: {
          fontFamily: 'Impact, sans-serif',
          fontSize: 48,
          colorHex: hasEmphasis ? '#FACC15' : '#FFFFFF',
          strokeColorHex: '#000000',
          strokeWidth: 4,
          position: 'middle',
          animation: 'popIn',
        },
      });
    }
  }

  return {
    schemaVersion: '1.0.0',
    projectMetadata: {
      id: `proj_${Date.now()}`,
      title: videoMetadata.title || 'Smart-Polished Reel',
      targetAspectRatio: videoMetadata.targetAspectRatio || '9:16',
      width: videoMetadata.width || 1080,
      height: videoMetadata.height || 1920,
      frameRate: 30,
      totalDuration: currentTimelineTime,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    globalAudioTracks: {
      bgmVolume: 0.25,
      duckingEnabled: true,
    },
    tracks: [
      {
        id: 'track-text',
        name: 'Kinetic Captions',
        type: 'text',
        isMuted: false,
        isLocked: false,
        zIndex: 30,
        clips: textClips,
      },
      {
        id: 'track-sfx',
        name: 'SFX Overlays',
        type: 'sfx',
        isMuted: false,
        isLocked: false,
        zIndex: 20,
        clips: sfxClips,
      },
      {
        id: 'track-video',
        name: 'Primary Video',
        type: 'video',
        isMuted: false,
        isLocked: false,
        zIndex: 10,
        clips: videoClips,
      },
    ],
  };
}

/**
 * Validates and sanitizes any candidate TimelineProject
 */
function sanitizeTimelineProject(
  raw: any,
  fallbackProject: TimelineProject
): TimelineProject {
  if (!raw || typeof raw !== 'object') return fallbackProject;

  const tracks = Array.isArray(raw.tracks) ? raw.tracks : fallbackProject.tracks;

  const hasVideoTrack = tracks.some((t: TimelineTrack) => t.type === 'video');
  if (!hasVideoTrack) {
    return fallbackProject;
  }

  // Ensure total duration is computed
  let calculatedDuration = 0;
  for (const t of tracks) {
    if (Array.isArray(t.clips)) {
      for (const c of t.clips) {
        const end = (c.startOnTimeline || 0) + (c.duration || 0);
        if (end > calculatedDuration) calculatedDuration = end;
      }
    }
  }

  return {
    schemaVersion: '1.0.0',
    projectMetadata: {
      id: raw.projectMetadata?.id || fallbackProject.projectMetadata.id,
      title: raw.projectMetadata?.title || fallbackProject.projectMetadata.title,
      targetAspectRatio: raw.projectMetadata?.targetAspectRatio || '9:16',
      width: raw.projectMetadata?.width || 1080,
      height: raw.projectMetadata?.height || 1920,
      frameRate: raw.projectMetadata?.frameRate || 30,
      totalDuration: Number((raw.projectMetadata?.totalDuration || calculatedDuration).toFixed(3)),
      createdAt: raw.projectMetadata?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    globalAudioTracks: {
      bgmVolume: raw.globalAudioTracks?.bgmVolume ?? 0.25,
      duckingEnabled: raw.globalAudioTracks?.duckingEnabled ?? true,
    },
    tracks: tracks.map((t: TimelineTrack, index: number) => ({
      id: t.id || `track_${index}`,
      name: t.name || `Track ${index + 1}`,
      type: t.type || 'video',
      isMuted: !!t.isMuted,
      isLocked: !!t.isLocked,
      zIndex: t.zIndex || (t.type === 'text' ? 30 : t.type === 'sfx' ? 20 : 10),
      clips: Array.isArray(t.clips) ? t.clips : [],
    })),
  };
}

/**
 * POST /api/editor/auto-edit
 * Smart-Polish Auto-Edit pipeline powered by Gemini Flash
 */
router.post('/auto-edit', async (req, res) => {
  try {
    const {
      videoMetadata,
      words = [],
      options = {},
    } = req.body;

    if (!videoMetadata || !videoMetadata.id) {
      return res.status(400).json({ error: 'Missing videoMetadata with id' });
    }

    const rawWords: WordTimestamp[] = Array.isArray(words) ? words : [];

    // Pre-calculate deterministic benchmark
    const deterministicProject = generateDeterministicAutoEdit(
      videoMetadata,
      rawWords,
      options
    );

    const ai = getGeminiClient();
    let finalProject: TimelineProject = deterministicProject;
    let engineSource: 'gemini' | 'local_engine' = 'local_engine';

    if (ai && rawWords.length > 0) {
      try {
        const userPrompt = JSON.stringify({
          instruction: 'Analyze speech cadence, trim silences > 0.4s, add punch zooms on emphasis words, insert viral SFX, and generate 2-3 word kinetic captions.',
          videoMetadata: {
            id: videoMetadata.id,
            title: videoMetadata.title || 'Viral Short',
            duration: videoMetadata.duration || (rawWords[rawWords.length - 1]?.end || 10),
            targetAspectRatio: videoMetadata.targetAspectRatio || '9:16',
          },
          wordsSample: rawWords.map((w) => ({
            word: w.word,
            start: Number(w.start.toFixed(2)),
            end: Number(w.end.toFixed(2)),
          })),
        });

        // Model preference: user requested gemini-2.5-flash (or gemini-1.5-flash).
        // Per skill guidelines, gemini-2.5-flash is used directly; fallback to gemini-3.8-flash
        const modelsToTry = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];
        let geminiResponseText: string | null = null;

        for (const model of modelsToTry) {
          try {
            const response = await withTimeout(
              ai.models.generateContent({
                model,
                contents: [
                  { role: 'user', parts: [{ text: userPrompt }] },
                ],
                config: {
                  systemInstruction: SYSTEM_PROMPT_A,
                  responseMimeType: 'application/json',
                },
              }),
              12000,
              `Gemini timeout on ${model}`
            );

            if (response && response.text) {
              geminiResponseText = response.text.trim();
              break;
            }
          } catch (modelErr: any) {
            console.warn(`Gemini auto-edit attempt with ${model} notice:`, modelErr?.message);
          }
        }

        if (geminiResponseText) {
          const parsed = JSON.parse(geminiResponseText);
          finalProject = sanitizeTimelineProject(parsed, deterministicProject);
          engineSource = 'gemini';
        }
      } catch (err: any) {
        console.warn('Gemini auto-edit notice: smoothly using local deterministic editor engine');
        finalProject = deterministicProject;
        engineSource = 'local_engine';
      }
    }

    // Compute stats
    const videoTrack = finalProject.tracks.find((t) => t.type === 'video');
    const sfxTrack = finalProject.tracks.find((t) => t.type === 'sfx');
    const textTrack = finalProject.tracks.find((t) => t.type === 'text');

    const originalDuration = videoMetadata.duration || (rawWords.length > 0 ? rawWords[rawWords.length - 1].end : 0);
    const trimmedDuration = finalProject.projectMetadata.totalDuration;
    const silenceRemoved = Math.max(0, Number((originalDuration - trimmedDuration).toFixed(2)));

    let punchZoomsCount = 0;
    if (videoTrack) {
      videoTrack.clips.forEach((c) => {
        if ('keyframes' in c && Array.isArray((c as VideoClip).keyframes)) {
          punchZoomsCount += (c as VideoClip).keyframes.filter((kf) => kf.scale > 1.1).length;
        }
      });
    }

    const stats = {
      originalDurationSec: Number(originalDuration.toFixed(2)),
      trimmedDurationSec: Number(trimmedDuration.toFixed(2)),
      silenceRemovedSec: silenceRemoved,
      cutsCount: videoTrack ? videoTrack.clips.length : 0,
      punchZoomsCount,
      sfxCount: sfxTrack ? sfxTrack.clips.length : 0,
      captionsCount: textTrack ? textTrack.clips.length : 0,
    };

    return res.json({
      success: true,
      data: finalProject,
      source: engineSource,
      stats,
      message:
        engineSource === 'gemini'
          ? 'Successfully generated AI Smart-Polish EDL via Gemini Flash'
          : 'Generated Smart-Polish EDL via local zero-latency audio intelligence engine',
    });
  } catch (err: any) {
    console.error('Error in /api/editor/auto-edit:', err);
    return res.status(500).json({ error: err.message || 'Auto-edit processing failed' });
  }
});

/**
 * POST /api/editor/command
 * Phase 6: Conversational AI Command Mutator powered by Gemini Flash (System Prompt B)
 */
router.post('/command', async (req, res) => {
  try {
    const { currentState, userInstruction } = req.body;

    if (!currentState || !currentState.tracks || !Array.isArray(currentState.tracks)) {
      return res.status(400).json({ error: 'Missing or invalid currentState (TimelineProject required)' });
    }

    if (!userInstruction || typeof userInstruction !== 'string' || !userInstruction.trim()) {
      return res.status(400).json({ error: 'Missing userInstruction prompt string' });
    }

    const trimmedInstruction = userInstruction.trim();

    // Local benchmark mutation fallback
    const localMutation = mutateTimelineLocally(currentState, trimmedInstruction);
    let finalProject: TimelineProject = localMutation.project;
    let engineSource: 'gemini' | 'local_engine' = 'local_engine';
    let actionSummary = localMutation.summary;

    const ai = getGeminiClient();
    if (ai) {
      try {
        const userPrompt = JSON.stringify({
          instruction: trimmedInstruction,
          currentState: {
            schemaVersion: currentState.schemaVersion || '1.0.0',
            projectMetadata: currentState.projectMetadata,
            globalAudioTracks: currentState.globalAudioTracks,
            tracks: currentState.tracks,
          },
        });

        const modelsToTry = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];
        let geminiResponseText: string | null = null;

        for (const model of modelsToTry) {
          try {
            const response = await withTimeout(
              ai.models.generateContent({
                model,
                contents: [
                  { role: 'user', parts: [{ text: userPrompt }] },
                ],
                config: {
                  systemInstruction: SYSTEM_PROMPT_B,
                  responseMimeType: 'application/json',
                },
              }),
              14000,
              `Gemini timeout on ${model}`
            );

            if (response && response.text) {
              geminiResponseText = response.text.trim();
              break;
            }
          } catch (modelErr: any) {
            console.warn(`Gemini command attempt with ${model} notice:`, modelErr?.message);
          }
        }

        if (geminiResponseText) {
          const parsed = JSON.parse(geminiResponseText);
          finalProject = sanitizeTimelineProject(parsed, localMutation.project);
          engineSource = 'gemini';
          actionSummary = `AI applied: "${trimmedInstruction}"`;
        }
      } catch (err: any) {
        console.warn('Gemini command notice: smoothly falling back to local mutator:', err?.message);
        finalProject = localMutation.project;
        engineSource = 'local_engine';
      }
    }

    return res.json({
      success: true,
      data: finalProject,
      source: engineSource,
      actionSummary,
      message:
        engineSource === 'gemini'
          ? `Successfully mutated timeline via Gemini Flash: "${trimmedInstruction}"`
          : `Applied timeline mutation via local state engine: "${trimmedInstruction}"`,
    });
  } catch (err: any) {
    console.error('Error in /api/editor/command:', err);
    return res.status(500).json({ error: err.message || 'Command processing failed' });
  }
});

export default router;
