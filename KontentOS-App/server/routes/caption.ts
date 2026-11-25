import express from 'express';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import * as db from '../db.js';
import { envGeminiKey } from '../geminiKey.js';
import { engineTimeout, isEngineCeiling, readEngineJson } from '../engine.js';
import { asId } from '../safeId.js';
import { safeMessage } from '../errorText.js';

const router = express.Router();


function getGeminiClient(): GoogleGenAI | null {
  // Only the deployment's key — see the note in routes/transcribe.ts.
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

// The Room station's creativity slider, carried to the model. Anything unusable becomes the default.
function clampTemperature(value: unknown, fallback = 0.7): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

// Probed against the live API: 3.8-flash, 3.1-flash-lite and flash-latest return 503 under load,
// 2.5/2.0-flash are retired (404), and 3.5-flash-lite is the candidate that actually answers. It
// can still stall when Google is shedding load, so one attempt gets 15s before the next candidate
// runs — long enough to catch a slow answer, short enough that the station never stalls the maker.
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
export const MODEL_ATTEMPT_TIMEOUT_MS = 15000;
/**
 * The Room station's "primary model" dropdown sends one of these as the first candidate. Anything
 * else — a stale value in localStorage, a hand-crafted request — is dropped so the cascade starts
 * from the engine that is known to answer. Older lite names stay accepted as late fallbacks for
 * browsers that still hold them in localStorage.
 */
export const ENGINE_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

export function preferredModelFrom(value: unknown): string | undefined {
  const model = typeof value === 'string' ? value.trim() : '';
  return ENGINE_MODELS.includes(model) ? model : undefined;
}

/**
 * Copy an earlier build wrote out of a title alone — three invented "takeaways" presented as a
 * breakdown of the creator's own reel. Anything already stored in that shape is treated as stale so
 * it regenerates as a scaffold instead of surfacing words nobody said.
 */
const INVENTED_FALLBACK =
  /Here is the breakdown directly from this reel|Batch raw ideas when your creative energy|Let AI automate kinetic subtitles|Syndicate your edited reel across all channels|Here is how to master[\s\S]{0,40}without burning out|90% of creators give up/i;

/**
 * The model sometimes answers the prompt instead of writing the post — "the transcript provided is
 * empty, please supply dialogue" — and that complaint used to be saved and shown as the caption.
 * Real captions never name the pipeline, so anything carrying meta-language about the transcript or
 * the prompt is rejected and the caller falls back to the deterministic copy.
 */
export function isUsableCaption(text: unknown): text is string {
  const s = typeof text === 'string' ? text.trim() : '';
  if (s.length < 40) return false;
  const metaAboutTheJob =
    /transcript|spoken dialogue|script content|this prompt|provided (above|below)|as an ai|language model|please (provide|supply|share|paste)|i (do not|don't) have (the|enough)|unable to (write|generate|create|produce)|no (input|context) (was )?given/i;
  return !metaAboutTheJob.test(s);
}

// Fast & Resilient Gemini caller with strict timeout & model candidates
async function generateGeminiContentWithRetry(
  ai: GoogleGenAI,
  params: { contents: any; config?: any; preferredModel?: string }
): Promise<any> {
  const modelsToTry = [
    params.preferredModel || DEFAULT_MODEL,
    ...ENGINE_MODELS,
  ];
  const uniqueModels = Array.from(new Set(modelsToTry));

  let lastError: any = null;
  for (const model of uniqueModels) {
    try {
      const response = await engineTimeout(
        ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        }),
        MODEL_ATTEMPT_TIMEOUT_MS,
        `Timeout with model ${model}`
      );
      if (response && response.text) {
        return response;
      }
    } catch (err: any) {
      lastError = err;
      // A spent ceiling means the service is busy, not this model — stopping here turns a 45-second
      // spinner into a 15-second one and hands the caller its local copy. Anything else is worth
      // another candidate.
      if (isEngineCeiling(err?.message)) break;
      continue;
    }
  }
  throw lastError || new Error('All model candidates exhausted');
}

