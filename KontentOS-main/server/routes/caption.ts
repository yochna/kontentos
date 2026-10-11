import express from 'express';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import * as db from '../db.js';

const router = express.Router();

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Timeout wrapper helper to prevent hanging requests
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMsg)), ms)
    ),
  ]);
}

// Fast & Resilient Gemini caller with strict timeout & model candidates
async function generateGeminiContentWithRetry(
  ai: GoogleGenAI,
  params: { contents: any; config?: any; preferredModel?: string }
): Promise<any> {
  const modelsToTry = [
    params.preferredModel || 'gemini-3.8-flash',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
  ];
  const uniqueModels = Array.from(new Set(modelsToTry));

  let lastError: any = null;
  for (const model of uniqueModels) {
    try {
      // Allow up to 10 seconds per model attempt
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        }),
        10000,
        `Timeout with model ${model}`
      );
      if (response && response.text) {
        return response;
      }
    } catch (err: any) {
      lastError = err;
      // Immediately try next model candidate on timeout or error
      continue;
    }
  }
  throw lastError || new Error('All model candidates exhausted');
}

// Title-grounded AI prompt builder for full copy, hooks, and hashtags
function buildTitleCopyPrompt(
  title: string,
  platform: string,
  tone: string,
  context: string = ''
): string {
  const cleanTitle = (title || 'High-Impact Creator Reel').trim();
  return `You are KontentOS AI Copywriting Engine, a world-class social media strategist specializing in viral short-form video reels, shorts, and TikToks.

Your goal is to generate high-converting, platform-tailored copy specifically based on this video/reel title:
Title / Topic: "${cleanTitle}"
Platform: ${platform.toUpperCase()}
Tone / Persona: ${tone}
${context ? `Additional Context / Notes: "${context}"` : ''}

CRITICAL RULES:
1. Ground the copy directly on the premise, value proposition, and subject matter of the title "${cleanTitle}".
2. Craft an irresistibly engaging, platform-native description/caption tailored specifically to ${platform}:
   - For Instagram Reels: Bold hook line, 3 actionable bullet points / lessons from the topic, high-converting CTA asking for saves or comment keyword, and 5-7 focused niche hashtags.
   - For TikTok: Punchy 1-2 sentence curiosity gaps, high-velocity phrasing, 4-6 trend/topic hashtags.
   - For YouTube Shorts: High-CTR video description, concise retention summary, pinned comment prompt, 4-5 tags.
   - For LinkedIn: Professional opening hook, structured takeaways, business/productivity impact, closing industry discussion question, 3-5 tags.
   - For X: Crisp, high-signal single or double takeaway under 240 chars + 2-3 tags.
   - For Threads / Facebook: Conversational storytelling, relatable creator check-in, discussion starter.
3. Provide 4 unique, scroll-stopping viral hook variations for the first 3 seconds of the reel (Problem/Agitation, Curiosity Gap, Contrarian/Bold Claim, Direct Question/Challenge).
4. Provide 6-8 relevant, highly searchable hashtags (without '#' symbol).
5. Provide a high-converting 1-line Call To Action (e.g., "Drop 'GUIDE' below and I'll DM you the breakdown 👇").
6. Provide an alternative high-CTR viral title variation.

Respond ONLY in valid JSON matching this schema:
{
  "caption": "Your complete formatted post caption with emojis and line breaks...",
  "hooks": [
    "Hook 1: Problem / Agitation hook...",
    "Hook 2: Curiosity gap hook...",
    "Hook 3: Contrarian / Bold claim hook...",
    "Hook 4: Direct question / High engagement hook..."
  ],
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"],
  "callToAction": "Drop 'GUIDE' in the comments for the full breakdown 👇",
  "suggestedTitle": "Alternative viral title..."
}`;
}

