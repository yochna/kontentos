import express from 'express';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import * as db from '../db.js';
import { envGeminiKey } from '../geminiKey.js';
import { readEngineJson } from '../engine.js';
import { asId } from '../safeId.js';
import { safeMessage } from '../errorText.js';

const router = express.Router();

/** A clip id, made safe to put in a download filename: nothing that could break the header out. */
const fileSafe = (value: string) => value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80) || 'subtitles';


function getGeminiClient(): GoogleGenAI | null {
  // Only the deployment's key: a request-supplied one would have to come out of the browser's
  // storage, and a key that leaves a creator's machine is no longer theirs to keep.
  const apiKey = envGeminiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'kontentos-editorial-studio',
      },
    },
  });
}

const generateWithTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: Gemini response took too long')), timeoutMs)
    ),
  ]);
};

// Resilient helper to execute Gemini generation with exponential backoff & model fallbacks
async function generateGeminiContentWithRetry(
  ai: GoogleGenAI,
  params: { contents: any; config?: any; preferredModel?: string }
): Promise<any> {
  const modelsToTry = [
    params.preferredModel || 'gemini-3.8-flash',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
  ];
  const uniqueModels = Array.from(new Set(modelsToTry));

  let lastError: any = null;
  for (const model of uniqueModels) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await generateWithTimeout(
          ai.models.generateContent({
            model,
            contents: params.contents,
            config: params.config,
          }),
          10000
        );
        return response;
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        const isTransient =
          errMsg.includes('503') ||
          errMsg.includes('high demand') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('429') ||
          errMsg.includes('ResourceExhausted');

        if (isTransient && attempt === 1) {
          await new Promise((r) => setTimeout(r, 600));
        } else {
          break; // Try next model candidate
        }
      }
    }
  }
  throw lastError;
}

// Helper to parse SRT blocks into structured segments
function parseSrtToSegments(srt: string): Array<{ id: number; start: string; end: string; text: string }> {
  const segments: Array<{ id: number; start: string; end: string; text: string }> = [];
  const blocks = srt.trim().split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      const id = parseInt(lines[0], 10) || segments.length + 1;
      const timeLine = lines[1];
      const match = timeLine.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
      if (match) {
        const text = lines.slice(2).join(' ');
        segments.push({
          id,
          start: match[1].replace('.', ','),
          end: match[2].replace('.', ','),
          text,
        });
      }
    }
  }
  return segments;
}

// Helper to convert SRT string to WebVTT format
function srtToVtt(srt: string): string {
  let vtt = 'WEBVTT\n\n';
  vtt += srt
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .replace(/^\d+\r?\n/gm, ''); // Remove sequence numbers
  return vtt.trim();
}

