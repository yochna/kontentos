/**
 * Plumbing shared by every copy engine on the server (captions, scripts, seeds, subtitle translation)
 * so they cannot disagree about how long one attempt gets or what counts as a readable answer.
 */

/**
 * One attempt at one engine. Without a ceiling a model Google is shedding load for can hold a
 * creator's click for minutes; 15s is long enough to catch a slow answer and short enough that the
 * next candidate still runs inside the spinner's patience.
 */
export function engineTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMsg)), ms)
    ),
  ]);
}

/**
 * Engines occasionally fence the JSON or trail a stray sentence after it, and a rejected JSON.parse
 * throws the whole answer away — the station falls back to a local template and the creator sees
 * generic copy from a request that actually worked. Take the first balanced value instead.
 */
export function readEngineJson<T = any>(text: string): T | null {
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  const open = text[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
