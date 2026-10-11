import express from 'express';
import { GoogleGenAI } from '@google/genai';

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

function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMsg)), ms)
    ),
  ]);
}

async function generateGeminiContentWithRetry(
  ai: GoogleGenAI,
  params: { contents: any; config?: any; preferredModel?: string }
): Promise<any> {
  const modelsToTry = [
    params.preferredModel || 'gemini-3.1-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash',
    'gemini-flash-latest',
  ];
  // Deduplicate candidate list preserving order
  const uniqueModels = Array.from(new Set(modelsToTry));

  let lastError: any = null;
  for (const model of uniqueModels) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        }),
        9000,
        `Timeout with model ${model}`
      );
      if (response && response.text) {
        return response;
      }
    } catch (err: any) {
      lastError = err;
      continue;
    }
  }
  throw lastError || new Error('All model candidates exhausted');
}

function getFallbackScript(topic: string, format: string, tone: string, niche: string) {
  const cleanTopic = (topic || '3 Creator Systems To Scale Content In 2026').trim();

  return {
    title: cleanTopic,
    format: format || '30s Direct-to-Camera',
    tone: tone || 'Casual Hinglish / Viral',
    script: {
      hook: {
        time: '0:00 - 0:03',
        visualCue: 'Sudden camera push-in, expressive face, neon-highlighted kinetic subtitle banner.',
        overlayText: 'STOP SCROLLING! 🚨 90% of Creators Miss This',
        spokenText: `Listen closely: if you are creating video content in 2026, you need to understand "${cleanTopic}".`
      },
      beats: [
        {
          time: '0:03 - 0:11',
          heading: 'Beat 1: The Frustrating Reality',
          visualCue: 'Rapid B-roll montage / timeline screen recording showing editing fatigue.',
          spokenText: 'Most creators spend 5 hours editing a 30-second reel. Manual subtitle styling and re-framing are killing your creative output.'
        },
        {
          time: '0:11 - 0:20',
          heading: 'Beat 2: The 1-Click Multiplier',
          visualCue: 'Point to floating UI graphic demonstrating automated video synthesis and burned-in captions.',
          spokenText: 'Instead, capture raw 1-take videos on your smartphone. Let AI handle kinetic captions, silence trimming, and aspect ratio conversion.'
        },
        {
          time: '0:20 - 0:26',
          heading: 'Beat 3: Omnichannel Distribution',
          visualCue: 'Animated social platform icons (Reels, TikTok, Shorts, LinkedIn) appearing in sequence.',
          spokenText: 'One single raw video can power your Instagram Reels, YouTube Shorts, LinkedIn carousel, and X thread simultaneously.'
        }
      ],
      cta: {
        time: '0:26 - 0:30',
        visualCue: 'Engaging forward lean with animated hand pointing downwards to comment section.',
        spokenText: `Drop a comment below with "SYSTEM" and I will send you the exact template we use to publish 5x faster!`,
        commentBait: 'Comment "SYSTEM" for the free video workflow breakdown! 👇'
      }
    },
    multiFormat: {
      instagram: {
        caption: `📌 Stop burning 5 hours on every reel in 2026!\n\nHere is how to tackle "${cleanTopic}" without burning out:\n\n1️⃣ Record raw 1-take thoughts when creative flow peaks\n2️⃣ Automate kinetic captions, pacing cuts & color pop\n3️⃣ Repurpose the core insight into carousels & threads\n\n👇 Save this reel for your next creation sprint! What is your biggest content bottleneck right now?`,
        hashtags: ['contentcreator', 'reelsgrowth', 'videomarketing', 'creatoreconomy', 'kontentos']
      },
      youtube: {
        title: `${cleanTopic.slice(0, 52)} 🚨 (Viral Creator Breakdown)`,
        description: `Stop overcomplicating your video production workflow. In this Short, we break down "${cleanTopic}" step-by-step.\n\n📌 In This Short:\n0:00 - The Core Trap\n0:10 - The 1-Click Workflow\n0:20 - Omnichannel Distribution\n\n💬 Subscribe for daily creator tools and drop your thoughts in the comments below!`,
        tags: ['Shorts', 'YouTubeShorts', 'CreatorTips', 'VideoMarketing', 'CreatorEconomy']
      },
      linkedin: {
        postText: `The creator economy in 2026 is won on distribution speed, not manual editing fatigue.\n\nHere is the operational breakdown on "${cleanTopic}":\n\n• High-leverage creators do not spend half their day manually placing captions.\n• They record unpolished high-signal thoughts, leverage automated workflows, and syndicate.\n• One idea becomes a video, a 5-slide carousel, and a tactical text breakdown.\n\nAre you prioritizing manual production or streamlined distribution this quarter?`,
        slideOutline: [
          `Slide 1: Master Class - ${cleanTopic}`,
          'Slide 2: The Bottleneck - Manual Editing Fatigue',
          'Slide 3: The Framework - Raw Input + Automated AI',
          'Slide 4: The Leverage - Multi-Platform Distribution',
          'Slide 5: Save & Share with your creator team'
        ]
      },
      twitterThread: [
        `1/ Everything you need to know about "${cleanTopic}" in 2026 (save this thread) 🧵👇`,
        '2/ Point 1: 90% of creators give up because post-production friction drains their creative battery.',
        '3/ Point 2: The solution isn’t working harder—it’s turning raw 1-minute smartphone recordings into polished assets with AI.',
        '4/ Point 3: Syndicate each idea everywhere: Reels for discovery, Shorts for subscriber momentum, and LinkedIn for high-ticket deals.',
        '5/ Want our full viral hook library? Retweet tweet #1 and check out @KontentOS for the complete creator toolkit! ⚡'
      ],
      threads: {
        text: `Unpopular truth about "${cleanTopic}" ☕\n\nYou do not need a 4K studio camera or 10 hours in Premiere. You need raw conviction and a frictionless publishing pipeline.\n\nHow much time do you spend editing per week? 👇`
      }
    }
  };
}

router.post('/generate', async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ error: 'GEMINI_API_KEY not configured' });
    }

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
          const parsed = JSON.parse(rawText);
          if (parsed.script && parsed.multiFormat) {
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
      message: 'Generated complete script and multi-format distribution suite',
    });
  } catch (err: any) {
    console.error('Error in /api/script/generate:', err);
    res.status(500).json({ error: err.message || 'AI service failed' });
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
    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ error: 'GEMINI_API_KEY not configured' });
    }

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
          const parsed = JSON.parse(rawText);
          const item = Array.isArray(parsed) ? parsed[0] : (parsed.card || parsed.data || parsed);
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
      source: 'local_generator',
      message: 'Generated headline and supporting text',
    });
  } catch (err: any) {
    console.error('Error in /api/script/graphic-copy:', err);
    res.status(500).json({ error: err.message || 'AI service failed' });
  }
});

export default router;
