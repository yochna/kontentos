/**
 * Where a clip's bytes live, and whether they outlive this container.
 *
 * Setting MONGODB_URI makes the *records* durable. It does nothing for the footage: a clip row can
 * survive a redeploy with its captions, queue position and Studio shorts intact while the file it
 * points at is deleted with the disk it sat on. That is the difference between losing a row and
 * losing a month of work, so the answer has to be visible, not assumed.
 *
 * Two providers:
 *  - local  — <cwd>/uploads, exactly as the app has always done. No configuration. On a hosted
 *             container this directory is scratch space; on a laptop it is the creator's disk.
 *  - bucket — an S3-compatible object store (Cloudflare R2, Backblaze B2, MinIO, S3). Enabled only
 *             when every MEDIA_* key is set, so a half-configured deploy cannot report itself durable.
 *
 * The stored url shape never changes: a row keeps pointing at `/uploads/vid_x.mp4` whichever
 * provider holds the bytes, so `/uploads` is a read through this module rather than a static folder.
 */
import fs from 'fs';
import path from 'path';
import { Readable } from 'node:stream';
import type { S3Client } from '@aws-sdk/client-s3';
import { isClipFileName } from './safeId.js';

const uploadsDir = path.join(process.cwd(), 'uploads');

/** Objects sit under this prefix so one bucket can hold more than this app's clips. */
const KEY_PREFIX = 'clips/';

export type MediaProvider = 'local' | 'bucket';

function env(name: string): string {
  return (process.env[name] || '').trim();
}

export interface BucketConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/**
 * The bucket this server was told to use, or null when it was not told completely. A missing key
 * falls back to the container's disk rather than half-working, and mediaStatus() then reports the
 * truth, so a typo in the dashboard shows up as a warning banner instead of as missing files.
 */
