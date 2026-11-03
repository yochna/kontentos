import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { DEFAULT_MODEL, ENGINE_MODELS, MODEL_ATTEMPT_TIMEOUT_MS, preferredModelFrom } from './caption.js';
import { engineTimeout, isEngineCeiling, readEngineJson } from '../engine.js';
import { safeMessage } from '../errorText.js';

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

async function generateGeminiContentWithRetry(
  ai: GoogleGenAI,
  params: { contents: any; config?: any; preferredModel?: string }
): Promise<any> {
  // One cascade for the whole server, so a script, a seed and a caption cannot disagree about
  // which engine is trustworthy.
  const uniqueModels = Array.from(
    new Set([preferredModelFrom(params.preferredModel) ?? DEFAULT_MODEL, ...ENGINE_MODELS])
  );

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
      if (isEngineCeiling(err?.message)) break;
      continue;
    }
  }
  throw lastError || new Error('All model candidates exhausted');
}

/**
 * The offline script. The timings and the shape are the reusable part; the words are not ours to
 * invent. An earlier version of this function wrote "90% of creators miss this", "5 hours editing"
 * and "publish 5x faster" out of a topic alone — invented numbers a creator would then read to camera
 * as if they had measured something. Every bracket here is a line only they can fill.
 */
export function getFallbackScript(topic: string, format: string, tone: string, niche: string) {
  const cleanTopic = (topic || 'This cut').trim();
  const blank = (hint: string) => `[${hint}]`;
  const note =
    'KontentOS scaffold — no engine answered, so this is structure, not copy. Fill every bracket from what you actually think or did, then delete this line.';

  return {
    title: cleanTopic,
    format: format || '30s Direct-to-Camera',
    tone: tone || 'Casual Hinglish / Viral',
    script: {
      hook: {
        time: '0:00 - 0:03',
        visualCue: blank('the first frame — where you are and what the camera is doing'),
        overlayText: blank('the on-screen line for the first four seconds'),
        spokenText: blank('what you say in the first four seconds about ' + cleanTopic),
      },
      beats: [
        {
          time: '0:03 - 0:11',
          heading: 'Beat 1 — the situation',
          visualCue: blank('what is on screen'),
          spokenText: blank('the problem as you have actually met it'),
        },
        {
          time: '0:11 - 0:20',
          heading: 'Beat 2 — the turn',
          visualCue: blank('what is on screen'),
          spokenText: blank('the one thing you do differently, and why'),
        },
        {
          time: '0:20 - 0:26',
          heading: 'Beat 3 — the proof',
          visualCue: blank('what is on screen'),
          spokenText: blank('the number, the clip or the outcome that backs it up'),
        },
      ],
      cta: {
        time: '0:26 - 0:30',
        visualCue: blank('the last frame'),
        spokenText: blank('what the viewer does next'),
        commentBait: blank('a question you would really answer in the comments'),
      },
    },
    multiFormat: {
      instagram: {
        caption: `${cleanTopic}\n\n${blank('the hook')}\n\n${blank('what you actually said')}\n\n${blank(
          'what the viewer should do next'
        )}\n\n${note}`,
        hashtags: [],
      },
      youtube: {
        title: cleanTopic.slice(0, 100),
        description: `${cleanTopic}\n\n${blank('what the short covers, in one sentence')}\n\n${note}`,
        tags: [],
      },
      linkedin: {
        postText: `${cleanTopic}\n\n${blank('the claim you are making')}\n\n${blank(
          'what happened, in your own words'
        )}\n\n${blank('what you would do differently now')}\n\n${note}`,
        slideOutline: [
          `Slide 1 — the claim: ${cleanTopic}`,
          'Slide 2 — what happened',
          'Slide 3 — the number or scene that proves it',
          'Slide 4 — what you changed after it',
          'Slide 5 — the one thing the reader should do',
        ],
      },
      twitterThread: [
        // Truncated on purpose: a first tweet over 280 characters is refused by X.
        `${cleanTopic.slice(0, 90)}\n\n${blank('the hook, in your own words')}`.slice(0, 280),
        `2/ ${blank('the proof — one number or one scene')}`,
        `3/ ${blank('the turn — what to do next')}`,
      ],
      threads: {
        text: `${cleanTopic}\n\n${blank('what you think about it')}\n\n${note}`,
      },
    },
  };
}

