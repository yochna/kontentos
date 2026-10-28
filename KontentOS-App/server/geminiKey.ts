/**
 * Single place that decides which Gemini API key the server may use.
 *
 * Rules:
 *  - Keys come ONLY from the environment (GEMINI_API_KEY) or from a key the
 *    caller supplies for that one request.
 *  - There is NO built-in fallback key. If nothing valid is found we return
 *    null/'' and each route falls back to its offline/procedural behaviour.
 *  - VITE_* variables are never read: Vite bakes them into the browser bundle.
 */
export function isValidGeminiKey(k: unknown): k is string {
  return (
    typeof k === 'string' &&
    k.trim().length > 20 &&
    !k.includes('TESTINGKEY') &&
    !k.includes('your_') &&
    !k.includes('TODO')
  );
}

/** The server-side key from the environment, or null when not configured. */
export function envGeminiKey(): string | null {
  const k = process.env.GEMINI_API_KEY;
  return isValidGeminiKey(k) ? k.trim() : null;
}