export function bucketConfig(): BucketConfig | null {
  const endpoint = env('MEDIA_ENDPOINT');
  const bucket = env('MEDIA_BUCKET');
  const accessKeyId = env('MEDIA_ACCESS_KEY_ID');
  const secretAccessKey = env('MEDIA_SECRET_ACCESS_KEY');
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  if (!/^https?:\/\//i.test(endpoint)) return null;
  return {
    endpoint,
    region: env('MEDIA_REGION') || 'auto',
    bucket,
    accessKeyId,
    secretAccessKey,
    // R2, B2 and MinIO address buckets as /<bucket>/<key>; AWS S3 prefers the host. Guessing wrong
    // means every read 404s, so it is configurable and defaults to the form the others need.
    forcePathStyle: env('MEDIA_PATH_STYLE') ? env('MEDIA_PATH_STYLE') === 'true' : !/amazonaws\.com/i.test(endpoint),
  };
}

export function provider(): MediaProvider {
  return bucketConfig() ? 'bucket' : 'local';
}

/**
 * What the last bucket probe said, or null while nothing has asked yet. Set only by probeBucket(),
 * which runs at boot: four keys in the dashboard is a claim about intent, not about the bucket
 * accepting them, and a mistyped key otherwise reads as durable until a creator's upload fails.
 */
let bucketAnswer: { ok: boolean; reason: string } | null = null;

/**
 * Ask the bucket, with the keys exactly as configured, whether it will have us. The reason is an
 * error name (`Forbidden`, `NoSuchBucket`, `TimeoutError`) — never a key, a secret or a URL.
 */
export async function probeBucket(): Promise<{ ok: boolean; reason: string } | null> {
  const store = await bucket();
  if (!store) return null;
  try {
    await store.s3.send(
      new store.sdk.HeadBucketCommand({ Bucket: store.cfg.bucket }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
    bucketAnswer = { ok: true, reason: '' };
  } catch (err: any) {
    bucketAnswer = { ok: false, reason: probeReason(err) };
  }
  return bucketAnswer;
}

/**
 * A name the creator can act on. A bad key arrives as `Forbidden` and a wrong bucket as
 * `NoSuchBucket`, but a socket that never connected keeps Node's generic `Error` and hides the real
 * cause in `Code`, so both are read. Nothing from the error is echoed beyond the name.
 */
function probeReason(err: any): string {
  const name = String(err?.name ?? '');
  return (name && name !== 'Error' ? name : String(err?.Code ?? err?.__type ?? 'Error')).slice(0, 40);
}

/**
 * Whether bytes written here can still be read after the next redeploy — or, on the free plans,
 * after a long enough quiet period. Only an object store says yes on a hosted container, and only
 * one that has actually taken the keys.
 */
export function bytesAreDurable(): boolean {
  if (provider() === 'bucket') return bucketAnswer?.ok !== false;
  return env('RENDER') !== 'true';
}

export interface MediaStatus {
  provider: MediaProvider;
  durable: boolean;
  /** The sentence the creator reads. Never a key, a secret or a number the app did not measure. */
  note: string;
}

/** What a partial bucket configuration looked like, for the boot log only — keys are never echoed. */
export function missingBucketKeys(): string[] {
  if (bucketConfig()) return [];
  return ['MEDIA_ENDPOINT', 'MEDIA_BUCKET', 'MEDIA_ACCESS_KEY_ID', 'MEDIA_SECRET_ACCESS_KEY'].filter((k) => !env(k));
}

export function mediaStatus(): MediaStatus {
  const bucket = bucketConfig();
  if (bucket) {
    if (bucketAnswer?.ok === false) {
      // Still the bucket provider: writes really do go there and really do fail. What changes is the
      // promise — the creator must see this as unproven storage, not as a configuration success.
      return {
        provider: 'bucket',
        durable: false,
        note:
          `The “${bucket.bucket}” bucket answered with ${bucketAnswer.reason}, ` +
          'so this server cannot store clips there yet.',
      };
    }
    return {
      provider: 'bucket',
      durable: true,
      note:
        bucketAnswer === null
          ? `Clips are set to live in the “${bucket.bucket}” bucket — its keys have not answered yet.`
          : `Clips live in the “${bucket.bucket}” bucket, so a redeploy cannot delete them.`,
    };
  }
  if (env('RENDER') === 'true') {
    return {
      provider: 'local',
      durable: false,
      note:
        'Clips live on this container’s disk, which Render wipes on every redeploy and on free-tier sleep.',
    };
  }
  return {
    provider: 'local',
    durable: true,
    note: 'Clips live in this machine’s uploads folder.',
  };
}

/** The file name inside the store, from the url a row carries. Anything else is not our clip. */
export function clipFileName(fileUrl: string | undefined): string | null {
  if (!fileUrl || !fileUrl.startsWith('/uploads/')) return null;
  const fileName = path.basename(fileUrl);
  return isClipFileName(fileName) ? fileName : null;
}

export function objectKey(fileUrl: string | undefined): string | null {
  const fileName = clipFileName(fileUrl);
  return fileName ? `${KEY_PREFIX}${fileName}` : null;
}

/** The path this container would use for those bytes — also where a staged copy lands. */
export function localClipPath(fileUrl: string | undefined): string | null {
  const fileName = clipFileName(fileUrl);
  return fileName ? path.join(uploadsDir, fileName) : null;
}

let client: S3Client | null = null;

/** Built on first use: a local-only server should never pay for the SDK, and the config may land late. */
async function bucket(): Promise<{ s3: S3Client; sdk: typeof import('@aws-sdk/client-s3'); cfg: BucketConfig } | null> {
  const cfg = bucketConfig();
  if (!cfg) return null;
  const sdk = await import('@aws-sdk/client-s3');
  if (!client) {
    client = new sdk.S3Client({
      // The SDK's own region handling rejects an unset region, which R2 does not really have.
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      // A clip put computes a checksum over the whole body and sends it as `aws-chunked` framing.
      // No S3-compatible store requires that for PutObject, and hashing a 2 GB upload on a free-tier
      // tenth of a core is work this server cannot afford to do for every ingest.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return { s3: client, sdk, cfg };
}

/** Only a test swaps the store out from under a running server. */
export function resetMediaClient(): void {
  client = null;
  bucketAnswer = null;
}

export async function hasClipBytes(fileUrl: string | undefined): Promise<boolean> {
  const local = localClipPath(fileUrl);
  if (!local) return false;
  if (provider() === 'local') return fs.promises.stat(local).then((s) => s.size > 0, () => false);
  const key = objectKey(fileUrl);
  const store = await bucket();
  if (!key || !store) return false;
  try {
    const head = await store.s3.send(new store.sdk.HeadObjectCommand({ Bucket: store.cfg.bucket, Key: key }));
    return (head.ContentLength ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Bytes the server needs to read as a file (an ffmpeg encode, a caption pass) — the object store has
 * no path, so a bucket clip is pulled into the uploads folder first. Returns null when the bytes are
 * nowhere, which is the answer the routes already treat as "this clip is offline".
 */
export async function ensureLocalCopy(fileUrl: string | undefined): Promise<string | null> {
  const local = localClipPath(fileUrl);
  if (!local) return null;
  const onDisk = await fs.promises
    .stat(local)
    .then((s) => s.size > 0, () => false);
  if (onDisk) return local;
  if (provider() !== 'bucket') return null;

  const key = objectKey(fileUrl);
  const store = await bucket();
  if (!key || !store) return null;
  try {
    const got = await store.s3.send(
      new store.sdk.GetObjectCommand({ Bucket: store.cfg.bucket, Key: key })
    );
    const body = got.Body;
    if (!body) return null;
    await fs.promises.mkdir(path.dirname(local), { recursive: true });
    const stream = toNodeStream(body);
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(local);
      stream.on('error', reject);
      out.on('error', reject);
      out.on('finish', resolve);
      stream.pipe(out);
    });
    return (await fs.promises.stat(local)).size > 0 ? local : null;
  } catch {
    await fs.promises.rm(local, { force: true });
    return null;
  }
}

export interface ClipRead {
  status: number;
  headers: Record<string, string>;
  body: NodeJS.ReadableStream;
}

/**
 * The object behind a clip url, with the caller's Range header passed straight through — a <video>
 * element that cannot seek is not a player, and on a hosted container the file is not on disk to
 * serve. Returns null when there is no bucket or no object, which is how the route reaches its 404.
 * Ownership is settled by the gate in front of it, never here.
 */
export async function readBucketClip(fileUrl: string, rangeHeader?: string): Promise<ClipRead | null> {
  const key = objectKey(fileUrl);
  const store = await bucket();
  if (!key || !store) return null;
  try {
    const got = await store.s3.send(
      new store.sdk.GetObjectCommand({ Bucket: store.cfg.bucket, Key: key, Range: rangeHeader })
    );
    if (!got.Body) return null;
    const headers: Record<string, string> = { 'accept-ranges': 'bytes' };
    if (got.ContentType) headers['content-type'] = got.ContentType;
    if (got.ContentLength !== undefined) headers['content-length'] = String(got.ContentLength);
    if (got.ContentRange) headers['content-range'] = got.ContentRange;
    const body = toNodeStream(got.Body);
    return { status: rangeHeader ? 206 : 200, headers, body };
  } catch {
    return null;
  }
}

/**
 * In Node the SDK hands back an IncomingMessage, which pipes straight into the response. Buffering
 * is only reached for the web-stream shape, because holding a 2 GB clip in memory to serve it is not
 * something a free-tier container survives.
 */
function toNodeStream(body: any): NodeJS.ReadableStream {
  if (body && typeof body.pipe === 'function') return body as NodeJS.ReadableStream;
  if (body && typeof body.getReader === 'function') return Readable.fromWeb(body);
  return body;
}

/**
 * Called after a route has finished writing a clip into the uploads folder. With a bucket configured
 * the object copy replaces the local one — this container's disk is scratch, so holding a copy of
 * every clip in it is how the disk fills up. Local does nothing: the file is already in place.
 */
export async function persistClip(localPath: string, fileUrl: string): Promise<void> {
  if (provider() !== 'bucket') return;
  const key = objectKey(fileUrl);
  const store = await bucket();
  if (!key || !store) throw new Error('The media store is configured incompletely.');
  try {
    await store.s3.send(
      new store.sdk.PutObjectCommand({
        Bucket: store.cfg.bucket,
        Key: key,
        Body: fs.createReadStream(localPath),
        ContentType: contentTypeFor(localPath),
      })
    );
  } catch (err: any) {
    // Keep the local copy so the clip still plays for now; the caller reports the write as failed.
    throw new Error(`The clip could not be written to the media store: ${String(err?.message || err).slice(0, 160)}`);
  }
  await fs.promises.rm(localPath, { force: true });
}

/**
 * Drop the object behind a clip. The caller has usually already removed the local copy — this is the
 * half a delete needs when the bytes are in a bucket, and a failed delete there costs storage, not
 * correctness: the row and its url are gone either way.
 */
export async function removeBucketClip(fileUrl: string | undefined): Promise<void> {
  if (provider() !== 'bucket') return;
  const key = objectKey(fileUrl);
  const store = await bucket();
  if (!key || !store) return;
  try {
    await store.s3.send(new store.sdk.DeleteObjectCommand({ Bucket: store.cfg.bucket, Key: key }));
  } catch (err: any) {
    console.warn('Could not remove the stored clip object:', String(err?.message || err).slice(0, 160));
  }
}

function contentTypeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.m4v') return 'video/x-m4v';
  if (ext === '.mkv') return 'video/x-matroska';
  return 'video/mp4';
}
