/**
 * Ids are text, never query objects.
 *
 * A request body can carry `{"videoId":{"$ne":null}}`. Passed straight into a Mongo filter that
 * becomes an operator query, and a find keyed on `video_id` alone then answers with somebody
 * else's document. Every identifier that arrives from a client is run through here at the
 * storage layer, so a future route cannot reintroduce the hole by forgetting to coerce.
 */
export const ID_MAX_LENGTH = 200;

/** The id as a string, or '' when it is not text — which every lookup below treats as "not found". */
export function asId(value: unknown): string {
  return typeof value === 'string' && value.length <= ID_MAX_LENGTH ? value.trim() : '';
}

/**
 * Whether a client-supplied blob is safe to store as a nested document.
 *
 * A key beginning with `$` or containing a `.` is read as an operator or a path by MongoDB, so a
 * saved idea carrying one could rewrite the query that stores it. Values are limited to what JSON
 * can actually round-trip.
 */
export function isPlainJson(value: unknown, depth = 0): boolean {
  if (depth > 6) return false;
  if (value === null) return true;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return true;
  if (type !== 'object') return false;
  if (Array.isArray(value)) return value.every((item) => isPlainJson(item, depth + 1));
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith('$') || key.includes('.')) return false;
    if (!isPlainJson(item, depth + 1)) return false;
  }
  return true;
}

/**
 * One path segment, a clip id this app minted, and a video extension. It cannot match a nested
 * path, the `.chunks` scratch folder or anything with traversal in it, so a name that fails it never
 * reaches the disk or a bucket key. The /uploads gate and the media store both read it from here.
 */
const CLIP_FILE = /^vid_[A-Za-z0-9_-]{6,}\.(mp4|mov|webm|m4v|mkv)$/i;

export function isClipFileName(fileName: unknown): boolean {
  return typeof fileName === 'string' && CLIP_FILE.test(fileName);
}