// POST /api/transcribe/translate — Dedicated STT Subtitle Translation
router.post('/translate', async (req, res) => {
  try {
    const { videoId: sentVideoId, targetLanguage = 'Spanish', srt: inputSrt, transcript: inputTranscript } = req.body;
    const videoId = asId(sentVideoId);
    if (!videoId && !inputSrt && !inputTranscript) {
      return res.status(400).json({ error: 'Missing videoId or subtitle content to translate' });
    }

    let baseSrt = inputSrt || '';
    let baseTranscript = inputTranscript || '';

    if (!baseSrt && videoId) {
      const existing = await db.getSubtitles(videoId, req.userId);
      if (existing) {
        baseSrt = existing.srt_content;
        baseTranscript = existing.transcript_text;
      }
    }

    if (!baseSrt && !baseTranscript) {
      // A translation of nothing is a licence to invent. The stored cues are the only source this
      // route will put words into, so an untranscribed clip gets an error instead of a script.
      return res.status(409).json({
        error: 'Nothing real to translate yet — transcribe this clip, or paste its script, first.',
      });
    }

    const ai = getGeminiClient();
    let translatedSrt = '';
    let translatedTranscript = '';
    let segments: Array<{ id: number; start: string; end: string; text: string }> = [];

    if (!ai) {
      return res.status(502).json({
        error: `No translation engine is configured, so KontentOS will not write ${targetLanguage} subtitles for you.`,
      });
    }

    try {
      const prompt = `You are an expert subtitle translator and linguistic localizer for viral short-form video (Instagram Reels / TikTok).
Translate the following SRT subtitles and full transcript accurately into "${targetLanguage}".
Requirements:
1. Preserve the EXACT timing timestamps and sequential numbers (00:00:00,000 --> 00:00:02,500).
2. Adapt natural spoken idioms and high-energy creator pacing in "${targetLanguage}".
3. Keep line lengths suitable for kinetic captions on mobile screens (3 to 6 words per subtitle line).
4. Translate only what is written here. Do not add hooks, claims or calls to action of your own.

Original Transcript:
${baseTranscript}

Original SRT Subtitles:
${baseSrt}

Return JSON strictly matching this schema:
{
  "language": "${targetLanguage}",
  "transcript": "Translated full transcript in ${targetLanguage}",
  "srt": "Translated complete SRT subtitles with timestamps and line numbers",
  "segments": [
    { "id": 1, "start": "00:00:00,000", "end": "00:00:02,500", "text": "Translated segment line" }
  ]
}`;

      const response = await generateGeminiContentWithRetry(ai, {
        preferredModel: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const text = (typeof response.text === 'function' ? response.text() : response.text) || '{}';
      const parsed = readEngineJson<any>(text) || {};
      translatedSrt = parsed.srt || '';
      translatedTranscript = parsed.transcript || '';
      segments = parsed.segments || [];
    } catch (err: any) {
      console.warn('[transcribe/translate] engine did not answer:', err?.message);
    }

    if (!translatedSrt && !translatedTranscript) {
      return res.status(502).json({
        error: `The translation engine gave no ${targetLanguage} answer. Your original captions are untouched.`,
      });
    }

    const translatedVtt = srtToVtt(translatedSrt);
    if (!segments || segments.length === 0) {
      segments = parseSrtToSegments(translatedSrt);
    }

    let savedSub = null;
    if (videoId) {
      savedSub = await db.saveSubtitles({
        video_id: videoId,
        srt_content: translatedSrt,
        vtt_content: translatedVtt,
        transcript_text: translatedTranscript,
        language: targetLanguage,
        segments,
      }, req.userId);
    }

    res.json({
      success: true,
      data: {
        id: savedSub?.id || `sub_trans_${Date.now()}`,
        video_id: videoId,
        srt_content: translatedSrt,
        vtt_content: translatedVtt,
        transcript_text: translatedTranscript,
        language: targetLanguage,
        segments,
      },
      message: `Successfully translated subtitles to ${targetLanguage}`,
    });
  } catch (err: any) {
    console.error('Error in /api/transcribe/translate:', err);
    res.status(500).json({ error: safeMessage(err, 'AI service failed') });
  }
});

// POST /api/transcribe/live — Save in-browser speech dictation
router.post('/live', async (req, res) => {
  try {
    const { videoId: sentVideoId, transcriptText: rawTranscript, text, language = 'English' } = req.body;
    const videoId = asId(sentVideoId);
    const transcriptText = typeof rawTranscript === 'string' ? rawTranscript : typeof text === 'string' ? text : '';
    if (!videoId || !transcriptText.trim()) {
      return res.status(400).json({ error: 'Missing videoId or transcriptText' });
    }

    // Split spoken text into short ~3-4 second subtitle chunks
    const words = transcriptText.trim().split(/\s+/);
    const chunkSize = 5;
    const lines: string[] = [];
    for (let i = 0; i < words.length; i += chunkSize) {
      lines.push(words.slice(i, i + chunkSize).join(' '));
    }

    let srt = '';
    const segments: Array<{ id: number; start: string; end: string; text: string }> = [];
    let currentSec = 0;

    lines.forEach((line, idx) => {
      const id = idx + 1;
      const startMs = currentSec * 1000;
      const endMs = (currentSec + 2.5) * 1000;
      currentSec += 2.5;

      const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const remMs = ms % 1000;
        const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        const milliseconds = String(remMs).padStart(3, '0');
        return `${hours}:${minutes}:${seconds},${milliseconds}`;
      };

      const start = formatTime(startMs);
      const end = formatTime(endMs);

      srt += `${id}\n${start} --> ${end}\n${line}\n\n`;
      segments.push({ id, start, end, text: line });
    });

    const vtt = srtToVtt(srt);
    const saved = await db.saveSubtitles({
      video_id: videoId,
      srt_content: srt.trim(),
      vtt_content: vtt,
      transcript_text: transcriptText,
      language,
      segments,
    }, req.userId);

    res.json({
      success: true,
      data: {
        ...saved,
        language,
        segments,
      },
      message: 'Live dictation transcribed and synced successfully',
    });
  } catch (err: any) {
    console.error('Error in /api/transcribe/live:', err);
    res.status(500).json({ error: safeMessage(err, 'AI service failed') });
  }
});

// Direct export endpoints for .srt and .vtt files
router.get('/:videoId/download/srt', async (req, res) => {
  try {
    const subtitles = await db.getSubtitles(req.params.videoId, req.userId);
    if (!subtitles) {
      return res.status(404).send('Subtitles not found');
    }
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${fileSafe(req.params.videoId)}.srt"`);
    res.send(subtitles.srt_content);
  } catch (err: any) {
    res.status(500).send('Could not read those subtitles.');
  }
});

router.get('/:videoId/download/vtt', async (req, res) => {
  try {
    const subtitles = await db.getSubtitles(req.params.videoId, req.userId);
    if (!subtitles) {
      return res.status(404).send('Subtitles not found');
    }
    res.setHeader('Content-Type', 'text/vtt');
    res.setHeader('Content-Disposition', `attachment; filename="${fileSafe(req.params.videoId)}.vtt"`);
    res.send(subtitles.vtt_content);
  } catch (err: any) {
    res.status(500).send('Could not read those subtitles.');
  }
});

export default router;
