// What a speech model hands back when it has nothing to transcribe is not the creator's voice, and
// storing it would put invented words on a real clip. This is the one place that decides whether
// text coming out of an engine may be treated as something somebody actually said.

const ENGINE_JOB_TALK =
  /\bno (speech|audio|dialogue|audible|spoken)\b|\bnothing (was )?(said|heard)\b|\bunable to (hear|transcribe|process)\b|\bcould not (hear|transcribe|find)\b|\bi can'?t (hear|transcribe)\b|\bit appears (to be|silent)\b|\bthe (file|video|audio) (is|appears) (silent|empty|corrupted)\b/i;

/**
 * True for text a creator might have spoken on camera. False for an empty JSON envelope, a model
 * apologising about the job, or the cue scaffold echoed straight back from the prompt.
 */
export function isSpokenTextUsable(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const text = raw.trim();
  if (text.length < 2) return false;
  if (text.startsWith('{') || text.startsWith('[')) return false;
  if (/["\[]transcript["\]]|"segments"\s*:/.test(text)) return false;
  if (ENGINE_JOB_TALK.test(text)) return false;
  // Every cue of the scaffold is bracketed; a real transcript is not a list of blanks.
  if (/^\[.*\]$/.test(text)) return false;
  return true;
}

/**
 * An engine that found no speech still answers — with the empty envelope the prompt asked for.
 * That is a real answer ("nothing was said") and must not fall through to the raw-text branch,
 * which would store `{"transcript": ""}` as the creator's words.
 */
export function isEmptySpeechEnvelope(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const p = parsed as Record<string, unknown>;
  const looksLikeASpeechAnswer = 'transcript' in p || 'srt' in p || 'segments' in p;
  if (!looksLikeASpeechAnswer) return false;
  const transcript = typeof p.transcript === 'string' ? p.transcript.trim() : '';
  const srt = typeof p.srt === 'string' ? p.srt.trim() : '';
  const segments = Array.isArray(p.segments) ? p.segments.filter((s: any) => String(s?.text || '').trim()) : [];
  return !transcript && !srt && segments.length === 0;
}
