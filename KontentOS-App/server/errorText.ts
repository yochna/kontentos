/**
 * What a failed request is allowed to say out loud.
 *
 * A driver or engine error can carry a host name, a database namespace, a fragment of a
 * connection string, or a file path with a stack frame in it. None of that helps the creator reading
 * the message, and all of it helps somebody probing the deployment. So the original goes to the
 * server log, and the browser gets text we wrote — unless the message is plainly one of ours.
 */

/** Anything that looks like infrastructure talking, rather than a sentence written for a creator. */
const INFRASTRUCTURE_TEXT =
  /mongodb|mongoose|atlas|nodelib|internal server error|error \d{3}|ECONN|ENOTFOUND|ETIMEDOUT|EPERM|EACCES|getaddrinfo|authentication failed|command find\b|writeconcern|readpref|\buri\b|\bhttp[s]?:\/\/|file:\/{2,}|[\\/]\.data[\\/]|\.ts:\d+|\.js:\d+|stack|trace|\bSELECT\b|\bINSERT INTO\b|\btoken\b|\bsecret\b|\bpassword\b|Authorization/i;

const MAX_SAFE_LENGTH = 240;

/**
 * The message to put in the response body.
 * `fallback` is the creator-facing sentence the route already had; it is what ships whenever the
 * thrown text looks like a machine talking. What was suppressed stays in the server log, so the
 * real failure is still findable.
 */
export function safeMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  if (!oneLine) return fallback;
  if (oneLine.length > MAX_SAFE_LENGTH || INFRASTRUCTURE_TEXT.test(oneLine)) {
    console.warn('[KontentOS] kept a technical error out of the response:', oneLine.slice(0, 300));
    return fallback;
  }
  return oneLine;
}
