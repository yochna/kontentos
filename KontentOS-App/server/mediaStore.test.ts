import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bucketConfig,
  bytesAreDurable,
  ensureLocalCopy,
  hasClipBytes,
  localClipPath,
  mediaStatus,
  missingBucketKeys,
  objectKey,
  persistClip,
  probeBucket,
  provider,
  readBucketClip,
  removeBucketClip,
  resetMediaClient,
} from './mediaStore.js';

/**
 * The environment decides everything this module does, so each case sets its own and puts the real
 * one back. A thrown expectation still restores, because a later file must not inherit a fake bucket.
 */
const SAVED: Record<string, string | undefined> = {
  RENDER: process.env.RENDER,
  MEDIA_ENDPOINT: process.env.MEDIA_ENDPOINT,
  MEDIA_BUCKET: process.env.MEDIA_BUCKET,
  MEDIA_REGION: process.env.MEDIA_REGION,
  MEDIA_ACCESS_KEY_ID: process.env.MEDIA_ACCESS_KEY_ID,
  MEDIA_SECRET_ACCESS_KEY: process.env.MEDIA_SECRET_ACCESS_KEY,
  MEDIA_PATH_STYLE: process.env.MEDIA_PATH_STYLE,
};

/** Every MEDIA_* key gone, which is what "this server keeps its clips on the disk" means. */
const NO_BUCKET = {
  MEDIA_ENDPOINT: undefined,
  MEDIA_BUCKET: undefined,
  MEDIA_REGION: undefined,
  MEDIA_ACCESS_KEY_ID: undefined,
  MEDIA_SECRET_ACCESS_KEY: undefined,
  MEDIA_PATH_STYLE: undefined,
};

const COMPLETE = {
  MEDIA_ENDPOINT: 'https://abc123.r2.cloudflarestorage.com',
  MEDIA_BUCKET: 'kontentos-clips',
  MEDIA_ACCESS_KEY_ID: 'a-key-id',
  MEDIA_SECRET_ACCESS_KEY: 'a-secret',
};

async function withEnv(values: Record<string, string | undefined>, run: () => void | Promise<void>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetMediaClient();
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(SAVED)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetMediaClient();
  }
}

describe('what a server was told about its media', () => {
  it('counts as a bucket only when the whole configuration is there', async () => {
    await withEnv({ ...COMPLETE, RENDER: undefined }, () => {
      expect(provider()).toBe('bucket');
      expect(bucketConfig()?.bucket).toBe('kontentos-clips');
    });
    for (const dropped of Object.keys(COMPLETE)) {
      await withEnv({ ...COMPLETE, [dropped]: undefined, RENDER: undefined }, () => {
        expect(provider()).toBe('local');
        expect(missingBucketKeys()).toEqual([dropped]);
      });
    }
  });

  it('refuses an endpoint that is not a url rather than signing requests to a stray string', async () => {
    await withEnv({ ...COMPLETE, MEDIA_ENDPOINT: 'abc123.r2.cloudflarestorage.com', RENDER: undefined }, () => {
      expect(provider()).toBe('local');
    });
  });

  it('uses path-style addressing everywhere except real S3', async () => {
    await withEnv({ ...COMPLETE, RENDER: undefined }, () => {
      expect(bucketConfig()?.forcePathStyle).toBe(true);
    });
    await withEnv({ ...COMPLETE, MEDIA_ENDPOINT: 'https://s3.us-east-1.amazonaws.com', RENDER: undefined }, () => {
      expect(bucketConfig()?.forcePathStyle).toBe(false);
    });
    await withEnv({ ...COMPLETE, MEDIA_PATH_STYLE: 'false', RENDER: undefined }, () => {
      expect(bucketConfig()?.forcePathStyle).toBe(false);
    });
  });
});

