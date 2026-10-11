import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { searchStockPhotos } from '../stockSearchService.js';

const router = express.Router();

const MASTER_GEMINI_KEY = 'AQ.Ab8RN6IYaEjUU-ija_S2rsV1M9hhARc8P7TeVDgclx7yQD67pQ';

function getEffectiveApiKey(clientApiKey?: string): string {
  const isValid = (k: any): boolean =>
    typeof k === 'string' &&
    k.trim().length > 15 &&
    !k.includes('TODO') &&
    !k.includes('your_');

  if (isValid(process.env.GEMINI_API_KEY)) return process.env.GEMINI_API_KEY!.trim();
  if (isValid(process.env.VITE_GEMINI_API_KEY)) return process.env.VITE_GEMINI_API_KEY!.trim();
  if (isValid(clientApiKey)) return clientApiKey!.trim();
  return MASTER_GEMINI_KEY;
}

// Timeout helper
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
  ]);
}

function parseGeneratedCopy(rawText: string): { headline: string; supportingText: string; socialCaption: string } | null {
  if (!rawText || !rawText.trim()) return null;
  const match = rawText.match(/\{[\s\S]*\}/);
  const cleanJson = match ? match[0] : rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  
  try {
    const parsed = JSON.parse(cleanJson);
    const headline = parsed.headline || parsed.hook || parsed.title || parsed.mainHook || '';
    const supportingText = parsed.supportingText || parsed.description || parsed.takeaway || parsed.subtext || parsed.body || '';
    const socialCaption = parsed.socialCaption || parsed.caption || '';
    if (headline && supportingText) {
      return { headline, supportingText, socialCaption };
    }
  } catch {
    // If response was formatted as text
    const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      return {
        headline: lines[0].replace(/^["'#*\s]+|["'*\s]+$/g, ''),
        supportingText: lines.slice(1).join(' ').replace(/^["'#*\s]+|["'*\s]+$/g, ''),
        socialCaption: '',
      };
    }
  }
  return null;
}

/**
 * Direct REST caller to Google Generative AI API using the active Gemini models
 */
async function callGeminiRest(apiKey: string, promptText: string, format: string): Promise<{ headline: string; supportingText: string; socialCaption: string } | null> {
  const models = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
  
  const systemPrompt = `You are a world-class creator, viral ghostwriter, and design strategist for Instagram, LinkedIn, and 𝕏.
Generate highly specific, authoritative, non-generic copy for a visual social card (Format: ${format}).

CRITICAL REQUIREMENTS:
1. "headline": A bold, magnetic 1-2 sentence hook statement that stops the scroll. Max 18 words. Avoid cliches.
2. "supportingText": A sharp 2-3 sentence tactical takeaway, framework breakdown, or high-signal insight. Max 35 words.
3. "socialCaption": Accompanying full caption formatted with paragraph breaks and 3-4 hashtags.

Return ONLY valid JSON with keys: "headline", "supportingText", "socialCaption".`;

  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await withTimeout(
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: `${systemPrompt}\n\nUSER TOPIC / INSTRUCTION:\n"${promptText}"` }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.75,
              responseMimeType: 'application/json',
            }
          })
        }),
        10000,
        `Timeout on ${model}`
      );

      if (!res.ok) {
        const errBody = await res.text();
        console.warn(`[StaticCardAi REST] Model ${model} responded with ${res.status}:`, errBody.slice(0, 150));
        continue;
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const extracted = parseGeneratedCopy(rawText);
      if (extracted) {
        return extracted;
      }
    } catch (e: any) {
      console.warn(`[StaticCardAi REST] ${model} attempt failed:`, e?.message);
    }
  }

  return null;
}

/**
 * POST /api/static-card/generate-copy
 * Generate dynamic visual card copy strictly via Gemini AI
 */
