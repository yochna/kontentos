/**
 * Source bytes are owned by the browser for the length of a render. Validate the response before
 * allocating its body: a failed proxy request can answer 200 with an SVG error page, and a huge
 * file can exhaust a tab long before FFmpeg gets a chance to explain the problem.
 */

const NON_MEDIA_TYPES = new Set([
  'application/json',
  'application/xml',
  'text/html',
  'text/plain',
  'image/svg+xml',
]);

export function isRejectedMediaContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false; // Some local servers omit it; let FFmpeg decide from the bytes.
  const type = contentType.split(';')[0].trim().toLowerCase();
  if (NON_MEDIA_TYPES.has(type)) return true;
  return type.startsWith('text/') && type !== 'text/vtt';
}

export function declaredBytesExceed(contentLength: string | null | undefined, maxBytes: number): boolean {
  if (!contentLength) return false;
  const declared = Number(contentLength);
  return Number.isFinite(declared) && declared > maxBytes;
}

export function sizeLimitMessage(bytes: number, maxBytes: number, label: string): string {
  return `${label} is ${Math.round(bytes / (1024 * 1024))} MB — browser rendering can hold at most ${Math.round(maxBytes / (1024 * 1024))} MB.`;
}

export function isAbortFailure(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Reads with a hard byte ceiling, so an oversized or mislabelled response cannot fill memory. */
export async function readBoundedResponse(
  response: Response,
  maxBytes: number,
  label: string,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  if (isRejectedMediaContentType(response.headers.get('content-type'))) {
    throw new Error(`${label} came back as a page rather than video. The source could not be rendered.`);
  }
  if (declaredBytesExceed(response.headers.get('content-length'), maxBytes)) {
    const declared = Number(response.headers.get('content-length'));
    throw new Error(sizeLimitMessage(declared, maxBytes, label));
  }

  if (!response.body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error(sizeLimitMessage(buffer.byteLength, maxBytes, label));
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('The render was cancelled.', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(sizeLimitMessage(total, maxBytes, label));
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined.buffer;
}
