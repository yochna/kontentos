import { GoogleGenAI } from '@google/genai';

export interface IdeaBlueprint {
  focus: string;
  why: string;
  formats: string[];
  hook: string;
  hookScore: number;
  beats: { label: string; time: string; body: string }[];
}

export interface GeneratedIdea {
  id: string;
  category: string;
  categoryTone: 'tertiary' | 'primary' | 'secondary' | 'neutral';
  title: string;
  excerpt: string;
  format: string;
  metric: string;
  thumb: string;
  imageId: string;
  imageAlt: string;
  blueprint: IdeaBlueprint;
}

const CURATED_IMAGES = [
  { id: 'eGGFZ5X2LnA', alt: 'Macro of an AI processor chip on a circuit board' },
  { id: 'Wpnoqo2plFA', alt: 'Close-up of a spreadsheet full of figures on a screen' },
  { id: 'DqmXihYx5UE', alt: 'Videographer operating a cinema camera on a film set' },
  { id: 'qC2n6RQU4Vw', alt: 'Design team collaborating over wireframe sketches and sticky notes' },
  { id: 'qwtCeJ5cLYs', alt: 'Analytics dashboard showing CTR, cost-per-conversion and quality-score metrics' },
  { id: '1tCQcTjLoRQ', alt: 'Vintage handwritten journal with an old photograph and pressed flowers' },
];

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'kontentos-redesign',
      },
    },
  });
}

export async function generateIdeas(topic?: string, niche = 'Studio & SaaS'): Promise<GeneratedIdea[]> {
  const query = (topic || '').trim();
  const ai = getGeminiClient();

  if (ai && query) {
    try {
      const prompt = `You are an elite short-form video creator, scriptwriter, and viral content strategist.
Given the topic "${query}" and niche "${niche}", generate 6 unique, scroll-stopping content ideas and detailed blueprints.

Categories to cover across the 6 ideas:
1. Trending Sprint (categoryTone: "tertiary")
2. High Potential (categoryTone: "primary")
3. Your Niche (categoryTone: "secondary")
4. Transparent Studio (categoryTone: "neutral")
5. Metric Runbook (categoryTone: "primary")
6. Evergreen (categoryTone: "neutral")

For each idea, return:
- title: punchy, compelling title (under 60 chars)
- excerpt: one concise sentence summarizing the core angle
- category: one of the 6 categories above
- categoryTone: matching categoryTone
- format: suggested duration/format (e.g. "Reel · 30 sec", "Carousel · 7 slides", "Short · 45s")
- metric: a hook highlight (e.g. "Hook: 94%", "Viral Resonance", "High Retention")
- blueprint:
  - focus: angle archetype (e.g. "Contrarian Focus", "Operator Playbook", "BTS Breakdown")
  - why: 2 sentences explaining why this works psychologically on the viewer
  - formats: array of 3-4 formats (e.g. ["Reel (30s)", "Carousel", "LinkedIn Post", "Short"])
  - hook: exact opening spoken hook in quotation marks (must stop the scroll in 3 seconds)
  - hookScore: number between 80 and 97
  - beats: array of 3 timed beats with { label: "Beat 1: The Trap", time: "0:00 - 0:04", body: "visual + spoken action" }

Return STRICTLY a JSON array of 6 idea objects with NO markdown formatting, NO backticks.`;

      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const text = res.text?.trim();
      if (text) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item, idx) => ({
            id: `idea-${Date.now()}-${idx}`,
            category: item.category || 'High Potential',
            categoryTone: item.categoryTone || 'primary',
            title: item.title || `${query} Breakdown`,
            excerpt: item.excerpt || 'A tactical short-form breakdown.',
            format: item.format || 'Reel · 30 sec',
            metric: item.metric || `Hook: ${item.blueprint?.hookScore || 90}%`,
            thumb: String.fromCharCode(97 + (idx % 6)), // 'a' through 'f'
            imageId: CURATED_IMAGES[idx % CURATED_IMAGES.length].id,
            imageAlt: CURATED_IMAGES[idx % CURATED_IMAGES.length].alt,
            blueprint: {
              focus: item.blueprint?.focus || 'Strategic Angle',
              why: item.blueprint?.why || 'Direct pain point paired with actionable tactical advice.',
              formats: item.blueprint?.formats || ['Reel (30s)', 'Carousel', 'LinkedIn Post'],
              hook: item.blueprint?.hook || `“Stop making this mistake with ${query}.”`,
              hookScore: item.blueprint?.hookScore || Math.floor(84 + Math.random() * 12),
              beats: item.blueprint?.beats || [
                { label: 'Beat 1: Pattern Interrupt', time: '0:00 - 0:03', body: 'Sudden camera punch-in calling out the common mistake.' },
                { label: 'Beat 2: The Core Fix', time: '0:03 - 0:22', body: '3 actionable steps demonstrating the right method.' },
                { label: 'Beat 3: Call to Action', time: '0:22 - 0:30', body: 'On-screen comment trigger for template download.' },
              ],
            },
          }));
        }
      }
    } catch (err) {
      console.warn('Gemini ideas generation notice: using procedural fallback generator', err);
    }
  }

  return generateProceduralIdeas(query, niche);
}