// Intelligent fallback copy generator based directly on video title
function getTitleFallbackCopy(title: string, platform: string, tone: string) {
  const cleanTitle = (title || 'Creator Video Reel').trim();
  const lower = cleanTitle.toLowerCase();
  
  // Extract key topic words
  const words = lower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
  const stopWords = new Set(['this', 'that', 'with', 'from', 'your', 'have', 'what', 'here', 'just', 'more', 'then', 'they', 'will', 'about', 'video', 'reel', 'post']);
  const tags = words.filter(w => !stopWords.has(w)).slice(0, 5);
  if (tags.length === 0) tags.push('creatoreconomy', 'videotips', 'growthhacks', 'kontentos');

  const hooks = [
    `Stop scrolling if you want to master ${cleanTitle} 🚨`,
    `The #1 mistake creators make with ${cleanTitle} (and how to fix it) 👀`,
    `If you only implement ONE strategy from ${cleanTitle} this week, do this 👇`,
    `Why nobody is talking about the real secret behind ${cleanTitle} 💡`
  ];

  let caption = '';
  switch (platform) {
    case 'tiktok':
      caption = `👀 The secret behind "${cleanTitle}" you need to know before everyone else does.\n\nSave this for your next creation workflow! 🚀`;
      break;
    case 'youtube':
      caption = `🔥 ${cleanTitle}\n\nIn this short breakdown, we explore:\n• Why most approaches fail\n• The 3-step execution framework\n• Instant action items for creators\n\n💬 What's your biggest challenge with this? Drop your thoughts in the comments!`;
      break;
    case 'linkedin':
      caption = `💡 Strategic takeaway on "${cleanTitle}":\n\nHigh leverage in 2026 isn't about working more hours—it's about building repeatable systems.\n\nHere are the 3 core pillars:\n• 1. Focus on core signal over endless noise\n• 2. Automate production friction with AI tools\n• 3. Syndicate key insights across all touchpoints\n\nHow is your team approaching this right now?`;
      break;
    case 'x':
      caption = `Key insight from "${cleanTitle}":\n\nAutomate the repetitive friction so you can focus 100% on high-impact storytelling. ⚡`;
      break;
    case 'threads':
    case 'facebook':
      caption = `Honest creator check-in ☕\n\n"${cleanTitle}"\n\nDo you agree with this approach? Drop your thoughts below 👇`;
      break;
    case 'instagram':
    default:
      caption = `🔥 "${cleanTitle}"\n\nHere is the exact breakdown you need to implement today:\n\n1️⃣ Phase 1: Identify high-retention concepts before hitting record.\n2️⃣ Phase 2: Use kinetic visual pacing and clear audio cues.\n3️⃣ Phase 3: Syndicate seamlessly across every short-form platform.\n\n👇 Save this reel for your next production session! Which step are you focusing on first?`;
      break;
  }

  return {
    caption,
    hooks,
    hashtags: tags,
    callToAction: "Comment 'REEL' below and I'll send you the complete step-by-step blueprint! 👇",
    suggestedTitle: `How to 10x Your Results with ${cleanTitle}`
  };
}

