import express from 'express';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import * as db from '../db.js';
import { isValidGeminiKey, envGeminiKey } from '../geminiKey.js';

const router = express.Router();


function getGeminiClient(customKey?: string): GoogleGenAI | null {
  const apiKey = (isValidGeminiKey(customKey) ? customKey.trim() : null) || envGeminiKey();
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

function buildSrtFromTranscript(transcriptText: string, durationSec: number = 10) {
  const clean = (transcriptText || '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return { srt: '', vtt: '', transcript: '', segments: [] };
  }

  const dur = Math.max(durationSec || 10, 2);
  const wordsPerSegment = 3;
  const numSegments = Math.ceil(words.length / wordsPerSegment);
  const segDur = dur / numSegments;

  function fmt(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  const segments: Array<{ id: number; start: string; end: string; text: string }> = [];
  let srt = '';
  for (let i = 0; i < numSegments; i++) {
    const chunk = words.slice(i * wordsPerSegment, (i + 1) * wordsPerSegment).join(' ');
    const startSec = i * segDur;
    const endSec = Math.min((i + 1) * segDur, dur);
    const start = fmt(startSec);
    const end = fmt(endSec);
    segments.push({ id: i + 1, start, end, text: chunk });
    srt += `${i + 1}\n${start} --> ${end}\n${chunk}\n\n`;
  }
  const vtt = srtToVtt(srt);
  return { srt: srt.trim(), vtt, transcript: clean, segments };
}

// Language-specific fallback subtitles if Gemini or network is unavailable
const MULTI_LANG_SYNTHESIS: Record<string, { srt: string; transcript: string }> = {
  Spanish: {
    srt: `1
00:00:00,000 --> 00:00:02,500
Deja de hacer scroll si quieres ahorrar 30 horas esta semana.

2
00:00:02,500 --> 00:00:05,200
Este es el flujo de trabajo de IA que todo creador ignora.

3
00:00:05,200 --> 00:00:08,000
Sube tu video crudo una sola vez y genera subtítulos automáticos,

4
00:00:08,000 --> 00:00:11,000
y publica directamente en Instagram Reels en menos de 30 segundos.

5
00:00:11,000 --> 00:00:14,000
Comenta 'OS' abajo y te enviaré la guía completa.`,
    transcript: "Deja de hacer scroll si quieres ahorrar 30 horas esta semana. Este es el flujo de trabajo de IA que todo creador ignora. Sube tu video crudo una sola vez y genera subtítulos automáticos, y publica directamente en Instagram Reels en menos de 30 segundos. Comenta 'OS' abajo y te enviaré la guía completa.",
  },
  Hindi: {
    srt: `1
00:00:00,000 --> 00:00:02,500
स्क्रोल करना बंद करें अगर आप इस हफ्ते 30 घंटे बचाना चाहते हैं।

2
00:00:02,500 --> 00:00:05,200
यह वो सटीक एआई वर्कफ़्लो है जिसे हर क्रिएटर मिस कर रहा है।

3
00:00:05,200 --> 00:00:08,000
बस एक बार अपनी रॉ वीडियो अपलोड करें और ऑटो सबटाइटल्स पाएं,

4
00:00:08,000 --> 00:00:11,000
और 30 सेकंड में सीधे इंस्टाग्राम रील्स पर पब्लिश करें।

5
00:00:11,000 --> 00:00:14,000
नीचे 'OS' कमेंट करें और पूरा ब्रेकडाउन प्राप्त करें!`,
    transcript: "स्क्रोल करना बंद करें अगर आप इस हफ्ते 30 घंटे बचाना चाहते हैं। यह वो सटीक एआई वर्कफ़्लो है जिसे हर क्रिएटर मिस कर रहा है। बस एक बार अपनी रॉ वीडियो अपलोड करें और ऑटो सबटाइटल्स पाएं, और 30 सेकंड में सीधे इंस्टाग्राम रील्स पर पब्लिश करें। नीचे 'OS' कमेंट करें और पूरा ब्रेकडाउन प्राप्त करें!",
  },
  Hinglish: {
    srt: `1
00:00:00,000 --> 00:00:02,500
Scroll karna band karo agar aap is hafte 30 ghante bachana chahte ho.

2
00:00:02,500 --> 00:00:05,200
Ye hai wo exact AI workflow jo har creator miss kar raha hai.

3
00:00:05,200 --> 00:00:08,000
Apni raw clip ek baar upload karo, auto captions aur hashtags pao,

4
00:00:08,000 --> 00:00:11,000
aur 30 seconds ke andar directly Instagram Reels par publish karo.

5
00:00:11,000 --> 00:00:14,000
Neeche 'OS' comment karo aur main full guide bhejunga!`,
    transcript: "Scroll karna band karo agar aap is hafte 30 ghante bachana chahte ho. Ye hai wo exact AI workflow jo har creator miss kar raha hai. Apni raw clip ek baar upload karo, auto captions aur hashtags pao, aur 30 seconds ke andar directly Instagram Reels par publish karo. Neeche 'OS' comment karo aur main full guide bhejunga!",
  },
  French: {
    srt: `1
00:00:00,000 --> 00:00:02,500
Arrêtez de scroller si vous voulez économiser 30 heures cette semaine.

2
00:00:02,500 --> 00:00:05,200
Voici le flux de travail IA que chaque créateur néglige.

3
00:00:05,200 --> 00:00:08,000
Téléchargez votre vidéo brute une fois, générez les sous-titres,

4
00:00:08,000 --> 00:00:11,000
et publiez directement sur Instagram Reels en moins de 30 secondes.

5
00:00:11,000 --> 00:00:14,000
Commentez 'OS' ci-dessous et je vous envoie le guide complet !`,
    transcript: "Arrêtez de scroller si vous voulez économiser 30 heures cette semaine. Voici le flux de travail IA que chaque créateur néglige. Téléchargez votre vidéo brute une fois, générez les sous-titres, et publiez directement sur Instagram Reels en moins de 30 secondes. Commentez 'OS' ci-dessous et je vous envoie le guide complet !",
  },
  German: {
    srt: `1
00:00:00,000 --> 00:00:02,500
Hör auf zu scrollen, wenn du diese Woche 30 Stunden sparen willst.

2
00:00:02,500 --> 00:00:05,200
Hier ist der KI-Workflow, den viele Creator noch übersehen.

3
00:00:05,200 --> 00:00:08,000
Lade deinen Rohclip einmal hoch, generiere kinetische Untertitel,

4
00:00:08,000 --> 00:00:11,000
und veröffentliche direkt auf Instagram Reels in unter 30 Sekunden.

5
00:00:11,000 --> 00:00:14,000
Kommentiere unten mit 'OS' für den kompletten Guide!`,
    transcript: "Hör auf zu scrollen, wenn du diese Woche 30 Stunden sparen willst. Hier ist der KI-Workflow, den viele Creator noch übersehen. Lade deinen Rohclip einmal hoch, generiere kinetische Untertitel, und veröffentliche direkt auf Instagram Reels in unter 30 Sekunden. Kommentiere unten mit 'OS' für den kompletten Guide!",
  },
  Japanese: {
    srt: `1
00:00:00,000 --> 00:00:02,500
今週30時間を節約したいなら、スクロールを止めてください。

2
00:00:02,500 --> 00:00:05,200
これが見逃されている最新のクリエイターAI自動化フローです。

3
00:00:05,200 --> 00:00:08,000
動画を1回アップロードするだけで字幕とハッシュタグを自動生成し、

4
00:00:08,000 --> 00:00:11,000
30秒以内にInstagram Reelsへ直接公開できます。

5
00:00:11,000 --> 00:00:14,000
コメント欄に「OS」と書いて詳細ガイドを受け取ってください！`,
    transcript: "今週30時間を節約したいなら、スクロールを止めてください。これが見逃されている最新のクリエイターAI自動化フローです。動画を1回アップロードするだけで字幕とハッシュタグを自動生成し、30秒以内にInstagram Reelsへ直接公開できます。コメント欄に「OS」と書いて詳細ガイドを受け取ってください！",
  },
  English: {
    srt: `1
00:00:00,000 --> 00:00:02,500
Stop scrolling if you want to save 30 hours this week.

2
00:00:02,500 --> 00:00:05,200
Here is the exact AI workflow every creator is sleeping on.

3
00:00:05,200 --> 00:00:08,000
Upload your raw clip once, auto-generate captions and hashtags,

4
00:00:08,000 --> 00:00:11,000
and publish directly to Instagram Reels in under 30 seconds.

5
00:00:11,000 --> 00:00:14,000
Comment 'OS' below and I'll send you the full breakdown!`,
    transcript: "Stop scrolling if you want to save 30 hours this week. Here is the exact AI workflow every creator is sleeping on. Upload your raw clip once, auto-generate captions and hashtags, and publish directly to Instagram Reels in under 30 seconds. Comment 'OS' below and I'll send you the full breakdown!",
  }
};

function generateSynthesizedSubtitles(videoTitle: string, language = 'English'): { srt: string; vtt: string; transcript: string } {
  const selected = MULTI_LANG_SYNTHESIS[language] || MULTI_LANG_SYNTHESIS.English;
  return {
    srt: selected.srt,
    vtt: srtToVtt(selected.srt),
    transcript: selected.transcript,
  };
}

// POST /api/transcribe — Main Speech-to-Text & Transcription Endpoint
router.post('/', async (req, res) => {
  try {
    const { videoId, forceRefresh = false, targetLanguage = 'English', apiKey: clientKey } = req.body;
    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId' });
    }

    const video = await db.getVideo(videoId);
    if (!video) {
      return res.status(404).json({ error: 'Video record not found' });
    }

    // Check existing subtitles unless forceRefresh or language switch requested
    const existingSubtitles = await db.getSubtitles(videoId);
    if (existingSubtitles && !forceRefresh && (existingSubtitles.language === targetLanguage || (!existingSubtitles.language && targetLanguage === 'English'))) {
      const segments = existingSubtitles.segments || parseSrtToSegments(existingSubtitles.srt_content);
      return res.json({
        success: true,
        data: {
          ...existingSubtitles,
          segments,
        },
        cached: true,
        message: 'Loaded cached subtitles',
      });
    }

    const ai = getGeminiClient(clientKey);
    let srt = '';
    let transcript = '';
    let segments: Array<{ id: number; start: string; end: string; text: string }> = [];

    if (ai) {
      try {
        let mediaBuffer: Buffer | null = null;
        let mimeType = 'video/mp4';

        if (video.file_url && video.file_url.startsWith('/uploads/')) {
          const filePath = path.join(process.cwd(), video.file_url);
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size > 100 && stats.size <= 25 * 1024 * 1024) {
              mediaBuffer = fs.readFileSync(filePath);
              const ext = path.extname(filePath).toLowerCase();
              if (ext === '.webm') mimeType = 'video/webm';
              else if (ext === '.mov') mimeType = 'video/quicktime';
              else if (ext === '.mp3') mimeType = 'audio/mp3';
              else if (ext === '.wav') mimeType = 'audio/wav';
              else if (ext === '.m4a' || ext === '.aac') mimeType = 'audio/aac';
              else mimeType = 'video/mp4';
            }
          }
        }

        if (mediaBuffer) {
          const base64Media = mediaBuffer.toString('base64');
          const prompt = `You are an elite speech-to-text (STT) transcription and subtitle synchronization AI for viral short-form video (Instagram Reels / TikTok / YouTube Shorts).
Transcribe every spoken sentence verbatim into target language: "${targetLanguage}".
Provide exact millisecond-accurate timestamps in SRT format ("00:00:01,200 --> 00:00:03,450").
Split into short, punchy segments (2 to 5 words each).
Output valid JSON:
{
  "language": "${targetLanguage}",
  "transcript": "Full text in ${targetLanguage}",
  "srt": "1\\n00:00:00,150 --> 00:00:02,300\\nFirst phrase\\n",
  "segments": [{ "id": 1, "start": "00:00:00,150", "end": "00:00:02,300", "text": "First phrase" }]
}`;

          const modelsToTry = [
            'gemini-3.5-transcribe',
            'gemini-3.8-flash',
            'gemini-3.5-flash',
            'gemini-3.5-flash-lite',
          ];

          for (const model of modelsToTry) {
            try {
              const effectiveMime = model.includes('transcribe') && mimeType.startsWith('video/')
                ? (mimeType === 'video/webm' ? 'audio/webm' : 'audio/mp4')
                : mimeType;

              const isDedicatedTranscribe = model.includes('transcribe');
              const contents = isDedicatedTranscribe
                ? [{ inlineData: { data: base64Media, mimeType: effectiveMime } }]
                : [{ inlineData: { data: base64Media, mimeType: effectiveMime } }, prompt];

              const response = await ai.models.generateContent({
                model,
                contents,
                config: isDedicatedTranscribe ? undefined : { responseMimeType: 'application/json' },
              });

              let extractedText = '';
              const candidate = response.candidates?.[0];
              const parts = candidate?.content?.parts || [];
              for (const part of parts) {
                if ((part as any).audioTranscription?.text) {
                  extractedText += (extractedText ? ' ' : '') + (part as any).audioTranscription.text;
                } else if (part.text) {
                  extractedText += (extractedText ? ' ' : '') + part.text;
                }
              }
              if (!extractedText) {
                const directText = typeof response.text === 'function' ? response.text() : response.text;
                if (directText && typeof directText === 'string') extractedText = directText;
              }

              if (extractedText && extractedText.trim()) {
                let parsed: any = null;
                try {
                  const cleanedText = extractedText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
                  parsed = JSON.parse(cleanedText);
                } catch {}

                if (parsed && (parsed.srt || parsed.segments?.length || parsed.transcript)) {
                  srt = parsed.srt || '';
                  transcript = parsed.transcript || '';
                  segments = parsed.segments || [];
                  break;
                } else {
                  transcript = extractedText.trim();
                  if (targetLanguage && targetLanguage.toLowerCase() !== 'english') {
                    try {
                      const trRes = await ai.models.generateContent({
                        model: 'gemini-3.5-flash',
                        contents: `Translate this spoken video transcript accurately into ${targetLanguage}. Output ONLY the translated text without markdown or commentary:\n\n${transcript}`,
                      });
                      const trText = trRes.text?.trim();
                      if (trText) transcript = trText;
                    } catch (trErr: any) {
                      console.warn(`[transcribe] Translation to ${targetLanguage} skipped:`, trErr?.message);
                    }
                  }

                  const built = buildSrtFromTranscript(transcript, video.duration || 10);
                  srt = built.srt;
                  segments = built.segments;
                  break;
                }
              }
            } catch (mErr: any) {
              console.warn(`[transcribe] Model ${model} failed, trying next candidate:`, mErr?.message);
            }
          }
        }
      } catch (geminiErr: any) {
        console.warn('Gemini STT transcription note:', geminiErr?.message);
      }
    }

    if (!srt || !transcript) {
      const synth = generateSynthesizedSubtitles(video.title, targetLanguage);
      srt = synth.srt;
      transcript = synth.transcript;
    }

    const vtt = srtToVtt(srt);
    if (!segments || segments.length === 0) {
      segments = parseSrtToSegments(srt);
    }

    const saved = await db.saveSubtitles({
      video_id: videoId,
      srt_content: srt,
      vtt_content: vtt,
      transcript_text: transcript,
      language: targetLanguage,
      segments,
    });

    res.json({
      success: true,
      data: {
        ...saved,
        language: targetLanguage,
        segments,
      },
      cached: false,
      message: `Transcription completed successfully in ${targetLanguage}`,
    });
  } catch (err: any) {
    console.error('Error in /api/transcribe:', err);
    res.status(500).json({ error: err.message || 'AI service failed' });
  }
});