/** A filename is not a topic. Never let one become the subject of generated copy. */
function safeTopic(title: string | undefined): string {
  const value = (title || '').trim();
  const fileish =
    /\.(mp4|mov|webm|m4v|avi)$/i.test(value) ||
    /^\d[\d\s\-_()]*$/.test(value) ||
    /^kontentos[_-]/i.test(value) ||
    /(^|[\s_-])finished_reel/i.test(value);
  return fileish ? 'your take' : value || 'your take';
}

// Title-grounded AI prompt builder for full copy, hooks, and hashtags
function buildTitleCopyPrompt(
  title: string,
  platform: string,
  tone: string,
  context: string = ''
): string {
  const cleanTitle = safeTopic(title);
  return `You are a precise social editor writing copy for a real creator's reel.

Write platform-native copy based only on this premise:
Premise: "${cleanTitle}"
Platform: ${platform.toUpperCase()}
Tone: ${tone}
${context ? `Creator notes: "${context}"` : ''}

CRITICAL RULES:
1. Treat the premise as a subject, never as a source of invented claims. Do not claim numbers, results, secrets, mistakes, frameworks or advice that were not provided.
2. Write in clean sentence case. No emojis, no ALL CAPS, no exclamation-point stacking, no "viral", "scroll-stopping", "secret", "10x", "game-changer", "stop scrolling", or fake urgency.
3. Keep it specific and restrained: plain language, short paragraphs, and at most one question. If there is not enough substance, return a short honest scaffold with square-bracket prompts instead of filling the gaps.
4. Match the platform without becoming a template:
   - Instagram: 2-4 sentences or 2-3 compact takeaways, one invitation to respond, and 3-5 subject hashtags.
   - TikTok: 1-2 direct sentences and 3-5 subject hashtags.
   - YouTube Shorts: a short descriptive title, 2-3 sentence description, and 3-5 tags.
   - LinkedIn: a professional observation, 2-3 grounded takeaways, and one discussion question.
   - X: one or two high-signal sentences under 240 characters and 2-3 tags.
   - Threads / Facebook: a conversational note and one open question.
5. Hooks must be four restrained openings grounded in the premise. Do not manufacture a problem, contrarian claim, or curiosity gap that the creator did not earn.
6. Hashtags describe the actual subject. No growth-hack or engagement-bait tags.
7. The call to action is one plain invitation, never a keyword drop or DM promise.
8. The suggested title is under 60 characters and describes the subject without clickbait.

Respond ONLY in valid JSON matching this schema:
{
  "caption": "The finished post copy, with line breaks where they help.",
  "hooks": ["a plain opening", "a plain opening", "a plain opening", "a plain opening"],
  "hashtags": ["topic_tag1", "topic_tag2", "topic_tag3"],
  "callToAction": "One plain invitation to respond.",
  "suggestedTitle": "A specific, non-clickbait title."
}`;
}

// Editorial fallback: a scaffold the creator fills from the take, never invented advice.
function getTitleFallbackCopy(title: string, platform: string, _tone: string) {
  const cleanTitle = safeTopic(title);
  const lower = cleanTitle.toLowerCase();
  const words = lower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
  const stopWords = new Set(['this', 'that', 'with', 'from', 'your', 'have', 'what', 'here', 'just', 'more', 'then', 'they', 'will', 'about', 'video', 'reel', 'post', 'take']);
  const tags = Array.from(new Set(words.filter(w => !stopWords.has(w)))).slice(0, 5);
  if (tags.length === 0) tags.push('creators', 'videoproduction');

  const caption = `${cleanTitle}\n\n[the point you make in the first few seconds]\n\n[what you actually say or show]\n\n[one question or invitation for the viewer]\n\nKontentOS scaffold — fill this from the take.`;

  return {
    caption: platform === 'x' ? caption.slice(0, 280) : caption,
    hooks: [
      `[open with the point of ${cleanTitle}]`,
      `[state what changed in ${cleanTitle}]`,
      `[ask the question ${cleanTitle} answers]`,
      `[show the result you actually have]`,
    ],
    hashtags: tags,
    callToAction: 'What would you add to this?',
    suggestedTitle: cleanTitle.length <= 60 ? cleanTitle : cleanTitle.slice(0, 57).trim() + '…',
  };
}