// Dynamic reel-grounded fallback generator that extracts actual spoken points from the reel
function getFallbackCopy(platform: string, transcript: string, tone: string, videoTitle?: string) {
  const clean = (transcript || '').replace(/\s+/g, ' ').trim();
  // Extract real spoken sentences or meaningful clauses
  const rawSentences = clean.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 5);
  
  const hookQuote = rawSentences[0] || (videoTitle ? `Key insight from ${videoTitle}` : 'Stop overcomplicating video creation in 2026.');
  const takeaway1 = rawSentences[1] || 'Batch raw ideas when your creative energy is highest.';
  const takeaway2 = rawSentences[2] || 'Let AI automate kinetic subtitles and pacing adjustments.';
  const takeaway3 = rawSentences[3] || 'Syndicate your edited reel across all channels simultaneously.';

  // Derive relevant contextual topic tags from actual spoken content
  const words = clean.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
  const stopWords = new Set(['this', 'that', 'with', 'from', 'your', 'have', 'what', 'here', 'just', 'more', 'then', 'they', 'will', 'about']);
  const filteredWords = words.filter(w => !stopWords.has(w));
  const uniqueTags = Array.from(new Set(filteredWords)).slice(0, 4);
  if (uniqueTags.length === 0) uniqueTags.push('creatoreconomy', 'videotips');

  switch (platform) {
    case 'youtube':
      return {
        caption: `🔥 ${hookQuote.slice(0, 60)}\n\nIn this video, we break down:\n"${clean.slice(0, 220)}..."\n\n📌 Key Takeaways from this Reel:\n• ${takeaway1}\n• ${takeaway2}\n\n💬 What is your biggest hurdle with this? Drop your thoughts in the comments!`,
        hashtags: ['Shorts', 'YouTubeShorts', ...uniqueTags],
      };
    case 'tiktok':
      return {
        caption: `👀 "${hookQuote}"\n\n${takeaway1} Save this for your next video workflow! 🚀`,
        hashtags: ['tiktoktips', 'learnontiktok', 'filmtok', ...uniqueTags],
      };
    case 'linkedin':
      return {
        caption: `💡 Breakdown from this video:\n\n"${hookQuote}"\n\nHere are the core insights covered in this reel:\n• 1: ${takeaway1}\n• 2: ${takeaway2}\n• 3: ${takeaway3}\n\nHow is your team approaching this in your current production workflow?`,
        hashtags: ['ContentStrategy', 'VideoMarketing', 'Productivity', ...uniqueTags],
      };
    case 'x':
      return {
        caption: `Core takeaway from this reel:\n\n"${hookQuote.slice(0, 110)}"\n\n${takeaway1.slice(0, 90)} ⚡`,
        hashtags: ['CreatorEconomy', 'VideoTips', ...uniqueTags.slice(0, 2)],
      };
    case 'threads':
      return {
        caption: `Honest creator check-in ☕\n\n"${hookQuote}"\n\nDo you agree with this breakdown from the video? Drop your thoughts below 👇`,
        hashtags: ['threads', 'creators', 'productivity', ...uniqueTags.slice(0, 2)],
      };
    case 'facebook':
      return {
        caption: `🚀 Key takeaway from today's video:\n\n"${hookQuote}"\n\n${takeaway1}\n\n${takeaway2}\n\n🙌 Share this with someone who needs this insight!`,
        hashtags: ['contentcreators', 'videomarketing', ...uniqueTags],
      };
    case 'instagram':
    default:
      return {
        caption: `📌 "${hookQuote}"\n\nHere is the breakdown directly from this reel:\n\n1️⃣ ${takeaway1}\n2️⃣ ${takeaway2}\n3️⃣ ${takeaway3}\n\n👇 Save this reel for your next creation session! Which point resonates most with your process?`,
        hashtags: ['contentcreator', 'reelsgrowth', 'videoproduction', ...uniqueTags],
      };
  }
}