describe('whether the bytes outlive the container', () => {
  it('says a hosted container with only a disk is not durable', async () => {
    await withEnv({ ...NO_BUCKET, RENDER: 'true' }, () => expect(bytesAreDurable()).toBe(false));
    // A bucket is the way out, and it stays the way out on the same hosted container.
    await withEnv({ ...COMPLETE, RENDER: 'true' }, () => expect(bytesAreDurable()).toBe(true));
    // On a laptop the uploads folder is the creator's own disk, so nothing is about to be wiped.
    await withEnv({ ...NO_BUCKET, RENDER: undefined }, () => expect(bytesAreDurable()).toBe(true));
  });

  it('names the store in the sentence and never repeats a key', async () => {
    await withEnv({ ...COMPLETE, RENDER: undefined }, () => {
      const status = mediaStatus();
      expect(status).toMatchObject({ provider: 'bucket', durable: true });
      expect(status.note).toContain('kontentos-clips');
      expect(status.note).not.toContain('a-secret');
      expect(status.note).not.toContain('a-key-id');
    });

    await withEnv({ ...NO_BUCKET, RENDER: 'true' }, () => {
      const status = mediaStatus();
      expect(status.provider).toBe('local');
      expect(status.durable).toBe(false);
      expect(status.note).toMatch(/wipes|wiped/i);
    });
  });
});

/**
 * A bucket is only a promise until it answers. These cases use an endpoint that cannot be reached,
 * so the failure is a socket, not a credential — which is the same shape the module has to survive.
 */
describe('a bucket that has not answered', () => {
  it('believes four keys only until the bucket itself says otherwise', async () => {
    await withEnv({ ...COMPLETE, MEDIA_ENDPOINT: 'http://127.0.0.1:1', RENDER: 'true' }, async () => {
      // Before the probe, the configuration is the only evidence there is.
      expect(bytesAreDurable()).toBe(true);
      expect(mediaStatus().note).toMatch(/not answered/i);

      const answer = await probeBucket();
      expect(answer?.ok).toBe(false);
      expect(answer?.reason).not.toBe('');

      expect(bytesAreDurable()).toBe(false);
      const status = mediaStatus();
      expect(status.provider).toBe('bucket');
      expect(status.durable).toBe(false);
      expect(status.note).toMatch(/cannot store clips there/i);
      expect(status.note).toContain('kontentos-clips');
      expect(status.note).not.toContain('a-secret');
    });
  });

  it('asks nothing of a server that was never given a bucket', async () => {
    await withEnv({ ...NO_BUCKET, RENDER: undefined }, async () => {
      expect(await probeBucket()).toBeNull();
    });
  });
});

describe('translating a clip url into a place', () => {
  it('accepts only the file names this app mints', () => {
    expect(objectKey('/uploads/vid_abcdef12.mp4')).toBe('clips/vid_abcdef12.mp4');
    expect(objectKey('/uploads/server.ts')).toBeNull();
    expect(objectKey('/uploads/../server.ts')).toBeNull();
    expect(objectKey('/uploads/vid_abcdef12.txt')).toBeNull();
    expect(objectKey('https://cdn.example/vid_abcdef12.mp4')).toBeNull();
    expect(objectKey('')).toBeNull();
    expect(objectKey(undefined)).toBeNull();
  });

  it('keeps a local path inside the uploads directory', () => {
    expect(localClipPath('/uploads/vid_abcdef12.mp4')).toBe(path.join(process.cwd(), 'uploads', 'vid_abcdef12.mp4'));
    // basename() is what neutralises traversal, so a nested url cannot point outside the folder.
    expect(localClipPath('/uploads/../server.ts')).toBeNull();
    expect(localClipPath('/data/vid_abcdef12.mp4')).toBeNull();
    expect(localClipPath(undefined)).toBeNull();
  });
});