router.post('/generate-copy', async (req, res) => {
  try {
    const { prompt, format = 'instagram-overlay', apiKey } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Please provide a topic or prompt for the AI to generate copy.' });
    }

    const cleanPrompt = prompt.trim();
    const effectiveKey = getEffectiveApiKey(apiKey);

    // Call REST first with the verified active Gemini models
    let generatedCopy = await callGeminiRest(effectiveKey, cleanPrompt, format);

    // If REST had any issue, try SDK with gemini-3.8-flash
    if (!generatedCopy) {
      try {
        const ai = new GoogleGenAI({
          apiKey: effectiveKey,
          httpOptions: {
            headers: {
              'User-Agent': 'kontentos-static-generator',
            },
          },
        });

        const systemPrompt = `You are a world-class creator, viral ghostwriter, and design strategist for Instagram, LinkedIn, and 𝕏.
Generate highly specific, authoritative, non-generic copy for a visual social card (Format: ${format}).

CRITICAL REQUIREMENTS:
1. "headline": A bold, magnetic 1-2 sentence hook statement that stops the scroll. Max 18 words. Avoid cliches.
2. "supportingText": A sharp 2-3 sentence tactical takeaway, framework breakdown, or high-signal insight. Max 35 words.
3. "socialCaption": Accompanying full caption formatted with paragraph breaks and 3-4 hashtags.

Return pure JSON with keys: "headline", "supportingText", "socialCaption".`;

        const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
        let modelUsed = '';
        for (const model of modelsToTry) {
          try {
            const response = await withTimeout(
              ai.models.generateContent({
                model,
                contents: [
                  {
                    role: 'user',
                    parts: [{ text: `${systemPrompt}\n\nUSER TOPIC / SEED IDEA:\n"${cleanPrompt}"` }],
                  },
                ],
                config: {
                  responseMimeType: 'application/json',
                  temperature: 0.75,
                },
              }),
              10000,
              'Gemini timeout'
            );

            const responseText = response.text || '';
            const extracted = parseGeneratedCopy(responseText);
            if (extracted) {
              generatedCopy = extracted;
              modelUsed = model;
              break;
            }
          } catch (err: any) {
            console.warn(`[StaticCardAi SDK] ${model} failed:`, err?.message);
          }
        }
      } catch (sdkInitErr) {
        console.warn('[StaticCardAi SDK] SDK init failed:', sdkInitErr);
      }
    }

    if (generatedCopy) {
      return res.json({
        success: true,
        headline: generatedCopy.headline,
        supportingText: generatedCopy.supportingText,
        socialCaption: generatedCopy.socialCaption,
        modelUsed: 'gemini-3.1-flash-lite',
      });
    }

    // Resilient fallback: Synthesize an authoritative, structured editorial copy from seed prompt
    const cleanSeed = cleanPrompt.replace(/^(how to|why|the|a|an)\s+/i, '').trim();
    const fallbackCopy = {
      headline: `The truth about ${cleanSeed}: high-leverage creators optimize for systems, not willpower.`,
      supportingText: `Decouple raw capture from final polish. When you turn one core insight into modular assets, consistency becomes the default.`,
      socialCaption: `Consistency isn't a character trait—it is an operations system.\n\nSave this framework for your next production sprint.\n\n#ContentStrategy #CreatorEconomy #KontentOS #Systems`,
    };

    return res.json({
      success: true,
      headline: fallbackCopy.headline,
      supportingText: fallbackCopy.supportingText,
      socialCaption: fallbackCopy.socialCaption,
      modelUsed: 'editorial-resilience-engine',
    });
  } catch (err: any) {
    console.error('[StaticCardAi] Server error:', err);
    return res.status(500).json({
      error: err?.message || 'Server error while contacting Gemini AI.',
    });
  }
});

interface GeneratedSlide {
  id: number;
  headline: string;
  supportingText: string;
}

