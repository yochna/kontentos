/**
 * Response headers: what a browser is allowed to do with a KontentOS page.
 *
 * helmet supplies the defaults; the directives below are the parts only this app can answer for —
 * the fonts it loads, the workers it builds, the WASM engines it runs, and the clips it streams.
 */
import helmet from 'helmet';

// helmet keeps its per-option types internal, so they are read off the factory's own signature.
type CspOptions = Exclude<
  NonNullable<Parameters<typeof helmet>[0]>['contentSecurityPolicy'],
  false | true | undefined | null
>;

/**
 * The hosts a creator's browser actually talks to.
 *
 * - unpkg.com: the ffmpeg core the export worker falls back to when it is not bundled locally.
 * - huggingface.co: the Whisper weights the transcription worker pulls on first use.
 * - images.unsplash.com / images.pexels.com: stock frames shown in the picker.
 * - blob: / data:: workers built from the page, canvases turned into downloads, proxied thumbnails.
 */
export function cspOptions(): CspOptions {
  const directives: CspOptions['directives'] = {
    defaultSrc: ["'self'"],
    // 'wasm-unsafe-eval' lets the ffmpeg and Whisper workers run without opening eval to anything else.
    scriptSrc: ["'self'", "'wasm-unsafe-eval'", 'blob:', 'https://unpkg.com'],
    workerSrc: ["'self'", 'blob:'],
    // A style attribute is how React writes one; the Google Fonts sheet is a plain <link>, so only
    // that host is trusted rather than any style a page might be tricked into accepting.
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com', 'https://images.pexels.com'],
    mediaSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com', 'https://videos.pexels.com'],
    connectSrc: [
      "'self'",
      'blob:',
      'data:',
      'https://unpkg.com',
      'https://huggingface.co',
      'https://*.huggingface.co',
      'https://cdn-lfs.hf.co',
      'https://*.cdn-lfs.hf.co',
      'https://unsplash.com',
    ],
    objectSrc: ["'none'"],
    // Nothing embeds KontentOS in a frame, so nothing can click through one on somebody's behalf.
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    // The live app is https-only; this stops a typed http:// address from ever loading a page that
    // could be stripped of its headers. Harmless on localhost, which never sends the header anyway.
    upgradeInsecureRequests: [],
  };

  return { useDefaults: true, directives };
}

/** Private answers — transcripts, captions, the schedule — must not be cached or reused. */
export function noStoreApi(
  req: { method?: string },
  res: { setHeader: (name: string, value: string) => void },
  next: () => void
): void {
  if (req.method === 'GET') res.setHeader('Cache-Control', 'no-store');
  next();
}