// Build strictly reel-grounded AI prompts for each platform
function buildPlatformReelPrompt(platform: string, reelTranscript: string, tone: string, videoTitle?: string): string {
  const cleanTranscript = (reelTranscript || '').trim();
  const titleHeader = videoTitle ? `Reel Title / Topic: "${videoTitle}"\n` : '';

  const corePrompt = `
You are an expert social media copywriter. You are writing high-converting social captions and video descriptions for a video reel.

CRITICAL INSTRUCTIONS:
1. STRICT REEL CONTEXT GROUNDING: Base the entire caption, hooks, takeaways, descriptions, and hashtags SOLELY and EXCLUSIVELY on the video reel's actual spoken dialogue, core message, arguments, and subject matter below:
${titleHeader}Reel Transcript / Spoken Content:
"""
${cleanTranscript}
"""

2. ABSOLUTELY NO GENERIC HASHTAG-DERIVED FLUFF: Do NOT write generic copy derived from broad hashtags or generic creator platitudes. Every single sentence, bullet point, hook, and takeaway MUST directly reflect the real ideas, advice, story, or facts spoken in this specific reel.

3. DESCRIPTIONS: Summarize specifically what the creator explains and demonstrates in this video based on the transcript.

4. HASHTAGS: Derive 3-5 specific hashtags that directly describe the specific topic discussed in the reel.

Respond strictly in valid JSON format:
{
  "caption": "Your formatted caption/description here...",
  "hashtags": ["topic_tag1", "topic_tag2", "topic_tag3", "topic_tag4", "topic_tag5"]
}
`;

  switch (platform) {
    case 'instagram':
      return `${corePrompt}
Platform Target: Instagram Reels
Tone: ${tone}
Structure:
- Scroll-stopping Hook Line quoting or paraphrasing the core insight from the reel.
- Value Body: 2-3 structured takeaway bullet points summarizing the creator's exact points.
- Call To Action inviting comments or saves about this reel's topic.
- Exactly 5 topic-specific hashtags (without #).
Max 2,000 characters.`;

    case 'youtube':
      return `${corePrompt}
Platform Target: YouTube Shorts
Tone: ${tone}
Structure:
- High-CTR Video Title (Under 65 characters) reflecting the reel's spoken message or question.
- Description Body: 2-3 concise paragraphs summarizing the lessons in this video, plus an engagement question for the comments.
- 3-5 relevant YouTube keyword tags (without #).
Max 1,000 characters.`;

    case 'tiktok':
      return `${corePrompt}
Platform Target: TikTok
Tone: ${tone} (high energy, fast curiosity)
Structure:
- 1-2 punchy hook sentences summarizing the reel's primary revelation or take.
- 4-5 relevant TikTok hashtags (without #).
Max 350 characters.`;

    case 'linkedin':
      return `${corePrompt}
Platform Target: LinkedIn Video
Tone: ${tone} (insightful, professional, high-signal)
Structure:
- 1-line strong opening hook addressing the reel's core theme.
- 3-4 bulleted actionable takeaways extracted directly from what is spoken in the reel.
- 1 thoughtful closing question encouraging industry discussion.
- 3-4 industry hashtags (without #).
Max 1,500 characters.`;

    case 'x':
      return `${corePrompt}
Platform Target: X (Twitter)
Tone: ${tone} (punchy, crisp, high density)
Structure:
- 1-2 tight sentences distilling the reel's highest-signal takeaway.
- 2-3 concise hashtags (without #).
Strict limit: Under 270 characters total.`;

    case 'threads':
      return `${corePrompt}
Platform Target: Threads
Tone: ${tone} (authentic, casual, community dialogue)
Structure:
- Conversational observation or quote from the reel + direct question to the audience about the topic.
- 3-4 hashtags (without #).
Max 450 characters.`;

    case 'facebook':
      return `${corePrompt}
Platform Target: Facebook Video
Tone: ${tone} (friendly, shareable, clear)
Structure:
- Engaging opening + 2-3 breakdown sentences about the video's message + invitation to share.
- 3-4 hashtags (without #).
Max 800 characters.`;

    default:
      return `${corePrompt}
Tone: ${tone}
Format: Hook, reel summary, call to action, and 4-5 hashtags.`;
  }
}

// Generate Platform-Specific Copy and Hashtags Grounded in Reel Context
router.post(['/', '/generate'], async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ error: 'GEMINI_API_KEY not configured' });
    }

    const { videoId, transcriptText, tone = 'Viral & Punchy', platform = 'instagram', forceRefresh = false, videoTitle, title } = req.body;
    const effectiveTitle = videoTitle || title || 'Creator Video Reel';
    const effectiveVideoId = videoId || `title_${Date.now()}`;

    // Determine the deep reel transcript
    let textToAnalyze = (transcriptText || '').trim();
    if (!textToAnalyze && videoId && !videoId.startsWith('temp_') && !videoId.startsWith('title_')) {
      const subs = await db.getSubtitles(videoId);
      textToAnalyze = (subs?.transcript_text || (subs as any)?.transcript || '').trim();
    }

    let reelTitle = effectiveTitle;
    if (!reelTitle && videoId && !videoId.startsWith('temp_') && !videoId.startsWith('title_')) {
      const vid = await db.getVideo(videoId);
      reelTitle = vid?.title || vid?.file_name || 'Creator Video Reel';
    }
    if (!textToAnalyze) {
      textToAnalyze = reelTitle;
    }

    // Hash transcript to implement zero-cost caching
    const transcriptHash = crypto.createHash('md5').update(textToAnalyze + tone + platform + (reelTitle || '')).digest('hex');

    // Check cached caption
    if (!forceRefresh) {
      const existingCaption = await db.getCaption(videoId, platform as any);
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
          preferredModel: 'gemini-3.1-flash-lite',
          contents: fullPrompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const parsed = JSON.parse(response.text || '{}');
        captionOutput = parsed.caption || '';
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
    });

    res.json({
      success: true,
      data: {
        ...saved,
        caption: captionOutput,
        caption_text: captionOutput,
      },
      cached: false,
      message: `Generated reel-contextual ${platform} copy and descriptions`,
    });
  } catch (err: any) {
    console.error('Error in /api/caption/generate:', err);
    res.status(500).json({ error: err.message || 'AI service failed' });
  }
});

