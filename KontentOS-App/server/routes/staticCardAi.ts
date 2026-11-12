import express from 'express';
import { searchStockPhotos } from '../stockSearchService.js';
import { envGeminiKey } from '../geminiKey.js';
import { safeMessage } from '../errorText.js';
import {
  DEFAULT_MODEL,
  ENGINE_MODELS,
  MODEL_ATTEMPT_TIMEOUT_MS,
  preferredModelFrom,
} from './caption.js';

const router = express.Router();

// Gemini replies come back as untyped JSON over fetch(); only declare what is read.
type GeminiReply = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

function readGeminiText(payload: unknown): string {
  const data = payload as GeminiReply;
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function getEffectiveApiKey(): string {
  // The deployment's key, or nothing. A browser-sent key is not accepted: it would have to travel
  // on every request and sit in somebody's localStorage to be worth anything to its owner.
  // Empty string = no key: the Gemini calls below fail quietly and the route uses its fallback copy.
  return envGeminiKey() || '';
}

// Timeout helper
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
  ]);
}

/**
 * One attempt per engine, starting with the model the Room station picked, with the rest of the
 * cascade behind it. This replaces an earlier shape that tried every model over raw REST and then
 * tried the same list again through the SDK — the SDK posts to the same endpoint with the same key,
 * so the second pass only doubled the time the creator spent watching a spinner when the first pass
 * had already been refused.
 */