// Dynamic reel-grounded fallback generator that extracts actual spoken points from the reel
export function getFallbackCopy(platform: string, transcript: string, tone: string, videoTitle?: string) {
  const clean = (transcript || '').replace(/\s+/g, ' ').trim();
  // Extract real spoken sentences or meaningful clauses
  const rawSentences = clean.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 5);

  // "Topic only — …" is what the route substitutes when nothing was transcribed. Quoting it back as
  // the hook and inventing three takeaways underneath it is a lie the creator would post.
  const untranscribed = rawSentences.length === 0 || /^Topic only/.test(rawSentences[0]);
  if (untranscribed) {
    const title = safeTopic(videoTitle);
    const scaffold = `${title}\n\n[the hook — the point you make in the first four seconds]\n\n[what you actually said, in your own words]\n\n[the one thing the viewer should take from it]\n\nKontentOS scaffold — nothing on this take was transcribed, so these lines are yours to fill.`;
    return { caption: platform === 'x' ? scaffold.slice(0, 280) : scaffold, hashtags: [] };
  }

  const hookQuote = rawSentences[0];
  const takeaway1 = rawSentences[1] || hookQuote;
  const takeaway2 = rawSentences[2] || takeaway1;
  const takeaway3 = rawSentences[3] || takeaway2;

  // Derive relevant contextual topic tags from actual spoken content
  const words = clean.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
  const stopWords = new Set(['this', 'that', 'with', 'from', 'your', 'have', 'what', 'here', 'just', 'more', 'then', 'they', 'will', 'about']);
  const filteredWords = words.filter(w => !stopWords.has(w));
  const uniqueTags = Array.from(new Set(filteredWords)).slice(0, 4);
  if (uniqueTags.length === 0) uniqueTags.push('creatoreconomy', 'videotips');

  const lines = [takeaway1, takeaway2, takeaway3].filter((line, index, all) => all.indexOf(line) === index);

  switch (platform) {
    case 'youtube':
      return {
        caption: `${hookQuote}\n\n${lines.map((line) => `• ${line}`).join('\n')}\n\nWhat part of this would you like unpacked next?`,
        hashtags: ['Shorts', ...uniqueTags.slice(0, 4)],
      };
    case 'tiktok':
      return {
        caption: `${hookQuote}\n\n${takeaway1}\n\nWhat do you think?`,
        hashtags: uniqueTags.slice(0, 5),
      };
    case 'linkedin':
      return {
        caption: `${hookQuote}\n\n${lines.map((line) => `• ${line}`).join('\n')}\n\nHow does this show up in your work?`,
        hashtags: ['VideoProduction', ...uniqueTags.slice(0, 4)],
      };
    case 'x':
      return {
        caption: `${hookQuote.slice(0, 110)}\n\n${takeaway1.slice(0, 90)}`,
        hashtags: uniqueTags.slice(0, 3),
      };
    case 'threads':
      return {
        caption: `${hookQuote}\n\n${takeaway1}\n\nDoes this match your experience?`,
        hashtags: ['creators', ...uniqueTags.slice(0, 3)],
      };
    case 'facebook':
      return {
        caption: `${hookQuote}\n\n${takeaway1}\n\n${takeaway2}\n\nWhat is your take on this?`,
        hashtags: ['videoproduction', ...uniqueTags.slice(0, 4)],
      };
    case 'instagram':
    default:
      return {
        caption: `${hookQuote}\n\n${lines.map((line) => `• ${line}`).join('\n')}\n\nWhich point matters most to you?`,
        hashtags: ['videoproduction', ...uniqueTags.slice(0, 4)],
      };
  }
}

