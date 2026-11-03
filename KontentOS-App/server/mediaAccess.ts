/**
 * Uploaded clips: which file may reach which creator.
 *
 * /uploads stopped at "are you signed in", so any creator who learned another's filename could
 * stream their footage. The filename is the clip id, so the row answers who owns it and nobody else
 * gets the bytes.
 *
 * The answer is held for a minute for the same reason the session is: a scrubbing <video> element
 * fires a range request per seek, and on the JSON fallback every one of them would re-read and
 * re-parse the whole database. A clip deleted inside that window is gone from the disk anyway, so
 * the worst the cache can do is answer 404 a little later than it could have.
 */
import type { NextFunction, Request, Response } from 'express';
import * as db from './db.js';
import { safeMessage } from './errorText.js';

/**
 * One path segment, a clip id this app minted, and a video extension. It cannot match a nested
 * path, the .chunks scratch folder, or anything with traversal in it, so a request that fails it
 * never reaches the disk.
 */
const CLIP_FILE = /^vid_[A-Za-z0-9_-]{6,}\.(mp4|mov|webm|m4v|mkv)$/i;

const OWNER_CACHE_MS = 60 * 1000;
const MAX_OWNER_ENTRIES = 1000;

/** '' means no row claims the file. Denied answers are cached too, so probing stays cheap. */
const owners = new Map<string, { userId: string; expiresAt: number }>();

export function clipIdForFile(fileName: string): string | null {
  if (!CLIP_FILE.test(fileName)) return null;
  return fileName.slice(0, fileName.lastIndexOf('.'));
}

export async function mayReadClipFile(fileName: string, userId: string): Promise<boolean> {
  const clipId = clipIdForFile(fileName);
  if (!clipId || !userId) return false;

  const hit = owners.get(fileName);
  if (hit && hit.expiresAt > Date.now()) return hit.userId === userId;

  const owner = await db.ownerOfClipFile(clipId);
  if (owners.size >= MAX_OWNER_ENTRIES) {
    const oldest = owners.keys().next().value;
    if (oldest) owners.delete(oldest);
  }
  owners.set(fileName, { userId: owner, expiresAt: Date.now() + OWNER_CACHE_MS });
  return !!owner && owner === userId;
}

/**
 * Sits between requireUser and express.static. Somebody else's clip and a file that never existed
 * answer the same way, so the route cannot be used to list the ids on the account next door.
 */
export function uploadAccessGate(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    let fileName: string;
    try {
      fileName = decodeURIComponent((req.path || '').replace(/^\/+/, ''));
    } catch {
      return res.status(400).json({ error: 'That is not a clip path.' });
    }
    try {
      if (await mayReadClipFile(fileName, req.userId)) return next();
      return res.status(404).json({ error: 'No clip by that name is on your account.' });
    } catch (err: any) {
      return res.status(503).json({ error: safeMessage(err, 'Storage is unavailable.') });
    }
  })();
}