describe('a server with no bucket', () => {
  const clip = path.join(process.cwd(), 'uploads', 'vid_localclip99.mp4');

  beforeAll(() => {
    fs.mkdirSync(path.dirname(clip), { recursive: true });
    fs.writeFileSync(clip, 'bytes');
  });
  afterAll(() => fs.rmSync(clip, { force: true }));

  it('leaves the file exactly where the route wrote it', async () => {
    await withEnv({ ...NO_BUCKET, RENDER: undefined }, async () => {
      await persistClip(clip, '/uploads/vid_localclip99.mp4');
      expect(fs.existsSync(clip)).toBe(true);
      expect(await hasClipBytes('/uploads/vid_localclip99.mp4')).toBe(true);
      expect(await ensureLocalCopy('/uploads/vid_localclip99.mp4')).toBe(clip);
      // Nothing to read from a store that does not exist, so the route falls through to its 404.
      expect(await readBucketClip('/uploads/vid_localclip99.mp4')).toBeNull();
      await removeBucketClip('/uploads/vid_localclip99.mp4');
    });
    expect(fs.existsSync(clip)).toBe(true);
  });

  it('calls a clip whose bytes were never written absent, not ready', async () => {
    await withEnv({ ...NO_BUCKET, RENDER: undefined }, async () => {
      expect(await hasClipBytes('/uploads/vid_missing1.mp4')).toBe(false);
      expect(await ensureLocalCopy('/uploads/vid_missing1.mp4')).toBeNull();
    });
  });
});

/**
 * A real S3-compatible endpoint, so the signing, the key layout and the range read are tested instead
 * of assumed. Opt-in: CI has no bucket, and skipped cases there are honest while a green that never
 * touched anything would not be. Against a local MinIO:
 *   MEDIA_ENDPOINT=http://127.0.0.1:9000 MEDIA_BUCKET=clips \
 *   MEDIA_ACCESS_KEY_ID=... MEDIA_SECRET_ACCESS_KEY=... npx vitest run server/mediaStore.test.ts
 */
const liveBucket = Boolean(
  process.env.MEDIA_ENDPOINT && process.env.MEDIA_BUCKET && process.env.MEDIA_ACCESS_KEY_ID && process.env.MEDIA_SECRET_ACCESS_KEY
);

describe.skipIf(!liveBucket)('a real bucket', () => {
  const fileUrl = `/uploads/vid_buckettest${Math.random().toString(36).slice(2, 8)}.mp4`;
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-store-live-'));
  const source = path.join(scratch, 'clip.mp4');
  const localCopy = localClipPath(fileUrl)!;
  const SIZE = 1024 * 1024;

  beforeAll(() => {
    // Two distinct halves, so a range read cannot be mistaken for a whole-object one.
    fs.writeFileSync(source, Buffer.concat([Buffer.alloc(SIZE / 2, 0x41), Buffer.alloc(SIZE / 2, 0x42)]));
  });
  afterAll(async () => {
    await removeBucketClip(fileUrl);
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.rmSync(localCopy, { force: true });
  });

  it('confirms with its own name that the keys work', async () => {
    expect(await probeBucket()).toEqual({ ok: true, reason: '' });
    expect(mediaStatus().durable).toBe(true);
  });

  it('holds a clip the container no longer has', async () => {
    await persistClip(source, fileUrl);
    // The put replaces the local copy: on an ephemeral disk a half-cache is just a leak.
    expect(fs.existsSync(source)).toBe(false);
    expect(await hasClipBytes(fileUrl)).toBe(true);

    const whole = await readBucketClip(fileUrl);
    expect(whole?.status).toBe(200);
    expect(whole?.headers['content-length']).toBe(String(SIZE));

    const part = await readBucketClip(fileUrl, `bytes=${SIZE / 2}-`);
    expect(part?.status).toBe(206);
    expect(part?.headers['content-range']).toBe(`bytes ${SIZE / 2}-${SIZE - 1}/${SIZE}`);

    // ffmpeg reads files, not objects, so a cut stages the clip back down first.
    const staged = await ensureLocalCopy(fileUrl);
    expect(staged).toBe(localCopy);
    expect(fs.readFileSync(localCopy).length).toBe(SIZE);
  });

  it('reports an object that was never written as absent', async () => {
    expect(await hasClipBytes('/uploads/vid_neverwritten1.mp4')).toBe(false);
    expect(await readBucketClip('/uploads/vid_neverwritten1.mp4')).toBeNull();
    expect(await ensureLocalCopy('/uploads/vid_neverwritten1.mp4')).toBeNull();
  });
});
