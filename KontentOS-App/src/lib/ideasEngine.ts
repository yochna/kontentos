import type { Idea } from '@/data/mock';

// What the Ideas station offers when no model answered: structures worth filling, not copy. No hook
// is written for the creator, no audience number is claimed, and nothing here has been scored — the
// brackets are the deliverable.

const CURATED_IMAGES = [
  { id: 'eGGFZ5X2LnA', alt: 'Macro of an AI processor chip on a circuit board' },
  { id: 'Wpnoqo2plFA', alt: 'Close-up of a spreadsheet full of figures on a screen' },
  { id: 'DqmXihYx5UE', alt: 'Videographer operating a cinema camera on a film set' },
  { id: 'qC2n6RQU4Vw', alt: 'Design team collaborating over wireframe sketches and sticky notes' },
  { id: 'qwtCeJ5cLYs', alt: 'Analytics dashboard showing CTR, cost-per-conversion and quality-score metrics' },
  { id: '1tCQcTjLoRQ', alt: 'Vintage handwritten journal with an old photograph and pressed flowers' },
];

const SCAFFOLD = 'Scaffold · fill the brackets';

export function generateScaffoldIdeas(topic?: string, niche?: string): Idea[] {
  const t = (topic || '').trim() || (niche || '').trim() || 'your topic';
  const cleanTopic = t.charAt(0).toUpperCase() + t.slice(1);
  const lower = t.toLowerCase();
  const stamp = Date.now();

  const cards: Omit<Idea, 'id'>[] = [
    {
      category: 'Trending Sprint',
      categoryTone: 'tertiary',
      title: `[number] ${cleanTopic} tools you actually use — and what each one replaced`,
      excerpt: `Name the ${lower} tools you personally reach for, then say the chore each one took off your plate.`,
      format: 'Reel · 30 sec',
      metric: SCAFFOLD,
      thumb: 'a',
      imageId: CURATED_IMAGES[0].id,
      imageAlt: CURATED_IMAGES[0].alt,
      blueprint: {
        focus: 'Trending Focus',
        why: 'A list is only worth reading when it is limited to what the writer actually uses. The shape holds; which items belong in it is yours to decide.',
        formats: ['Reel (30s)', 'Carousel', 'LinkedIn Post', 'YouTube Short'],
        hook: `“[${lower} chore you still did by hand, in one plain sentence]”`,
        hookScore: 0,
        beats: [
          { label: 'Beat 1: The chore', time: '0:00 - 0:05', body: '[show the manual version of the task, unedited]' },
          { label: 'Beat 2: The switch', time: '0:05 - 0:23', body: '[one screen recording per tool — what you click, what comes out]' },
          { label: 'Beat 3: The trade-off', time: '0:23 - 0:30', body: '[what the tool still gets wrong — the line that makes the rest believable]' },
        ],
      },
    },
    {
      category: 'High Potential',
      categoryTone: 'primary',
      title: `Why you moved off your old ${lower} setup`,
      excerpt: 'A before-and-after built on one decision you made and the cost that forced it.',
      format: 'Carousel · 8 slides',
      metric: SCAFFOLD,
      thumb: 'b',
      imageId: CURATED_IMAGES[1].id,
      imageAlt: CURATED_IMAGES[1].alt,
      blueprint: {
        focus: 'Authority Builder',
        why: 'Contrarian frames only hold up when the writer can produce their own receipts. If you cannot, this is not your card yet.',
        formats: ['Carousel', 'LinkedIn Post', 'Thread', 'Reel'],
        hook: `“[the thing you used to defend about your ${lower} setup, and the day you stopped]”`,
        hookScore: 0,
        beats: [
          { label: 'Slide 1: The claim you dropped', time: '—', body: '[state it in your own words, without building a strawman]' },
          { label: 'Slides 2–5: The cost', time: '—', body: '[one cost per slide — only ones you measured or felt]' },
          { label: 'Slide 6: What replaced it', time: '—', body: '[the setup now, including what it still costs you]' },
        ],
      },
    },
    {
      category: 'Your Niche',
      categoryTone: 'secondary',
      title: `What nobody says out loud about ${lower}`,
      excerpt: 'One true observation about your corner of the work that the generic advice skips.',
      format: 'Reel / Short · 45 sec',
      metric: SCAFFOLD,
      thumb: 'c',
      imageId: CURATED_IMAGES[2].id,
      imageAlt: CURATED_IMAGES[2].alt,
      blueprint: {
        focus: 'Contrarian',
        why: 'Plain-spoken honesty separates a practitioner from a template, but only when the observation is specific to what you have seen.',
        formats: ['Reel (45s)', 'Talking Head', 'Short'],
        hook: `“[the sentence a peer would wince at because it is true about ${lower}]”`,
        hookScore: 0,
        beats: [
          { label: 'Beat 1: The pattern', time: '0:00 - 0:08', body: `[the advice everyone in ${lower} repeats — quoted exactly]` },
          { label: 'Beat 2: Your version', time: '0:08 - 0:32', body: '[what you do instead, and the one time it did not work]' },
          { label: 'Beat 3: Ask the room', time: '0:32 - 0:45', body: '[a question only someone doing this work could answer]' },
        ],
      },
    },
    {
      category: 'Transparent Studio',
      categoryTone: 'neutral',
      title: `Your real ${lower} production runbook, start to finish`,
      excerpt: 'Document one actual pass of your workflow — capture, assembly, publication — without polishing it.',
      format: 'Longform Reel · 50 sec',
      metric: SCAFFOLD,
      thumb: 'd',
      imageId: CURATED_IMAGES[3].id,
      imageAlt: CURATED_IMAGES[3].alt,
      blueprint: {
        focus: 'BTS / Documentary',
        why: 'Process footage is the clearest proof that the advice came from doing the work rather than reading about it.',
        formats: ['Reel (50s)', 'Thread', 'Carousel'],
        hook: `“[the first honest line about how your ${lower} work actually starts]”`,
        hookScore: 0,
        beats: [
          { label: 'Part 1: Capture', time: '0:00 - 0:12', body: '[the raw take as it happens, retakes included]' },
          { label: 'Part 2: Assembly', time: '0:12 - 0:36', body: '[the edits you make by hand and the ones you hand to a tool]' },
          { label: 'Part 3: Broadcast', time: '0:36 - 0:50', body: '[where it goes, when, and who copies it out]' },
        ],
      },
    },
    {
      category: 'Metric Runbook',
      categoryTone: 'primary',
      title: `The [number] numbers you actually watch for ${lower}`,
      excerpt: 'Show the dashboard you read and say which two numbers you stopped caring about.',
      format: 'Reel · 40 sec',
      metric: SCAFFOLD,
      thumb: 'e',
      imageId: CURATED_IMAGES[4].id,
      imageAlt: CURATED_IMAGES[4].alt,
      blueprint: {
        focus: 'Educational',
        why: 'Measurement opinions are only useful when tied to a real account. Use your own numbers, or show the blank dashboard and say why.',
        formats: ['Reel (40s)', 'Short', 'Carousel'],
        hook: `“[the metric you used to chase and what you watch now instead]”`,
        hookScore: 0,
        beats: [
          { label: 'Beat 1: The one you dropped', time: '0:00 - 0:06', body: '[name it and the week you stopped reporting it]' },
          { label: 'Beat 2: The ones you kept', time: '0:06 - 0:32', body: '[each number, where it comes from, what you changed because of it]' },
          { label: 'Beat 3: The caveat', time: '0:32 - 0:40', body: '[what these numbers still do not tell you]' },
        ],
      },
    },
    {
      category: 'Evergreen',
      categoryTone: 'neutral',
      title: `The ${lower} lesson that outlasted the trend cycle`,
      excerpt: 'One principle you learned the hard way, told through the specific time you learned it.',
      format: 'Talking Head · 35 sec',
      metric: SCAFFOLD,
      thumb: 'f',
      imageId: CURATED_IMAGES[5].id,
      imageAlt: CURATED_IMAGES[5].alt,
      blueprint: {
        focus: 'Philosophical / Evergreen',
        why: 'Reflection holds attention when it is anchored to a scene the teller was actually in; generalities read as filler.',
        formats: ['Reel (35s)', 'Short', 'Post'],
        hook: `“[the moment ${lower} taught you this — when, where, what you had just done]”`,
        hookScore: 0,
        beats: [
          { label: 'Beat 1: The scene', time: '0:00 - 0:07', body: '[set the one event before framing it]' },
          { label: 'Beat 2: The turn', time: '0:07 - 0:26', body: '[what you changed afterward and what it cost]' },
          { label: 'Beat 3: The hand-off', time: '0:26 - 0:35', body: '[the question you would ask someone standing where you were]' },
        ],
      },
    },
  ];

  return cards.map((c, i) => ({ ...c, id: `scaffold-${i + 1}-${stamp}` }));
}