export function generateProceduralIdeas(topic?: string, niche = 'Studio & SaaS'): GeneratedIdea[] {
  const t = (topic || '').trim() || 'AI Workflows & Creator Systems';
  const cleanTopic = t.charAt(0).toUpperCase() + t.slice(1);

  return [
    {
      id: `proc-1-${Date.now()}`,
      category: 'Trending Sprint',
      categoryTone: 'tertiary',
      title: `5 ${cleanTopic} tools that actually save small businesses time`,
      excerpt: `Exposing zero-productivity gimmickry and presenting 5 grounded workflows for ${cleanTopic.toLowerCase()}.`,
      format: 'Reel · 30 sec',
      metric: 'Hook: 94%',
      thumb: 'a',
      imageId: CURATED_IMAGES[0].id,
      imageAlt: CURATED_IMAGES[0].alt,
      blueprint: {
        focus: 'Trending Focus',
        why: `Strong pain point + practical outcome for ${niche}. Directly cuts through generic industry hype with tangible proof.`,
        formats: ['Reel (30s)', 'Carousel', 'LinkedIn Post', 'YouTube Short'],
        hook: `“You’re probably wasting 3 hours every week on ${cleanTopic.toLowerCase()}. Here is what we do instead:”`,
        hookScore: 94,
        beats: [
          { label: 'Beat 1: The Trap', time: '0:00 - 0:05', body: 'Fast cut of messy manual spreadsheets with a glowing red timer overlay.' },
          { label: 'Beat 2: The 3-Step Fix', time: '0:05 - 0:23', body: 'Rapid screen recording showing 1-click automated synthesis.' },
          { label: 'Beat 3: Key Takeaway', time: '0:23 - 0:30', body: 'Founder runbook graphic on-screen with prompt to save the reel.' },
        ],
      },
    },
    {
      id: `proc-2-${Date.now()}`,
      category: 'High Potential',
      categoryTone: 'primary',
      title: `Why creators are abandoning traditional ${cleanTopic} setups`,
      excerpt: `A sharp comparison of legacy manual friction versus automated one-take video publishing pipelines.`,
      format: 'Carousel · 8 slides',
      metric: 'Viral Resonance',
      thumb: 'b',
      imageId: CURATED_IMAGES[1].id,
      imageAlt: CURATED_IMAGES[1].alt,
      blueprint: {
        focus: 'Authority Builder',
        why: 'Contrarian framing that reframes standard practices as costly liabilities — drives maximum bookmarks and shares.',
        formats: ['Carousel', 'LinkedIn Post', 'Thread', 'Reel'],
        hook: `“Your current ${cleanTopic.toLowerCase()} setup isn’t saving you money. It’s quietly costing you 11 hours a week.”`,
        hookScore: 91,
        beats: [
          { label: 'Slide 1: The Fallacy', time: '0:00 - 0:04', body: 'Visualizing standard creator burnout with bold kinetic text.' },
          { label: 'Slides 2–5: The Real Cost', time: '0:04 - 0:22', body: 'Breakdown of time lost to manual captioning and editing.' },
          { label: 'Slide 6: The Modern Solution', time: '0:22 - 0:30', body: 'One-click pipeline architecture with save CTA.' },
        ],
      },
    },
    {
      id: `proc-3-${Date.now()}`,
      category: 'Your Niche',
      categoryTone: 'secondary',
      title: `What nobody tells you about ${cleanTopic} in 2026`,
      excerpt: `The uncomfortable reality: when everyone uses identical templates, bespoke voice and raw conviction win.`,
      format: 'Reel / Short · 45 sec',
      metric: 'Direct Dialogue',
      thumb: 'c',
      imageId: CURATED_IMAGES[2].id,
      imageAlt: CURATED_IMAGES[2].alt,
      blueprint: {
        focus: 'Contrarian',
        why: 'Pattern-interrupt honesty differentiates your brand from generic cookie-cutter creators.',
        formats: ['Reel (45s)', 'Talking Head', 'Short'],
        hook: `“Everyone’s approach to ${cleanTopic.toLowerCase()} is identical right now. Let me prove it in 20 seconds.”`,
        hookScore: 93,
        beats: [
          { label: 'Beat 1: Pattern Reveal', time: '0:00 - 0:08', body: 'Side-by-side comparison of 4 generic industry posts.' },
          { label: 'Beat 2: The Antidote', time: '0:08 - 0:32', body: 'Why raw 1-take direct-to-camera arguments build 10x higher trust.' },
          { label: 'Beat 3: Community Prompt', time: '0:32 - 0:45', body: 'Ask the viewer: what does your production stack look like?' },
        ],
      },
    },
    {
      id: `proc-4-${Date.now()}`,
      category: 'Transparent Studio',
      categoryTone: 'neutral',
      title: `Behind the scenes: our real ${cleanTopic} production runbook`,
      excerpt: `A documentary-style walk through asynchronous handoffs, asset ingestion, and publication.`,
      format: 'Longform Reel · 50 sec',
      metric: 'Authority Builder',
      thumb: 'd',
      imageId: CURATED_IMAGES[3].id,
      imageAlt: CURATED_IMAGES[3].alt,
      blueprint: {
        focus: 'BTS / Documentary',
        why: 'Operational transparency is the highest-retention format for sophisticated operators and founders.',
        formats: ['Reel (50s)', 'Thread', 'Carousel'],
        hook: `“Zero live meetings. One automated pipeline. Here is the exact system that powers our ${cleanTopic.toLowerCase()}:”`,
        hookScore: 86,
        beats: [
          { label: 'Part 1: Capture', time: '0:00 - 0:12', body: 'Record raw video unpolished on phone in under 60 seconds.' },
          { label: 'Part 2: Assembly', time: '0:12 - 0:36', body: 'AI purges dead-air silences and punches dynamic zoom keyframes.' },
          { label: 'Part 3: Broadcast', time: '0:36 - 0:50', body: 'Single render syndicated to Reels, Shorts, and LinkedIn.' },
        ],
      },
    },
    {
      id: `proc-5-${Date.now()}`,
      category: 'Metric Runbook',
      categoryTone: 'primary',
      title: `The 3 metrics that actually matter for ${cleanTopic}`,
      excerpt: `Cutting through vanity analytics: audience retention quotient, bookmark velocity, and conversion rate.`,
      format: 'Reel · 40 sec',
      metric: 'Evergreen',
      thumb: 'e',
      imageId: CURATED_IMAGES[4].id,
      imageAlt: CURATED_IMAGES[4].alt,
      blueprint: {
        focus: 'Educational',
        why: 'Evergreen diagnostic utility content that compounds saves and positions you as an industry benchmark.',
        formats: ['Reel (40s)', 'Short', 'Carousel'],
        hook: `“Stop obsessing over view counts for ${cleanTopic.toLowerCase()}. Track these three numbers instead:”`,
        hookScore: 89,
        beats: [
          { label: 'Beat 1: Reframe', time: '0:00 - 0:06', body: 'Cross out follower vanity numbers on screen with a bold red slash.' },
          { label: 'Beat 2: The Core 3', time: '0:06 - 0:32', body: 'Break down retention curves, bookmark ratios, and comments.' },
          { label: 'Beat 3: Template Drop', time: '0:32 - 0:40', body: 'Comment "METRICS" to get our free diagnostic spreadsheet.' },
        ],
      },
    },
    {
      id: `proc-6-${Date.now()}`,
      category: 'Evergreen',
      categoryTone: 'neutral',
      title: `The timeless lesson about ${cleanTopic} that still wins today`,
      excerpt: `Resurfacing foundational principles that outlive algorithm shifts and short-lived growth hacks.`,
      format: 'Talking Head · 35 sec',
      metric: 'Timeless Wisdom',
      thumb: 'f',
      imageId: CURATED_IMAGES[5].id,
      imageAlt: CURATED_IMAGES[5].alt,
      blueprint: {
        focus: 'Philosophical / Evergreen',
        why: 'Timeless fundamental insight inspires deep creator loyalty and high comment discourse.',
        formats: ['Reel (35s)', 'Short', 'Post'],
        hook: `“I first learned this principle about ${cleanTopic.toLowerCase()} years ago, and it is even more true today:”`,
        hookScore: 84,
        beats: [
          { label: 'Beat 1: The Quote', time: '0:00 - 0:07', body: 'Direct eye contact opening quote that challenges standard haste.' },
          { label: 'Beat 2: The Proof', time: '0:07 - 0:26', body: 'How focusing on depth outperforms shallow volume every single time.' },
          { label: 'Beat 3: Bridge', time: '0:26 - 0:35', body: 'Invite viewers to share their biggest creator milestone.' },
        ],
      },
    },
  ];
}