async function askEngine<T>(
  apiKey: string,
  systemPrompt: string,
  userText: string,
  preferredModel: unknown,
  parse: (rawText: string) => T | null
): Promise<{ result: T; modelUsed: string } | null> {
  if (!apiKey) return null;
  const models = Array.from(
    new Set([preferredModelFrom(preferredModel) ?? DEFAULT_MODEL, ...ENGINE_MODELS])
  );

  for (const model of models) {
    try {
      // The key goes in a header, not the URL: a query string is what ends up in proxy logs,
      // crash reports and anybody's browser history.
      const res = await withTimeout(
        fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userText}` }] }],
            generationConfig: { temperature: 0.75, responseMimeType: 'application/json' },
          }),
        }),
        MODEL_ATTEMPT_TIMEOUT_MS,
        `Timeout on ${model}`
      );
      if (!res.ok) {
        console.warn(`[StaticCardAi] ${model} responded ${res.status}:`, (await res.text()).slice(0, 150));
        continue;
      }
      const extracted = parse(readGeminiText(await res.json()));
      if (extracted) return { result: extracted, modelUsed: model };
    } catch (err: any) {
      console.warn(`[StaticCardAi] ${model} attempt failed:`, err?.message);
    }
  }

  return null;
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
 * The voice the engine is asked for. Tone and the Brand Kit brief come from the bench, so the Kit
 * and Room switches decide what card copy sounds like — before this the route always asked for a
 * "world-class viral ghostwriter", whatever the creator had actually set.
 */
function voiceLines(tone: unknown, context: unknown): string[] {
  const lines: string[] = [];
  const cleanTone = typeof tone === 'string' ? tone.trim().slice(0, 120) : '';
  const cleanContext = typeof context === 'string' ? context.trim().slice(0, 1200) : '';
  if (cleanTone) lines.push(`Tone: ${cleanTone}.`);
  if (cleanContext) lines.push(`Write inside this creator's own voice — use it, do not describe it:\n${cleanContext}`);
  return lines;
}

/**
 * POST /api/static-card/generate-copy
 * Headline, supporting text and caption for one card, in the creator's voice.
 */
router.post('/generate-copy', async (req, res) => {
  try {
    const { prompt, format = 'instagram-overlay', tone, context, model } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Please provide a topic or prompt for the AI to generate copy.' });
    }

    const cleanFormat = typeof format === 'string' ? format.slice(0, 60) : 'instagram-overlay';
    const systemPrompt = `You are writing the words on one static social card (format: ${cleanFormat}).
${voiceLines(tone, context).join('\n')}

The card has three parts:
1. "headline": the claim itself, one to two sentences, max 18 words. No scene-setting, no cliches.
2. "supportingText": the part that is actually useful — the step, the number or the trade-off. Two to three sentences, max 35 words.
3. "socialCaption": the caption that goes with the card, paragraph breaks and three or four hashtags.

Wrap one to three words in [square brackets] where the card should put the accent.
Return ONLY valid JSON with keys: "headline", "supportingText", "socialCaption".`;

    const generated = await askEngine(
      getEffectiveApiKey(),
      systemPrompt,
      `USER TOPIC:\n"${prompt.trim()}"`,
      model,
      parseGeneratedCopy
    );

    if (generated) {
      return res.json({
        success: true,
        headline: generated.result.headline,
        supportingText: generated.result.supportingText,
        socialCaption: generated.result.socialCaption,
        // The engine that actually answered — the panel prints it, so it cannot be a fixed name.
        modelUsed: generated.modelUsed,
      });
    }

    // Nothing answered. A sentence pattern with the creator's topic dropped into it is not copy —
    // and the panel that shows this result is labelled with the engine's name, so say what happened.
    return res.status(502).json({ error: 'No copy engine answered. Try again in a moment.' });
  } catch (err: any) {
    console.error('[StaticCardAi] Server error:', err);
    return res.status(500).json({
      error: safeMessage(err, 'Server error while contacting the copy engine.'),
    });
  }
});

export interface GeneratedSlide {
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
 * One slide per beat, in the creator's voice. Answers null when no engine replied — the caller
 * then says so, because a carousel pattern with the topic dropped into it is not a deck.
 *
 * Both the Card station's own button and the Press come through here, which is why the whole deck
 * arrives in one call rather than slide by slide: a six-card press that asked six times would spend
 * six engine timeouts to write one thought.
 */
export async function generateDeck(input: {
  prompt: string;
  slideCount: number;
  tone?: unknown;
  context?: unknown;
  model?: unknown;
}): Promise<{ slides: GeneratedSlide[]; socialCaption: string; modelUsed: string } | null> {
  const count = Math.min(Math.max(Math.round(Number(input.slideCount) || 5), 3), 8);

  const systemPrompt = `You are writing a ${count}-slide carousel about one topic, in the creator's own voice.
${voiceLines(input.tone, input.context).join('\n')}

The deck's shape:
- Slide 1 makes the claim. One to two sentences, max 16 words.
- Slides 2 to ${count - 1} are the moves, in the order they actually happen. Each headline starts "Step 1:", "Step 2:" and so on, and its supporting text says what to do and what it costs or fixes.
- Slide ${count} closes: a synthesis of the steps in two to three sentences.
- Every slide wraps one to three words or numbers in [square brackets]; those are the words the card lights up.
- Headline: 8 to 16 words. Supporting text: 2 to 3 sentences, 20 to 38 words.
- "socialCaption": the caption that goes with the deck, paragraph breaks and three or four hashtags.

Say the specific thing, not the general one. If a number or a scene is not in the topic, leave a bracket for the creator to fill rather than inventing it.
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

  const generated = await askEngine(
    getEffectiveApiKey(),
    systemPrompt,
    `USER TOPIC:\n"${input.prompt.trim()}"`,
    input.model,
    (rawText) => {
      const parsed = parseGeneratedDeck(rawText, count);
      return parsed && parsed.slides.length >= 3 ? parsed : null;
    }
  );

  if (!generated) return null;
  return {
    slides: generated.result.slides,
    socialCaption: generated.result.socialCaption,
    modelUsed: generated.modelUsed,
  };
}

/**
 * POST /api/static-card/generate-deck
 * A whole carousel arc — one slide per beat, in the creator's voice.
 */
router.post('/generate-deck', async (req, res) => {
  try {
    const { prompt, slideCount = 5, tone, context, model } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Please provide a topic or prompt for the carousel deck.' });
    }

    const deck = await generateDeck({ prompt, slideCount, tone, context, model });

    if (deck) {
      return res.json({
        success: true,
        slides: deck.slides,
        socialCaption: deck.socialCaption,
        modelUsed: deck.modelUsed,
      });
    }

    return res.status(502).json({ error: 'No copy engine answered. Try again in a moment.' });
  } catch (err: any) {
    console.error('[StaticCardAi Deck] Server error:', err);
    return res.status(500).json({
      error: safeMessage(err, 'Server error while generating carousel deck.'),
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

/**
 * POST /api/static-card/regenerate-slide
 * Rewrite the one slide the creator is standing on, with its neighbours for continuity.
 *
 * Accepts slideIndex, totalSlides, currentSlide, previousSlide, nextSlide, topic, instruction,
 * plus the same tone/context/model the rest of the copy routes take.
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
      tone,
      context,
      model,
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

    const cleanTopic = (topic || '').trim();
    const cleanInstruction = (instruction || '').trim();
    const idx = Number(slideIndex) || 1;

    const neighbour = (slide: any, whenEmpty: string) =>
      slide && (slide.headline || slide.supportingText)
        ? `Headline: "${slide.headline || ''}" | Supporting: "${slide.supportingText || ''}"`
        : whenEmpty;

    const systemPrompt = `You are rewriting a single slide of a carousel so it reads better, in the creator's own voice.
${voiceLines(tone, context).join('\n')}

Where it sits:
- Topic: "${cleanTopic || 'the creator is filling this in themselves — keep their subject'}"
- Position: slide ${idx}${totalSlides ? ` of ${totalSlides}` : ''}
- Before it: ${neighbour(previousSlide, 'nothing — this is the opening slide')}
- This slide, to revise:
  Headline: "${currentSlide.headline || ''}"
  Supporting: "${currentSlide.supportingText || ''}"
- After it: ${neighbour(nextSlide, 'nothing — this is the closing slide')}
- What the creator asked for: "${cleanInstruction || 'make it plainer, keep the thread from the slide before to the one after'}"

Rules:
1. Carry the thread: do not repeat what the previous slide said, do not spend what the next slide needs.
2. Wrap one to three words or numbers in [square brackets]; those light up on the card.
3. Headline max 16 words. Supporting text 2 to 3 sentences, max 35 words.
4. Do the revision the creator asked for. "More tactical" means a step; "more concise" means cutting; "stronger hook" means a sharper claim.
5. Do not invent a number, a result or a scene the creator has not given you — leave a bracket instead.

Return ONLY valid JSON with this exact schema:
{
  "headline": "...",
  "supportingText": "..."
}`;

    const rewritten = await askEngine(
      getEffectiveApiKey(),
      systemPrompt,
      'Rewrite the slide described above.',
      model,
      (rawText) => {
        const parsed = parseRegeneratedSlide(rawText);
        return parsed && (parsed.headline || parsed.supportingText) ? parsed : null;
      }
    );

    if (rewritten) {
      return res.json({
        success: true,
        slide: rewritten.result,
        modelUsed: rewritten.modelUsed,
      });
    }

    return res.status(502).json({ error: 'No copy engine answered. Try again in a moment.' });
  } catch (err: any) {
    console.error('[RegenerateSlide] Server error:', err);
    return res.status(500).json({
      success: false,
      error: safeMessage(err, 'Server error while regenerating slide.'),
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
      error: safeMessage(err, 'Failed to search stock photos'),
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
      error: safeMessage(err, 'Failed to search stock photos'),
      photos: [],
    });
  }
});

export default router;
