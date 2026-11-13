/**
 * The Press: one button that comes out with a reel, a carousel deck and caption files.
 *
 * Every piece of it already existed behind its own screen — intake, then the transcript, then the
 * Studio's short, then the cut, then the Card station. This file is the single place that says what
 * a press *is*: the styles a creator can pick, and the shape the server reports back. It lives on
 * this side because the bench renders the cards and the server has to honour the same numbers — a
 * second copy of the table is how a style that promises 40–70s ends up cutting 18s.
 *
 * Nothing here is decoration. Each field is read by server/routes/press.ts: the span bounds decide
 * which moment is cut, `slides` sizes the deck, and `tone` is the register the copy is written in.
 */

export type PressStyleId = 'hook' | 'story' | 'explainer';

export interface PressStyle {
  id: PressStyleId;
  /** The name on the card. */
  label: string;
  icon: string;
  /** What this style does to the cut, in the creator's terms. */
  note: string;
  /** The moment the press looks for, in seconds. Bounded well under the server's encode ceiling. */
  minSeconds: number;
  maxSeconds: number;
  /** Slides in the carousel deck cut from the same span. */
  slides: number;
  /** The register handed to the copy engine — the same wording the style presets use. */
  tone: string;
}

export const PRESS_STYLES: PressStyle[] = [
  {
    id: 'hook',
    label: 'Tight hook',
    icon: 'bolt',
    note: 'The shortest complete thought in the take, in and out before the scroll moves.',
    minSeconds: 18,
    maxSeconds: 34,
    slides: 4,
    tone: 'Viral & Punchy',
  },
  {
    id: 'explainer',
    label: 'Explainer',
    icon: 'list_alt',
    note: 'One idea stepped out, so the same words carry the reel and the cards.',
    minSeconds: 30,
    maxSeconds: 52,
    slides: 6,
    tone: 'Helpful & Clear',
  },
  {
    id: 'story',
    label: 'Story arc',
    icon: 'auto_stories',
    note: 'Claim, proof, turn — a longer span with room for the story to land.',
    minSeconds: 45,
    maxSeconds: 70,
    slides: 5,
    tone: 'Cinematic & Premium',
  },
];

/** Only a style the table knows is ever used; anything else arrives as null and gets refused. */
export function pressStyle(id: unknown): PressStyle | null {
  const wanted = typeof id === 'string' ? id : '';
  return PRESS_STYLES.find((style) => style.id === wanted) ?? null;
}

export type PressStepId = 'reel' | 'captions' | 'deck' | 'copy';

export type PressStepState = 'waiting' | 'running' | 'done' | 'failed';

export interface PressStep {
  id: PressStepId;
  label: string;
  state: PressStepState;
  /** What the step is doing, or what it said when it stopped. Never a bare status word. */
  detail: string;
}

export interface PressSlide {
  id: number;
  headline: string;
  supportingText: string;
}

export interface PressDeck {
  slides: PressSlide[];
  socialCaption: string;
  /** The engine that wrote the deck, printed so the panel cannot claim an answer it did not get. */
  modelUsed: string;
}

/** Everything one press produced, in the order a creator reaches for it. */
export interface PressBundle {
  clipVideoId: string;
  fileUrl: string;
  /** The shape the reel was encoded into — always vertical, whatever the take came in as. */
  aspectRatio: string;
  duration: number;
  bytes: number;
  span: { start: number; end: number };
  title: string;
  hook: string;
  caption: string;
  srt: string;
  vtt: string;
  deck: PressDeck | null;
  engineModel: string;
  engineSource: 'engine' | 'local';
}

/**
 * What the press decided to cut, handed to the tab that has to encode it.
 *
 * The reel is rendered in the browser rather than on the server, so the job has to carry the source
 * the browser will read and the span it will read from. Everything here came off the creator's own
 * record — a browser cut that guesses a file size or a shape gets it from the vault, not from us.
 */
export interface PressPlan {
  span: { start: number; end: number };
  /** Seconds the browser has to encode: the span, shortened to the film that actually exists. */
  duration: number;
  /** The shape the reel is encoded into. */
  targetAspect: '9:16';
  source: {
    videoId: string;
    fileUrl: string;
    fileSize: number;
    duration: number;
    aspectRatio?: string;
  };
  /** Set when the span had to be shortened because the recording runs out before the style does. */
  shortened: boolean;
}

export interface PressJob {
  id: string;
  userId: string;
  styleId: PressStyleId;
  sourceVideoId: string;
  sourceTitle: string;
  createdAt: string;
  updatedAt: string;
  status: 'running' | 'complete' | 'failed';
  steps: PressStep[];
  plan: PressPlan;
  bundle: PressBundle | null;
  /** The reason the press stopped, when `status` is 'failed'. */
  error: string;
}

/** The steps every press runs, in the order the station shows them. */
export function pressSteps(): PressStep[] {
  return [
    { id: 'reel', label: 'Reel', state: 'waiting', detail: 'Not started' },
    { id: 'captions', label: 'Caption files', state: 'waiting', detail: 'Not started' },
    { id: 'deck', label: 'Carousel deck', state: 'waiting', detail: 'Not started' },
    { id: 'copy', label: 'Post copy', state: 'waiting', detail: 'Not started' },
  ];
}

/** Timecode as the station prints it: 1:07, not 67. */
export function pressTimecode(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export interface HighlightRun {
  text: string;
  /** True for the words the model wrapped in [square brackets] — the ones a card lights up. */
  hot: boolean;
}

/**
 * The deck prompt asks the engine to wrap one to three words per slide in [square brackets] so the
 * card can light them. A renderer that prints the string as-is shows the brackets themselves on the
 * card and in the exported PNG/PDF, so every surface that draws deck copy goes through here.
 *
 * Unbalanced or empty brackets are left as ordinary text: a stray "[" is the engine's mistake, not
 * an instruction, and dropping it would change what the creator's words say.
 */
export function splitHighlights(text: string): HighlightRun[] {
  const runs: HighlightRun[] = [];
  const marker = /\[([^\[\]]+)\]/g;
  let last = 0;
  for (let hit = marker.exec(text); hit; hit = marker.exec(text)) {
    if (hit.index > last) runs.push({ text: text.slice(last, hit.index), hot: false });
    runs.push({ text: hit[1], hot: true });
    last = hit.index + hit[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), hot: false });
  return runs;
}

/** The same copy with the markers taken out, for plain-text surfaces: files, the fallback view, a clipboard. */
export function plainHighlights(text: string): string {
  return splitHighlights(text)
    .map((run) => run.text)
    .join('');
}
