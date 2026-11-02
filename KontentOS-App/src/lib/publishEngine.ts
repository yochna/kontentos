import type { SocialPlatform } from './types';

export interface PlatformCopyBundle {
  instagram: { caption: string; hashtags: string[] };
  youtube: { title: string; description: string; tags: string[] };
  tiktok: { caption: string; hashtags: string[] };
  linkedin: { postText: string; slideOutline: string[]; hashtags: string[] };
  x: { thread: string[]; hashtags: string[] };
  threads: { postText: string; hashtags: string[] };
  facebook: { postText: string; hashtags: string[] };
}

/**
 * The offline scaffold. Nothing here is written *for* the creator: no invented stats, no "90% of
 * creators" claims, no hashtags nobody chose — the only inputs are a title and sometimes a hook the
 * creator typed, and a caption built out of those two is a fabrication wearing their name. Each
 * bracket is a line to fill from the take itself.
 */
export function generateMultiPlatformCopy(
  title: string,
  hook?: string,
  _context?: string,
): PlatformCopyBundle {
  const cleanTitle = (title || '').trim() || 'This cut';
  const lead = (hook || '').trim() || '[the hook — what you say in the first four seconds]';
  const blank = (hint: string) => `[${hint}]`;
  const note =
    'KontentOS scaffold — this take has no transcript on the server, so the words are yours. Delete this line before posting.';

  return {
    instagram: {
      caption: `${cleanTitle}\n\n${lead}\n\n${blank('what you actually said, in your own words')}\n\n${blank(
        'the one thing the viewer should do next'
      )}\n\n${note}`,
      hashtags: [],
    },
    youtube: {
      title: cleanTitle.slice(0, 100),
      description: `${cleanTitle}\n\n${lead}\n\n${blank('what the short covers, in one sentence')}\n\n${note}`,
      tags: [],
    },
    tiktok: {
      caption: `${lead}\n\n${blank('the turn — why it matters')}\n\n${note}`,
      hashtags: [],
    },
    linkedin: {
      postText: `${cleanTitle}\n\n${lead}\n\n${blank('the argument, in your own words')}\n\n${blank(
        'what you would do differently now'
      )}\n\n${note}`,
      slideOutline: [
        'Slide 1 — the claim you are making',
        'Slide 2 — what happened in the take',
        'Slide 3 — the number or scene that proves it',
        'Slide 4 — what you changed after it',
        'Slide 5 — the one thing the reader should do',
      ],
      hashtags: [],
    },
    x: {
      thread: [
        // Truncated on purpose: a first tweet over 280 characters is refused by X, and the queue
        // would hold a post that can never be published as written.
        `${cleanTitle.slice(0, 90)}\n\n${lead.slice(0, 180)}`,
        blank('the proof — one number or one scene from the take'),
        `${blank('the turn — what to do next')}`,
      ],
      hashtags: [],
    },
    threads: {
      postText: `${lead}\n\n${blank('what you think about it')}\n\n${note}`,
      hashtags: [],
    },
    facebook: {
      postText: `${cleanTitle}\n\n${lead}\n\n${blank('why it is worth two minutes of their day')}\n\n${note}`,
      hashtags: [],
    },
  };
}

export function exportManualAssistPackage(
  bundle: PlatformCopyBundle,
  videoTitle: string,
  videoUrl?: string,
) {
  const cleanName = (videoTitle || 'post').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

  const manifest = {
    title: videoTitle,
    exportedAt: new Date().toISOString(),
    sourceVideoUrl: videoUrl || 'Local File',
    platforms: {
      instagram: bundle.instagram,
      youtube: bundle.youtube,
      tiktok: bundle.tiktok,
      linkedin: bundle.linkedin,
      x: bundle.x,
      threads: bundle.threads,
      facebook: bundle.facebook,
    },
    instructions: [
      '1. Download your exported MP4 video asset from the studio.',
      '2. Fill every [bracketed line] — KontentOS hands you a scaffold, not your voice.',
      '3. Post during your scheduled peak engagement window.',
      '4. Nothing here was published for you; paste it into the platform composer yourself.',
    ],
  };

  const textContent = `=====================================================
KONTENTOS — MULTI-PLATFORM PUBLISHING BUNDLE
Title: ${videoTitle}
Generated: ${new Date().toLocaleString()}
=====================================================

--- [1] INSTAGRAM REEL ---
${bundle.instagram.caption}

Hashtags: ${bundle.instagram.hashtags.map((h) => `#${h}`).join(' ')}


--- [2] YOUTUBE SHORTS ---
Title: ${bundle.youtube.title}

Description:
${bundle.youtube.description}

Tags: ${bundle.youtube.tags.join(', ')}


--- [3] TIKTOK ---
Caption:
${bundle.tiktok.caption}


--- [4] LINKEDIN POST ---
${bundle.linkedin.postText}

Hashtags: ${bundle.linkedin.hashtags.map((h) => `#${h}`).join(' ')}

Carousel Outline:
${bundle.linkedin.slideOutline.map((s, i) => `${i + 1}. ${s}`).join('\n')}


--- [5] X / TWITTER THREAD ---
${bundle.x.thread.join('\n\n')}


--- [6] THREADS ---
${bundle.threads.postText}


--- [7] FACEBOOK ---
${bundle.facebook.postText}
=====================================================`;

  // Download manifest as JSON
  const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cleanName}_publishing_bundle.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