// Generate copy for all supported platforms simultaneously in parallel
router.post('/generate-all', async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ error: 'GEMINI_API_KEY not configured' });
    }

    const { videoId, transcriptText, tone = 'Viral & Punchy', forceRefresh = false, videoTitle } = req.body;
    if (!videoId) {
      return res.status(400).json({ error: 'Missing videoId' });
    }

    let textToAnalyze = (transcriptText || '').trim();
    if (!textToAnalyze) {
      const subs = await db.getSubtitles(videoId);
      textToAnalyze = (subs?.transcript_text || (subs as any)?.transcript || '').trim();
    }

    let reelTitle = videoTitle;
    if (!reelTitle) {
      const vid = await db.getVideo(videoId);
      reelTitle = vid?.title || vid?.file_name || 'Creator Video Reel';
      if (!textToAnalyze) {
        textToAnalyze = vid?.title || 'Key insights from video reel';
      }
    }

    const platforms: string[] = ['instagram', 'youtube', 'tiktok', 'linkedin', 'x', 'threads', 'facebook'];
    const ai = getGeminiClient();

    // Generate for all platforms concurrently with rich reel-grounded prompts
    const generationPromises = platforms.map(async (p) => {
      const transcriptHash = crypto.createHash('md5').update(textToAnalyze + tone + p + (reelTitle || '')).digest('hex');

      if (!forceRefresh) {
        const existing = await db.getCaption(videoId, p as any);
        if (existing && existing.transcript_hash === transcriptHash) {
          return { platform: p, data: existing };
        }
      }

      let caption = '';
      let hashtags: string[] = [];

      if (ai) {
        const prompt = buildPlatformReelPrompt(p, textToAnalyze, tone, reelTitle);
        try {
          const resp = await generateGeminiContentWithRetry(ai, {
            preferredModel: 'gemini-3.1-flash-lite',
            contents: prompt,
            config: { responseMimeType: 'application/json' },
          });
          const parsed = JSON.parse(resp.text || '{}');
          caption = parsed.caption || '';
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
      });

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
    res.status(500).json({ error: err.message || 'AI service failed' });
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

    const updated = await db.updateCaption(req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ error: 'Caption not found' });
    }

    res.json({
      success: true,
      data: updated,
      message: 'Caption updated successfully',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update caption' });
  }
});

// Generate High-Converting AI Captions, Viral Hooks, and Hashtags Directly From Video/Reel Title
router.post('/generate-from-title', async (req, res) => {
  try {
    const {
      title,
      videoTitle,
      platform = 'instagram',
      tone = 'Viral & Punchy',
      mode = 'all',
      context = '',
      forceRefresh = false,
    } = req.body;

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
          preferredModel: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        if (response && response.text) {
          const parsed = JSON.parse(response.text.trim());
          if (parsed && (parsed.caption || parsed.hooks || parsed.hashtags)) {
            resultData = {
              title: effectiveTitle,
              platform,
              tone,
              caption: parsed.caption || '',
              caption_text: parsed.caption || '',
              hooks: Array.isArray(parsed.hooks) ? parsed.hooks : [],
              hashtags: Array.isArray(parsed.hashtags)
                ? parsed.hashtags.map((tag: string) => String(tag).replace(/^#/, '').trim())
                : [],
              callToAction: parsed.callToAction || '',
              suggestedTitle: parsed.suggestedTitle || '',
              ai_generated: true,
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
    res.status(500).json({ error: err.message || 'AI caption generation failed' });
  }
});

// General server-side Gemini prompt/text generation endpoint
router.post('/text-gen', async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ error: 'GEMINI_API_KEY not configured' });
    }

    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    const ai = getGeminiClient();
    if (ai) {
      try {
        const response = await generateGeminiContentWithRetry(ai, {
          preferredModel: 'gemini-3.1-flash-lite',
          contents: String(prompt),
        });
        if (response && response.text) {
          return res.json({ success: true, text: response.text });
        }
      } catch (err: any) {
        console.log('Gemini text-gen note: using fallback content');
      }
    }

    // Fallback if AI unavailable or offline
    res.json({
      success: true,
      text: `"Bhai suno! Stop overcomplicating video creation. Here are 3 instant tricks to scale your content."`,
      fallback: true
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI service failed' });
  }
});

export default router;

