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
import * as mediaStore from './mediaStore.js';
import { isClipFileName } from './safeId.js';
import { safeMessage } from './errorText.js';

const OWNER_CACHE_MS = 60 * 1000;
const MAX_OWNER_ENTRIES = 1000;

/** '' means no row claims the file. Denied answers are cached too, so probing stays cheap. */
const owners = new Map<string, { userId: string; expiresAt: number }>();

export function clipIdForFile(fileName: string): string | null {
  if (!isClipFileName(fileName)) return null;
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

/**
 * Runs after express.static has handed the request on, which means the file is not on this disk.
 * With a bucket configured that is normal — the object is the clip, and the container was redeployed
 * — so the bytes are streamed from the store with the caller's Range header passed through, because
 * a <video> element that cannot seek is not a player. With no bucket there is nowhere else to look,
 * and the answer stays the same 404 the gate gives for any clip this account cannot read.
 */
export function bucketMediaFallback(req: Request, res: Response) {
  void (async () => {
    const fileUrl = `/uploads/${decodeURIComponent((req.path || '').replace(/^\/+/, ''))}`;
    const read = await mediaStore.readBucketClip(fileUrl, req.headers.range);
    if (!read) {
      return res.status(404).json({ error: 'No clip by that name is on your account.' });
    }
    res.status(read.status);
    for (const [key, value] of Object.entries(read.headers)) res.setHeader(key, value);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    read.body.on('error', () => res.destroy());
    read.body.pipe(res);
  })().catch(() => {
    if (res.headersSent) return res.destroy();
    res.status(503).json({ error: 'Media storage is unavailable.' });
  });
}