// Build strictly reel-grounded AI prompts for each platform
function buildPlatformReelPrompt(platform: string, reelTranscript: string, tone: string, videoTitle?: string): string {
  const cleanTranscript = (reelTranscript || '').trim();
  const titleHeader = videoTitle ? `Reel Title / Topic: "${videoTitle}"\n` : '';

  const corePrompt = `
You are a precise social editor writing copy for a real creator's reel.

Base every sentence, takeaway and hashtag ONLY on the spoken content below:
${titleHeader}Reel Transcript / Spoken Content:
"""
${cleanTranscript}
"""

CRITICAL INSTRUCTIONS:
1. Do not invent claims, numbers, results, secrets, frameworks, or advice that are not in the transcript. If the transcript is thin, write a short scaffold with square-bracket prompts instead of filling gaps.
2. Write in clean sentence case. No emojis, no ALL CAPS, no exclamation-point stacking, no "viral", "scroll-stopping", "secret", "10x", "game-changer", "stop scrolling", or fake urgency.
3. Summarize what the creator actually explains or demonstrates. Quotes must be verbatim.
4. Hashtags name the specific subject of the reel, 3-5 maximum, with no growth-hack tags.
5. Keep one plain invitation to respond at most.

Respond strictly in valid JSON format:
{
  "caption": "The finished platform copy, with line breaks where they help.",
  "hashtags": ["topic_tag1", "topic_tag2", "topic_tag3"]
}
`;

  switch (platform) {
    case 'instagram':
      return `${corePrompt}
Platform Target: Instagram Reels
Tone: ${tone}
Structure:
- One plain opening grounded in the reel's main idea.
- 2-3 compact takeaways from the creator's exact points.
- One invitation to respond.
- 3-5 subject hashtags (without #).
Max 2,000 characters.`;

    case 'youtube':
      return `${corePrompt}
Platform Target: YouTube Shorts
Tone: ${tone}
Structure:
- A descriptive title under 65 characters.
- 2-3 short paragraphs summarizing what the creator says.
- One question for the comments.
- 3-5 relevant keyword tags (without #).
Max 1,000 characters.`;

    case 'tiktok':
      return `${corePrompt}
Platform Target: TikTok
Tone: ${tone}
Structure:
- 1-2 direct sentences stating the reel's main point.
- 3-5 subject hashtags (without #).
Max 350 characters.`;

    case 'linkedin':
      return `${corePrompt}
Platform Target: LinkedIn Video
Tone: ${tone}
Structure:
- One professional observation grounded in the reel.
- 2-3 takeaways taken directly from what is spoken.
- One discussion question.
- 3-4 industry hashtags (without #).
Max 1,500 characters.`;

    case 'x':
      return `${corePrompt}
Platform Target: X (Twitter)
Tone: ${tone}
Structure:
- 1-2 tight sentences distilling the reel's main point.
- 2-3 concise hashtags (without #).
Strict limit: Under 270 characters total.`;

    case 'threads':
      return `${corePrompt}
Platform Target: Threads
Tone: ${tone}
Structure:
- A conversational observation or verbatim quote plus one question.
- 3-4 hashtags (without #).
Max 450 characters.`;

    case 'facebook':
      return `${corePrompt}
Platform Target: Facebook Video
Tone: ${tone}
Structure:
- A clear opening, 2-3 sentences from the reel's message, and one invitation to respond.
- 3-4 hashtags (without #).
Max 800 characters.`;

    default:
      return `${corePrompt}
Tone: ${tone}
Format: a plain opening, reel summary, one invitation, and 3-5 hashtags.`;
  }
}