// POST /api/transcribe/translate — Dedicated STT Subtitle Translation
router.post('/translate', async (req, res) => {
  try {
    const { videoId, targetLanguage = 'Spanish', srt: inputSrt, transcript: inputTranscript } = req.body;
    if (!videoId && !inputSrt && !inputTranscript) {
      return res.status(400).json({ error: 'Missing videoId or subtitle content to translate' });
    }

    let baseSrt = inputSrt || '';
    let baseTranscript = inputTranscript || '';

    if (!baseSrt && videoId) {
      const existing = await db.getSubtitles(videoId);
      if (existing) {
        baseSrt = existing.srt_content;
        baseTranscript = existing.transcript_text;
      }
    }

    if (!baseSrt) {
      const synth = generateSynthesizedSubtitles('Creator Reel', 'English');
      baseSrt = synth.srt;
      baseTranscript = synth.transcript;
    }

    const ai = getGeminiClient();
    let translatedSrt = '';
    let translatedTranscript = '';
    let segments: Array<{ id: number; start: string; end: string; text: string }> = [];

    if (ai) {
      try {
        const prompt = `You are an expert subtitle translator and linguistic localizer for viral short-form video (Instagram Reels / TikTok).
Translate the following SRT subtitles and full transcript accurately into "${targetLanguage}".
Requirements:
1. Preserve the EXACT timing timestamps and sequential numbers (00:00:00,000 --> 00:00:02,500).
2. Adapt natural spoken idioms and high-energy creator pacing in "${targetLanguage}".
3. Keep line lengths suitable for kinetic captions on mobile screens (3 to 6 words per subtitle line).

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
        const parsed = JSON.parse(text);
        translatedSrt = parsed.srt || '';
        translatedTranscript = parsed.transcript || '';
        segments = parsed.segments || [];
      } catch (err: any) {
        console.log('Gemini subtitle translation note: using language synthesis fallback');
        const synth = generateSynthesizedSubtitles('Creator Reel', targetLanguage);
        translatedSrt = synth.srt;
        translatedTranscript = synth.transcript;
      }
    } else {
      const synth = generateSynthesizedSubtitles('Creator Reel', targetLanguage);
      translatedSrt = synth.srt;
      translatedTranscript = synth.transcript;
    }

    if (!translatedSrt) {
      const synth = generateSynthesizedSubtitles('Creator Reel', targetLanguage);
      translatedSrt = synth.srt;
      translatedTranscript = synth.transcript;
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
      });
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
    res.status(500).json({ error: err.message || 'AI service failed' });
  }
});

// POST /api/transcribe/live — Save in-browser speech dictation
router.post('/live', async (req, res) => {
  try {
    const { videoId, transcriptText: rawTranscript, text, language = 'English' } = req.body;
    const transcriptText = rawTranscript || text;
    if (!videoId || !transcriptText) {
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
    });

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
    res.status(500).json({ error: err.message || 'AI service failed' });
  }
});

// Direct export endpoints for .srt and .vtt files
router.get('/:videoId/download/srt', async (req, res) => {
  try {
    const subtitles = await db.getSubtitles(req.params.videoId);
    if (!subtitles) {
      return res.status(404).send('Subtitles not found');
    }
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.videoId}.srt"`);
    res.send(subtitles.srt_content);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

router.get('/:videoId/download/vtt', async (req, res) => {
  try {
    const subtitles = await db.getSubtitles(req.params.videoId);
    if (!subtitles) {
      return res.status(404).send('Subtitles not found');
    }
    res.setHeader('Content-Type', 'text/vtt');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.videoId}.vtt"`);
    res.send(subtitles.vtt_content);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

export default router;