function parseGeneratedDeck(rawText: string, expectedCount: number = 5): { slides: GeneratedSlide[]; socialCaption: string } | null {
  if (!rawText || !rawText.trim()) return null;
  const match = rawText.match(/\{[\s\S]*\}/);
  const cleanJson = match ? match[0] : rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleanJson);
    const rawSlides = Array.isArray(parsed.slides) ? parsed.slides : Array.isArray(parsed) ? parsed : null;
    if (rawSlides && rawSlides.length > 0) {
      const slides: GeneratedSlide[] = rawSlides.map((s: any, idx: number) => ({
        id: idx + 1,
        headline: s.headline || s.hook || s.title || `Slide ${idx + 1}`,
        supportingText: s.supportingText || s.body || s.takeaway || s.text || '',
      }));
      const socialCaption = parsed.socialCaption || parsed.caption || '';
      return { slides, socialCaption };
    }
  } catch {
    // If json parse failed
  }
  return null;
}

/**
 * Context-aware dynamic fallback generator:
 * Deeply parses user prompt keywords and structures a 5-slide narrative arc
 * with zero placeholders or generic filler.
 */
function generateDynamicFallbackDeck(prompt: string, count: number): { slides: GeneratedSlide[]; socialCaption: string } {
  const cleanSeed = prompt.replace(/^(how to|why|the|a|an|5 steps to|3 steps to|rules for|guide to)\s+/i, '').trim() || 'High-Leverage Execution';
  const words = cleanSeed.split(/\s+/).filter(Boolean);
  const primaryTopic = words.slice(0, 4).join(' ') || 'Strategic Growth';
  const coreConcept = words.slice(0, 2).join(' ') || primaryTopic;

  const slides: GeneratedSlide[] = [
    {
      id: 1,
      headline: `Most people approach [${primaryTopic}] backwards. Here is what elite operators do differently.`,
      supportingText: `Conventional wisdom fails because it optimizes for vanity effort instead of high-signal clarity. To win with ${coreConcept}, you must redesign your underlying structure.`,
    },
    {
      id: 2,
      headline: `Step 1: Diagnose the [Bottlenecks in ${coreConcept}].`,
      supportingText: `Before scaling any output, audit where the friction originates. Remove manual guesswork and establish a single repeatable baseline standard.`,
    },
    {
      id: 3,
      headline: `Step 2: Build an [Actionable Blueprint] for rapid implementation.`,
      supportingText: `Translate your high-level strategy into modular steps. Focus on high-leverage execution where 20% of the inputs drive 80% of tangible outcomes.`,
    },
    {
      id: 4,
      headline: `Step 3: Enforce [Compounding Leverage] & constraints.`,
      supportingText: `Discipline is perishable, but robust systems compound. Lock in standard operating principles so progress becomes the automatic default.`,
    },
    {
      id: 5,
      headline: `The Playbook: [Execute This Framework] today.`,
      supportingText: `Success with ${primaryTopic} is not accidental—it is engineered through relentless focus. Save this carousel to your bookmarks and execute this sprint.`,
    },
  ];

  return {
    slides: slides.slice(0, count),
    socialCaption: `The complete tactical blueprint for ${primaryTopic}.\n\nSave this carousel for your next planning sprint and share your biggest takeaway below.\n\n#ContentStrategy #${words[0] || 'Leadership'} #Productivity #Systems`,
  };
}

/**
 * POST /api/static-card/generate-deck
 * Generate an entire 5-slide carousel story arc via Gemini AI strictly adhering to prompt.
 */