// Generate Platform-Specific Copy and Hashtags Grounded in Reel Context
router.post(['/', '/generate'], async (req, res) => {
  try {
    const { videoId: sentVideoId, transcriptText, tone = 'Editorial / grounded', platform = 'instagram', forceRefresh = false, videoTitle, title, model } = req.body;
    // Text only: a body carrying {"videoId":{"$ne":null}} would otherwise reach the filters below.
    const videoId = asId(sentVideoId);
    const effectiveTitle = videoTitle || title || 'Creator Video Reel';
    const effectiveVideoId = videoId || `title_${Date.now()}`;

    // Determine the deep reel transcript
    let textToAnalyze = (transcriptText || '').trim();
    if (!textToAnalyze && videoId && !videoId.startsWith('temp_') && !videoId.startsWith('title_')) {
      const subs = await db.getSubtitles(videoId, req.userId);
      textToAnalyze = (subs?.transcript_text || (subs as any)?.transcript || '').trim();
    }

    let reelTitle = effectiveTitle;
    if (!reelTitle && videoId && !videoId.startsWith('temp_') && !videoId.startsWith('title_')) {
      const vid = await db.getVideo(videoId, req.userId);
      reelTitle = vid?.title || vid?.file_name || 'Creator Video Reel';
    }
    if (!textToAnalyze) {
      textToAnalyze = reelTitle;
    }

    // Hash transcript to implement zero-cost caching
    const requestedModel = preferredModelFrom(model) ?? DEFAULT_MODEL;
    const transcriptHash = crypto
      .createHash('md5')
      .update(textToAnalyze + tone + platform + (reelTitle || '') + requestedModel)
      .digest('hex');

    // Check cached caption
    if (!forceRefresh) {
      const existingCaption = await db.getCaption(videoId, platform as any, req.userId);
      if (existingCaption && existingCaption.transcript_hash === transcriptHash) {
        return res.json({
          success: true,
          data: existingCaption,
          cached: true,
          message: `Returned cached ${platform} caption grounded in reel context`,
        });
      }
    }

    const ai = getGeminiClient();
    let captionOutput = '';
    let hashtagsOutput: string[] = [];

    const fullPrompt = buildPlatformReelPrompt(platform, textToAnalyze, tone, reelTitle);

    if (ai) {
      try {
        const response = await generateGeminiContentWithRetry(ai, {
          preferredModel: requestedModel,
          contents: fullPrompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const parsed = JSON.parse(response.text || '{}');
        captionOutput = isUsableCaption(parsed.caption) ? parsed.caption.trim() : '';
        hashtagsOutput = Array.isArray(parsed.hashtags)
          ? parsed.hashtags.map((tag: string) => String(tag).replace(/^#/, ''))
          : [];
      } catch (err: any) {
        console.log(`Gemini ${platform} copy generation note: applying reel-grounded fallback`);
        const fb = getFallbackCopy(platform, textToAnalyze, tone, reelTitle);
        captionOutput = fb.caption;
        hashtagsOutput = fb.hashtags;
      }
    }

    if (!captionOutput) {
      const fb = getFallbackCopy(platform, textToAnalyze, tone, reelTitle);
      captionOutput = fb.caption;
      hashtagsOutput = fb.hashtags;
    }

    if (!hashtagsOutput || hashtagsOutput.length === 0) {
      hashtagsOutput = ['creatorgrowth', 'videotips', 'kontentos', 'reel'];
    }

    const saved = await db.saveCaption({
      video_id: effectiveVideoId,
      platform: platform as any,
      caption_text: captionOutput,
      hashtags: hashtagsOutput.slice(0, 8),
      approved: false,
      transcript_hash: transcriptHash,
      character_count: captionOutput.length,
    }, req.userId);

    // saveCaption answers null when the clip named here is not this creator's row. A caller that
    // asked to file copy against a video must be told it was not filed; the words are still shown,
    // but nothing pretends the vault holds them.
    if (!saved && videoId) {
      return res.status(409).json({
        error: 'That clip is not in your vault, so this copy could not be filed against it.',
      });
    }

    res.json({
      success: true,
      data: {
        ...saved,
        caption: captionOutput,
        caption_text: captionOutput,
        filed: !!saved,
      },
      cached: false,
      message: saved
        ? `Generated reel-contextual ${platform} copy and descriptions`
        : `Generated ${platform} copy — not filed, because no clip was named`,
    });
  } catch (err: any) {
    console.error('Error in /api/caption/generate:', err);
    res.status(500).json({ error: safeMessage(err, 'AI service failed') });
  }
});

// Generate copy for all supported platforms simultaneously in parallel
router.post('/generate-all', async (req, res) => {
  try {
    const { videoId: sentVideoId, transcriptText, tone = 'Editorial / grounded', forceRefresh = false, videoTitle, brandVoice = '', temperature, model } = req.body;
    const videoId = asId(sentVideoId);
    const modelTemperature = clampTemperature(temperature);
    const requestedModel = preferredModelFrom(model) ?? DEFAULT_MODEL;
    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId' });
    }

    let textToAnalyze = (transcriptText || '').trim();
    if (!textToAnalyze) {
      const subs = await db.getSubtitles(videoId, req.userId);
      textToAnalyze = (subs?.transcript_text || (subs as any)?.transcript || '').trim();
    }

    let reelTitle = videoTitle;
    if (!reelTitle) {
      const vid = await db.getVideo(videoId, req.userId);
      reelTitle = vid?.title || vid?.file_name || 'Creator Video Reel';
    }
    // An untranscribed reel still has a title to write from. Sending the model an empty transcript
    // makes it answer the prompt instead of the post.
    if (!textToAnalyze) {
      textToAnalyze = `Topic only — the creator has not transcribed this reel yet: ${reelTitle}`;
    }

    const platforms: string[] = ['instagram', 'youtube', 'tiktok', 'linkedin', 'x', 'threads', 'facebook'];
    const ai = getGeminiClient();
    const userId = req.userId;

    // Generate for all platforms concurrently with rich reel-grounded prompts
    const generationPromises = platforms.map(async (p) => {
      // The engine is part of the cache key so switching it in the Room produces new copy
      // instead of handing back what the previous engine wrote.
      const transcriptHash = crypto
        .createHash('md5')
        .update(textToAnalyze + tone + p + (reelTitle || '') + brandVoice + requestedModel)
        .digest('hex');

      if (!forceRefresh) {
        const existing = await db.getCaption(videoId, p as any, userId);
        if (
          existing &&
          existing.transcript_hash === transcriptHash &&
          !INVENTED_FALLBACK.test(String(existing.caption_text || ''))
        ) {
          return { platform: p, data: existing };
        }
      }

      let caption = '';
      let hashtags: string[] = [];

      if (ai) {
        const prompt =
          buildPlatformReelPrompt(p, textToAnalyze, tone, reelTitle) +
          (String(brandVoice).trim()
            ? `\n\n5. CREATOR VOICE — write as this specific creator, not as a generic strategist:\n${String(brandVoice).trim()}\n`
            : '');
        try {
          const resp = await generateGeminiContentWithRetry(ai, {
            preferredModel: requestedModel,
            contents: prompt,
            config: { responseMimeType: 'application/json', temperature: modelTemperature },
          });
          const parsed = JSON.parse(resp.text || '{}');
          caption = isUsableCaption(parsed.caption) ? parsed.caption.trim() : '';
          hashtags = Array.isArray(parsed.hashtags)
            ? parsed.hashtags.map((t: string) => String(t).replace(/^#/, ''))
            : [];
        } catch (e) {
          // Graceful fallback grounded in reel
        }
      }

      if (!caption) {
        const fb = getFallbackCopy(p, textToAnalyze, tone, reelTitle);
        caption = fb.caption;
        hashtags = fb.hashtags;
      }

      const saved = await db.saveCaption({
        video_id: videoId,
        platform: p as any,
        caption_text: caption,
        hashtags: hashtags.slice(0, 8),
        approved: false,
        transcript_hash: transcriptHash,
        character_count: caption.length,
      }, userId);

      return { platform: p, data: saved };
    });

    const settled = await Promise.allSettled(generationPromises);
    const results: Record<string, any> = {};

    settled.forEach((item, index) => {
      const p = platforms[index];
      if (item.status === 'fulfilled' && item.value) {
        results[p] = item.value.data;
      } else {
        const fb = getFallbackCopy(p, textToAnalyze, tone, reelTitle);
        results[p] = {
          video_id: videoId,
          platform: p,
          caption_text: fb.caption,
          hashtags: fb.hashtags,
          approved: false,
          character_count: fb.caption.length,
        };
      }
    });

    res.json({
      success: true,
      data: results,
      message: 'Generated multi-platform copy suite grounded in reel context',
    });
  } catch (err: any) {
    console.error('Error in /api/caption/generate-all:', err);
    res.status(500).json({ error: safeMessage(err, 'AI service failed') });
  }
});

// Update or approve caption (Feature #7: Caption Editor)
router.patch('/:id', async (req, res) => {
  try {
    const { captionText, hashtags, approved } = req.body;
    const updates: any = {};

    if (captionText !== undefined) {
      updates.caption_text = captionText;
      updates.character_count = captionText.length;
    }
    if (hashtags !== undefined) {
      updates.hashtags = hashtags;
    }
    if (approved !== undefined) {
      updates.approved = Boolean(approved);
    }

    const updated = await db.updateCaption(req.params.id, updates, req.userId);
    if (!updated) {
      return res.status(404).json({ error: 'Caption not found' });
    }

    res.json({
      success: true,
      data: updated,
      message: 'Caption updated successfully',
    });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Failed to update caption') });
  }
});

// Generate High-Converting AI Captions, Viral Hooks, and Hashtags Directly From Video/Reel Title
router.post('/generate-from-title', async (req, res) => {
  try {
    const {
      title,
      videoTitle,
      platform = 'instagram',
      tone = 'Editorial / grounded',
      mode = 'all',
      context = '',
      forceRefresh = false,
      temperature,
      model,
    } = req.body;

    const modelTemperature = clampTemperature(temperature);

    const effectiveTitle = (title || videoTitle || '').trim();
    if (!effectiveTitle) {
      return res.status(400).json({ error: 'Video title or topic is required to generate AI copy' });
    }

    const ai = getGeminiClient();
    let resultData: any = null;

    if (ai) {
      try {
        const prompt = buildTitleCopyPrompt(effectiveTitle, platform, tone, context);
        const response = await generateGeminiContentWithRetry(ai, {
          preferredModel: preferredModelFrom(model),
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: modelTemperature,
          },
        });

        if (response && response.text) {
          const parsed = JSON.parse(response.text.trim());
          const caption = isUsableCaption(parsed?.caption) ? parsed.caption.trim() : '';
          if (parsed && (caption || parsed.hooks || parsed.hashtags)) {
            resultData = {
              title: effectiveTitle,
              platform,
              tone,
              caption,
              caption_text: caption,
              hooks: Array.isArray(parsed.hooks) ? parsed.hooks : [],
              hashtags: Array.isArray(parsed.hashtags)
                ? parsed.hashtags.map((tag: string) => String(tag).replace(/^#/, '').trim())
                : [],
              callToAction: parsed.callToAction || '',
              suggestedTitle: parsed.suggestedTitle || '',
              ai_generated: Boolean(caption),
            };
          }
        }
      } catch (err: any) {
        console.warn('Gemini generate-from-title note: falling back to title algorithm:', err?.message);
      }
    }

    // Fallback if AI unavailable or offline
    if (!resultData) {
      const fb = getTitleFallbackCopy(effectiveTitle, platform, tone);
      resultData = {
        title: effectiveTitle,
        platform,
        tone,
        caption: fb.caption,
        caption_text: fb.caption,
        hooks: fb.hooks,
        hashtags: fb.hashtags,
        callToAction: fb.callToAction,
        suggestedTitle: fb.suggestedTitle,
        ai_generated: false,
      };
    }

    res.json({
      success: true,
      data: resultData,
      message: resultData.ai_generated
        ? '✨ AI copy generated successfully from title!'
        : 'Smart title-grounded copy generated',
    });
  } catch (err: any) {
    console.error('Error in /api/caption/generate-from-title:', err);
    res.status(500).json({ error: safeMessage(err, 'AI caption generation failed') });
  }
});

// General server-side Gemini prompt/text generation endpoint
router.post('/text-gen', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    const ai = getGeminiClient();
    if (ai) {
      try {
        const response = await generateGeminiContentWithRetry(ai, {
          preferredModel: 'gemini-3.5-flash-lite',
          contents: String(prompt),
        });
        if (response && response.text) {
          return res.json({ success: true, text: response.text });
        }
      } catch (err: any) {
        console.warn('Gemini text-gen error:', err?.message);
      }
    }

    // The prompt is the caller's own words. Answering with them puts the creator's question inside
    // the box the interface labels "generated", so the honest answer is that nothing answered.
    return res.status(502).json({ error: 'No copy engine answered. Try again in a moment.' });
  } catch (err: any) {
    res.status(500).json({ error: safeMessage(err, 'Text generation failed') });
  }
});

// Static Post Card copy generation endpoint
router.post('/static-card', async (req, res) => {
  try {
    const { prompt, format = 'instagram-overlay' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const ai = getGeminiClient();
    const systemPrompt = `You are an elite ghostwriter and content strategist for Instagram, LinkedIn, and X.
Given the topic "${prompt}", generate authoritative, high-converting copy for a visual social card (format: ${format}).
Return ONLY JSON with keys:
"headline": A bold, magnetic 1-2 sentence hook statement (max 18 words).
"supportingText": A sharp 2-3 sentence tactical takeaway or framework breakdown (max 35 words).
"socialCaption": Accompanying full caption with paragraph breaks and 3-4 hashtags.`;

    if (ai) {
      try {
        const response = await generateGeminiContentWithRetry(ai, {
          preferredModel: DEFAULT_MODEL,
          contents: systemPrompt,
          config: { responseMimeType: 'application/json', temperature: 0.75 },
        });
        if (response && response.text) {
          const parsed = readEngineJson(response.text);
          if (parsed && parsed.headline && (parsed.supportingText || parsed.description)) {
            return res.json({
              success: true,
              headline: parsed.headline,
              supportingText: parsed.supportingText || parsed.description,
              socialCaption: parsed.socialCaption || '',
            });
          }
        }
      } catch (err: any) {
        console.warn('Gemini static card error:', err?.message);
      }
    }

    const topicWords = String(prompt).replace(/^(e\.g\.|why|how to|a framework to)\s*/i, '').trim();
    return res.json({
      success: true,
      // The engine is not answering, so what follows is a sentence pattern with the topic dropped
      // into it. Saying so keeps it from being read as copy written about this creator's subject.
      fallback: true,
      source: 'local_generator',
      message: 'No engine answered — this is the house template, ready for you to rewrite.',
      headline: `The creators winning in 2026 build systems around ${topicWords.slice(0, 50)}.`,
      supportingText: `Here is the exact 3-step breakdown to scale ${topicWords.slice(0, 35)}:\n1. Eliminate low-leverage repetitive friction\n2. Codify your core insights into modular visual cards\n3. Syndicate seamlessly across all social channels.`,
      socialCaption: `Consistency without leverage leads to burnout.\n\nSave this framework for your next sprint.\n\n#ContentStrategy #${topicWords.split(' ')[0] || 'Creator'} #KontentOS`,
    });
  } catch (e: any) {
    res.status(500).json({ error: safeMessage(e, 'Failed to generate static card copy') });
  }
});

export default router;