router.post('/generate', async (req, res) => {
  try {
    const {
      topic,
      format = '30s Direct-to-Camera',
      tone = 'Casual Hinglish / Viral',
      niche = 'Tech & Productivity',
      language = 'English / Hinglish',
      persona = ''
    } = req.body;

    if (!topic || !String(topic).trim()) {
      return res.status(400).json({ error: 'Missing topic prompt' });
    }

    const cleanTopic = String(topic).trim();
    const ai = getGeminiClient();

    const systemPrompt = `You are an elite short-form video creator, scriptwriter, and multi-platform distribution strategist.
Create a viral, high-retention short-form video script AND a complete multi-platform social media repurposing suite for the following topic:

TOPIC: "${cleanTopic}"
FORMAT: "${format}"
TONE / VOICE: "${tone}"
NICHE: "${niche}"
LANGUAGE: "${language}"
${persona ? `CREATOR PERSONA / CATCHPHRASES: "${persona}"` : ''}

CRITICAL RULES:
1. Script Hook (0-3s): Must stop scroll instantly. Include specific visual cue, on-screen text banner, and spoken text.
2. Script Beats: 3 timed beats (0:03-0:11, 0:11-0:20, 0:20-0:26) with visual cues and conversational spoken lines.
3. Script CTA (0:26-0:30): Compelling call-to-action with high-converting comment bait word.
4. Repurposing:
   - Instagram: engaging caption with hooks, line breaks, and 5 hashtags.
   - YouTube Shorts: clickable title under 60 chars, description with timestamps, 5 tags.
   - LinkedIn: thought-leadership post + 5-slide carousel outline.
   - Twitter/X: 5-tweet thread (1/5 to 5/5).
   - Threads/TikTok: punchy fast-paced text.

Return STRICTLY JSON conforming to this schema without markdown fences:
{
  "title": "${cleanTopic}",
  "format": "${format}",
  "tone": "${tone}",
  "script": {
    "hook": {
      "time": "0:00 - 0:03",
      "visualCue": "...",
      "overlayText": "...",
      "spokenText": "..."
    },
    "beats": [
      { "time": "0:03 - 0:11", "heading": "...", "visualCue": "...", "spokenText": "..." },
      { "time": "0:11 - 0:20", "heading": "...", "visualCue": "...", "spokenText": "..." },
      { "time": "0:20 - 0:26", "heading": "...", "visualCue": "...", "spokenText": "..." }
    ],
    "cta": {
      "time": "0:26 - 0:30",
      "visualCue": "...",
      "spokenText": "...",
      "commentBait": "..."
    }
  },
  "multiFormat": {
    "instagram": { "caption": "...", "hashtags": ["...", "...", "...", "...", "..."] },
    "youtube": { "title": "...", "description": "...", "tags": ["...", "...", "...", "...", "..."] },
    "linkedin": { "postText": "...", "slideOutline": ["Slide 1...", "Slide 2...", "Slide 3...", "Slide 4...", "Slide 5..."] },
    "twitterThread": ["1/ ...", "2/ ...", "3/ ...", "4/ ...", "5/ ..."],
    "threads": { "text": "..." }
  }
}`;

    if (ai) {
      try {
        const response = await generateGeminiContentWithRetry(ai, {
          preferredModel: 'gemini-3.1-flash-lite',
          contents: systemPrompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const rawText = response.text?.trim();
        if (rawText) {
          const parsed = readEngineJson<any>(rawText);
          if (parsed?.script && parsed?.multiFormat) {
            return res.json({
              success: true,
              data: parsed,
              fallback: false,
              source: 'gemini',
              message: 'Successfully generated AI script and multi-format distribution suite via Gemini',
            });
          }
        }
      } catch (geminiErr: any) {
        console.log('Gemini script generation notice: using resilient fallback generator');
      }
    }

    const fallbackData = getFallbackScript(cleanTopic, format, tone, niche);
    return res.json({
      success: true,
      data: fallbackData,
      fallback: true,
      source: 'local_generator',
      message: 'No engine answered — here is the structure, with every line still yours to write.',
    });
  } catch (err: any) {
    console.error('Error in /api/script/generate:', err);
    res.status(500).json({ error: safeMessage(err, 'AI service failed') });
  }
});

// Fallback generator for graphic copy
function getFallbackGraphicCopy(prompt: string, template: string): { headline: string; supportingText: string } {
  const p = prompt.trim();
  const cleanPrompt = p.charAt(0).toUpperCase() + p.slice(1);
  const lower = p.toLowerCase();

  if (lower.includes('mistake') || lower.includes('avoid') || lower.includes('fail')) {
    return {
      headline: `The Single Costliest Mistake Creators Make When Tackling ${cleanPrompt}`,
      supportingText: `Most people focus on vanity metrics and complex production instead of clarity. Simplify your message, address one urgent pain point, and double down on consistency.`,
    };
  }

  if (lower.includes('framework') || lower.includes('step') || lower.includes('how to') || lower.includes('system')) {
    return {
      headline: `A Battle-Tested 3-Step Framework for ${cleanPrompt}`,
      supportingText: `Step 1: Capture raw high-signal thoughts immediately. Step 2: Extract the core hook and single takeaway. Step 3: Syndicate across visual and video channels in minutes.`,
    };
  }

  if (lower.includes('audience') || lower.includes('grow') || lower.includes('follower') || lower.includes('scale')) {
    return {
      headline: `How High-Leverage Creators Build Loyal Audiences Around ${cleanPrompt}`,
      supportingText: `Audience growth is never about shouting louder into the void. It is about consistently providing clear, actionable answers to questions your target viewers are actively asking today.`,
    };
  }

  if (lower.includes('mindset') || lower.includes('burnout') || lower.includes('habit') || lower.includes('time')) {
    return {
      headline: `Stop Burning Out: Rethink How You Approach ${cleanPrompt}`,
      supportingText: `Sustainable output always beats sporadic bursts of overwork. Build automated publishing systems that support your creative energy rather than draining your calendar.`,
    };
  }

  // Default universal high-impact format
  return {
    headline: `Why Traditional Approaches to ${cleanPrompt} Are Already Obsolete`,
    supportingText: `The modern creator landscape rewards speed of insight, distinct perspective, and frictionless execution. Focus on direct value and let automated workflows handle the rest.`,
  };
}

// POST /api/script/graphic-copy - Generate headline and supporting text for visual posts & carousels
router.post('/graphic-copy', async (req, res) => {
  try {
    const { prompt, template = 'instagram' } = req.body;
    const userPrompt = (prompt || '').trim();
    if (!userPrompt) {
      return res.status(400).json({ error: 'Please describe the kind of post you want to create.' });
    }

    const ai = getGeminiClient();
    if (ai) {
      try {
        const systemPrompt = `You are an expert editorial director and master copywriter for high-impact social media visual cards, carousels, and infographic quotes.

User's requested post style & topic:
"${userPrompt}"

Target format / visual template: ${template}

TASK:
Create TWO distinct, expertly phrased text responses for this visual card:
1. "headline":
   - This MUST look and sound like a proper, captivating, authoritative HEADING or hook statement.
   - It should be punchy, clear, bold, and high-impact (typically 6 to 14 words).
   - It must command attention on an Instagram card, LinkedIn slide, or X graphic.
   - Avoid generic platitudes. Frame it with strong conviction, contrasting ideas, or a compelling premise.

2. "supportingText":
   - This MUST look and sound like proper SUPPORTING TEXT or tactical takeaway.
   - It should directly support, clarify, unpack, or provide actionable evidence backing up the headline (typically 18 to 35 words).
   - It must deliver high-signal value, practical clarity, or a memorable perspective.

Return ONLY a single JSON object (not an array) matching this schema:
{
  "headline": "...",
  "supportingText": "..."
}`;

        const response = await generateGeminiContentWithRetry(ai, {
          preferredModel: 'gemini-3.1-flash-lite',
          contents: systemPrompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const rawText = response.text?.trim();
        if (rawText) {
          const parsed = readEngineJson<any>(rawText);
          const item = Array.isArray(parsed) ? parsed[0] : (parsed?.card || parsed?.data || parsed);
          if (item && (item.headline || item.title) && (item.supportingText || item.body || item.text)) {
            return res.json({
              success: true,
              data: {
                headline: String(item.headline || item.title).trim(),
                supportingText: String(item.supportingText || item.body || item.text).trim(),
              },
              source: 'gemini',
              message: 'Generated headline and supporting text via Gemini AI',
            });
          }
        }
      } catch (geminiErr: any) {
        console.log('Gemini graphic-copy notice: using fallback generator');
      }
    }

    const fallback = getFallbackGraphicCopy(userPrompt, template);
    return res.json({
      success: true,
      data: fallback,
      fallback: true,
      source: 'local_generator',
      // The engine is silent and these are sentence patterns with the prompt dropped in. Saying
      // 'generated' here would let a creator publish a template believing a model wrote it.
      message: 'No engine answered — this is the house template, with every line yours to rewrite.',
    });
  } catch (err: any) {
    console.error('Error in /api/script/graphic-copy:', err);
    res.status(500).json({ error: safeMessage(err, 'AI service failed') });
  }
});

export default router;