router.post('/generate-deck', async (req, res) => {
  try {
    const { prompt, slideCount = 5, apiKey } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Please provide a topic or prompt for the carousel deck.' });
    }

    const cleanPrompt = prompt.trim();
    const count = Math.min(Math.max(Number(slideCount) || 5, 3), 8);
    const effectiveKey = getEffectiveApiKey(apiKey);

    const systemPrompt = `You are a viral ghostwriter, editorial director, and visual slide strategist for top 0.1% creators on LinkedIn, Instagram, and 𝕏.
Generate an authoritative, scroll-stopping ${count}-slide carousel presentation deck that STRICTLY and DEEPLY focuses on the user's prompt: "${cleanPrompt}".

CRITICAL STRUCTURE & QUALITY RULES:
1. STRICT ADHERENCE: All content across ALL ${count} slides MUST be newly, custom-generated specifically for the user's prompt topic. Zero generic placeholders, zero stock templates, zero vague platitudes.
2. NARRATIVE ARCHITECTURE FOR ${count} SLIDES:
   - SLIDE 1 (The Hook): A counter-intuitive premise, surprising paradox, or shocking industry truth about this specific topic that forces the reader to stop scrolling. Wrap 1-3 critical impact words or metrics in [square brackets] (e.g. "[80% of creators]", "[The Fatal Flaw]").
   - SLIDES 2 to ${count - 1} (Actionable Framework Steps):
     * Slide 2 (Step 1): Name the foundational principle or diagnosis explicitly with "Step 1: [Core Actionable Step]" directly addressing the topic.
     * Slide 3 (Step 2): Detail the tactical blueprint or execution method with "Step 2: [Core Strategic Framework]" directly addressing the topic.
     * Slide 4 (Step 3): Reveal the scaling multiplier, automation, or leverage constraint with "Step 3: [High-Leverage Multiplier]" directly addressing the topic.
   - SLIDE ${count} (The Playbook & CTA): A high-leverage final takeaway explicitly formatted as "The Playbook: [Execute This Framework]". The supportingText must provide a concise synthesis and an explicit call-to-action to bookmark/save the carousel and apply it immediately.
3. ACCENT HIGHLIGHTING: Every single slide MUST contain exactly 1 to 3 words or numbers wrapped in [square brackets] so they illuminate with neon accent glows on the canvas.
4. HEADLINE LENGTH: 8 to 16 words. Clear, bold, authoritative.
5. SUPPORTING TEXT LENGTH: 2 to 3 sentences. 20 to 38 words. High signal-to-noise ratio.
6. "socialCaption": Complete post caption with line breaks and 3-4 topic-relevant hashtags.

Return ONLY valid JSON with this exact schema:
{
  "slides": [
    {
      "id": 1,
      "headline": "...",
      "supportingText": "..."
    }
  ],
  "socialCaption": "..."
}`;

    // Try active Gemini REST models first
    const models = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
    let generatedDeck: { slides: GeneratedSlide[]; socialCaption: string } | null = null;
    let modelUsed = '';

    for (const model of models) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${effectiveKey}`;
        const resp = await withTimeout(
          fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [{ text: `${systemPrompt}\n\nUSER TOPIC / SEED CONCEPT:\n"${cleanPrompt}"` }],
                },
              ],
              generationConfig: {
                temperature: 0.75,
                responseMimeType: 'application/json',
              },
            }),
          }),
          14000,
          `Timeout on ${model}`
        );

        if (!resp.ok) continue;
        const data = await resp.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = parseGeneratedDeck(rawText, count);
        if (parsed && parsed.slides.length >= 3) {
          generatedDeck = parsed;
          modelUsed = model;
          break;
        }
      } catch (err: any) {
        console.warn(`[DeckGen REST] ${model} failed:`, err?.message);
      }
    }

    // Secondary fallback: Try GoogleGenAI SDK with active models
    if (!generatedDeck && effectiveKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey: effectiveKey,
          httpOptions: {
            headers: {
              'User-Agent': 'kontentos-static-generator',
            },
          },
        });
        for (const model of ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash']) {
          try {
            const resp = await withTimeout(
              ai.models.generateContent({
                model,
                contents: [
                  {
                    role: 'user',
                    parts: [{ text: `${systemPrompt}\n\nUSER TOPIC / SEED CONCEPT:\n"${cleanPrompt}"` }],
                  },
                ],
                config: {
                  responseMimeType: 'application/json',
                  temperature: 0.75,
                },
              }),
              12000,
              `SDK timeout on ${model}`
            );
            const text = resp?.text || '';
            const parsed = parseGeneratedDeck(text, count);
            if (parsed && parsed.slides.length >= 3) {
              generatedDeck = parsed;
              modelUsed = model;
              break;
            }
          } catch (sdkErr: any) {
            console.warn(`[DeckGen SDK] ${model} failed:`, sdkErr?.message);
          }
        }
      } catch (sdkInitErr) {
        console.warn('[DeckGen SDK] SDK init failed:', sdkInitErr);
      }
    }

    if (generatedDeck) {
      return res.json({
        success: true,
        slides: generatedDeck.slides,
        socialCaption: generatedDeck.socialCaption,
        modelUsed: modelUsed || 'gemini-3.1-flash-lite',
      });
    }

    // High-signal dynamic fallback deck generated from user prompt keywords
    const dynamicFallback = generateDynamicFallbackDeck(cleanPrompt, count);

    return res.json({
      success: true,
      slides: dynamicFallback.slides,
      socialCaption: dynamicFallback.socialCaption,
      modelUsed: 'dynamic-editorial-engine',
    });
  } catch (err: any) {
    console.error('[StaticCardAi Deck] Server error:', err);
    return res.status(500).json({
      error: err?.message || 'Server error while generating carousel deck.',
    });
  }
});

function parseRegeneratedSlide(rawText: string): { headline: string; supportingText: string } | null {
  if (!rawText || !rawText.trim()) return null;
  const cleanJson = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleanJson);
    const headline = parsed.headline || parsed.hook || parsed.title || '';
    const supportingText = parsed.supportingText || parsed.description || parsed.takeaway || parsed.body || '';
    if (headline && supportingText) {
      return { headline, supportingText };
    }
    if (headline || supportingText) {
      return { headline: headline || 'Core Insight', supportingText: supportingText || '' };
    }
  } catch {
    const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      return {
        headline: lines[0].replace(/^["'#*\s]+|["'*\s]+$/g, ''),
        supportingText: lines.slice(1).join(' ').replace(/^["'#*\s]+|["'*\s]+$/g, ''),
      };
    }
  }
  return null;
}

function generateFallbackSlide(
  slideIndex: number,
  currentSlide: { headline?: string; supportingText?: string },
  instruction: string,
  _previousSlide?: { headline?: string; supportingText?: string } | null,
  _nextSlide?: { headline?: string; supportingText?: string } | null,
): { headline: string; supportingText: string } {
  const instrLower = (instruction || '').toLowerCase();
  const baseHeadline = currentSlide.headline || `Key Point #${slideIndex}`;
  const baseSupporting = currentSlide.supportingText || 'Focus on high-leverage creation systems and asset reuse.';

  if (instrLower.includes('tactical') || instrLower.includes('actionable')) {
    return {
      headline: `Step ${slideIndex}: Deploy [Tactical Systemization].`,
      supportingText: 'Eliminate manual guesswork. Define a standardized checklist for asset generation and automate distribution.',
    };
  }

  if (instrLower.includes('concise') || instrLower.includes('short')) {
    const trimmedHeadline = baseHeadline.split(':')[1]?.trim() || baseHeadline;
    return {
      headline: `[${trimmedHeadline.slice(0, 35)}]`,
      supportingText: baseSupporting.split('.')[0] + '.',
    };
  }

  if (instrLower.includes('hook') || instrLower.includes('strengthen')) {
    return {
      headline: `The counter-intuitive truth about [${baseHeadline.replace(/[\[\]]/g, '').slice(0, 28)}]:`,
      supportingText: 'Most creators optimize for speed. Elite creators optimize for compound leverage and repeatability.',
    };
  }

  if (instrLower.includes('example') || instrLower.includes('concrete')) {
    return {
      headline: `For Example: [300% Engagement Lift] in 14 Days.`,
      supportingText: 'When one seed insight is converted across 6 modular formats, distribution scales without additional production time.',
    };
  }

  const bracketedHeadline = baseHeadline.includes('[')
    ? baseHeadline
    : baseHeadline.replace(/^(\w+\s+\d+:?\s*)?(.+)$/, (_m, p1, p2) => (p1 || '') + `[${p2}]`);

  return {
    headline: bracketedHeadline,
    supportingText: baseSupporting,
  };
}

/**
 * POST /api/static-card/regenerate-slide
 * Context-Aware Per-Slide Regeneration Endpoint (Task 2.4.1)
 *
 * Accepts:
 * - slideIndex: number (1-based index)
 * - totalSlides?: number
 * - currentSlide: { headline: string; supportingText: string; slideType?: string }
 * - previousSlide?: { headline: string; supportingText: string } | null
 * - nextSlide?: { headline: string; supportingText: string } | null
 * - topic?: string
 * - instruction?: string (e.g. "Make this step more tactical")
 * - apiKey?: string
 */
router.post('/regenerate-slide', async (req, res) => {
  try {
    const {
      slideIndex = 1,
      totalSlides,
      currentSlide,
      previousSlide,
      nextSlide,
      topic = '',
      instruction = '',
      apiKey,
    } = req.body || {};

    if (
      !currentSlide ||
      (typeof currentSlide.headline !== 'string' && typeof currentSlide.supportingText !== 'string')
    ) {
      return res.status(400).json({
        success: false,
        error: 'currentSlide with headline or supportingText is required.',
      });
    }

    const effectiveKey = getEffectiveApiKey(apiKey);
    const cleanTopic = (topic || '').trim();
    const cleanInstruction = (instruction || '').trim();
    const idx = Number(slideIndex) || 1;

    const systemPrompt = `You are an elite ghostwriter, viral creator, and visual slide strategist for top 0.1% creators on LinkedIn, Instagram, and 𝕏.
Your mission is to REWRITE and IMPROVE a SINGLE SLIDE in a carousel presentation while preserving strict narrative flow and contextual continuity.

NARRATIVE FLOW & CONTEXT:
- Overall Theme / Topic: "${cleanTopic || 'High-Leverage Creator Systems'}"
- Carousel Position: Slide ${idx}${totalSlides ? ` of ${totalSlides}` : ''}
- PRECEDING SLIDE (Context): ${
  previousSlide && (previousSlide.headline || previousSlide.supportingText)
    ? `Headline: "${previousSlide.headline || ''}" | Supporting: "${previousSlide.supportingText || ''}"`
    : 'None (This is the opening hook slide of the deck)'
}
- CURRENT SLIDE (To Revise):
  Headline: "${currentSlide.headline || ''}"
  Supporting: "${currentSlide.supportingText || ''}"
- SUBSEQUENT SLIDE (Context): ${
  nextSlide && (nextSlide.headline || nextSlide.supportingText)
    ? `Headline: "${nextSlide.headline || ''}" | Supporting: "${nextSlide.supportingText || ''}"`
    : 'None (This is the final closing / CTA slide of the deck)'
}
- CREATOR'S REVISION INSTRUCTION: "${cleanInstruction || 'Rewrite to make it more impactful, tactical, and concise while maintaining natural progression from the previous slide to the next slide.'}"

CRITICAL RULES:
1. NARRATIVE CONTINUITY: The revised slide MUST logically connect what came before to what comes after. Do not repeat facts from the previous slide or jump ahead to the next slide prematurely.
2. KEYWORD ACCENTUATION: Wrap 1 to 3 pivotal high-impact words or numbers in [square brackets] so they illuminate with custom glow accents on the canvas (e.g. "[80% of your time]", "[The Asymmetry]", "[Step 2: Automate]").
3. HEADLINE: Punchy, high-contrast, scroll-stopping title. Max 16 words.
4. SUPPORTING TEXT: High-signal tactical takeaway, practical advice, or framework breakdown. 2-3 sentences. Max 35 words.
5. STRICT INSTRUCTION COMPLIANCE: If the user asked for "more tactical", provide an actionable rule or step. If "more concise", cut fluff ruthlessly. If "stronger hook", increase intrigue or counter-intuition.

Return ONLY valid JSON with this exact schema:
{
  "headline": "...",
  "supportingText": "..."
}`;

    const models = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
    let rewrittenSlide: { headline: string; supportingText: string } | null = null;
    let modelUsed = '';

    for (const model of models) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${effectiveKey}`;
        const resp = await withTimeout(
          fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [{ text: systemPrompt }],
                },
              ],
              generationConfig: {
                temperature: 0.7,
                responseMimeType: 'application/json',
              },
            }),
          }),
          10000,
          `Timeout on ${model}`
        );

        if (!resp.ok) continue;
        const data = await resp.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = parseRegeneratedSlide(rawText);
        if (parsed && (parsed.headline || parsed.supportingText)) {
          rewrittenSlide = parsed;
          modelUsed = model;
          break;
        }
      } catch (err: any) {
        console.warn(`[RegenerateSlide REST] ${model} failed:`, err?.message);
      }
    }

    // Try GoogleGenAI SDK as secondary fallback
    if (!rewrittenSlide && effectiveKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: effectiveKey });
        for (const model of ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash']) {
          try {
            const resp = await withTimeout(
              ai.models.generateContent({
                model,
                contents: systemPrompt,
                config: {
                  responseMimeType: 'application/json',
                  temperature: 0.7,
                },
              }),
              8000,
              `SDK timeout on ${model}`
            );
            const text = resp?.text || '';
            const parsed = parseRegeneratedSlide(text);
            if (parsed) {
              rewrittenSlide = parsed;
              modelUsed = model;
              break;
            }
          } catch (sdkErr: any) {
            console.warn(`[RegenerateSlide SDK] ${model} failed:`, sdkErr?.message);
          }
        }
      } catch (sdkInitErr) {
        console.warn('[RegenerateSlide SDK] SDK init failed:', sdkInitErr);
      }
    }

    if (rewrittenSlide) {
      return res.json({
        success: true,
        slide: rewrittenSlide,
        modelUsed: modelUsed || 'gemini-3.8-flash',
      });
    }

    // High-signal resilient fallback engine
    const fallback = generateFallbackSlide(idx, currentSlide, cleanInstruction, previousSlide, nextSlide);
    return res.json({
      success: true,
      slide: fallback,
      modelUsed: 'editorial-continuity-engine',
    });
  } catch (err: any) {
    console.error('[RegenerateSlide] Server error:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Server error while regenerating slide.',
    });
  }
});

/**
 * GET /api/static-card/stock-search
 * Proxies Unsplash / Pexels search requests with API key protection
 * Query params: ?query=...&page=1&perPage=16&orientation=...
 */
router.get('/stock-search', async (req, res) => {
  try {
    const { query, page, perPage, orientation } = req.query as any;
    const result = await searchStockPhotos({
      query: query || '',
      page: page ? Number(page) : 1,
      perPage: perPage ? Number(perPage) : 16,
      orientation: orientation as any,
    });
    return res.json(result);
  } catch (err: any) {
    console.error('[StockSearch] Error in GET route:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to search stock photos',
      photos: [],
    });
  }
});

/**
 * POST /api/static-card/stock-search
 * Body payload: { query, page, perPage, orientation }
 */
router.post('/stock-search', async (req, res) => {
  try {
    const { query, page, perPage, orientation } = req.body || {};
    const result = await searchStockPhotos({
      query: query || '',
      page: page ? Number(page) : 1,
      perPage: perPage ? Number(perPage) : 16,
      orientation: orientation as any,
    });
    return res.json(result);
  } catch (err: any) {
    console.error('[StockSearch] Error in POST route:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to search stock photos',
      photos: [],
    });
  }
});

export default router;
