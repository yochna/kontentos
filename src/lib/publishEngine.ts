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

export function generateMultiPlatformCopy(
  title: string,
  hook?: string,
  _context?: string,
): PlatformCopyBundle {
  const cleanTitle = (title || 'Creator Systems To Scale Output').trim();
  const cleanHook = hook || `Most people do this completely wrong: "${cleanTitle}".`;

  return {
    instagram: {
      caption: `🚨 ${cleanHook}\n\nHere is how to master "${cleanTitle}" without burning out:\n\n1️⃣ Capture raw high-signal insights when creative energy peaks\n2️⃣ Automate dead-air trimming, kinetic subtitles & color pop\n3️⃣ Syndicate across visual slides & vertical video in minutes\n\n👇 Save this reel for your next creation sprint! What is your biggest production bottleneck right now?`,
      hashtags: ['contentcreator', 'reelsgrowth', 'videomarketing', 'creatoreconomy', 'kontentos'],
    },
    youtube: {
      title: `${cleanTitle.slice(0, 50)} 🚨 (Viral Creator Breakdown)`,
      description: `Stop overcomplicating your video workflow. In this Short, we break down "${cleanTitle}" step-by-step.\n\n📌 Timestamps:\n0:00 - The Core Trap\n0:08 - The 1-Click System\n0:22 - Omnichannel Distribution\n\n💬 Subscribe for daily creator tools and drop your thoughts below!`,
      tags: ['Shorts', 'YouTubeShorts', 'CreatorTips', 'VideoMarketing', 'CreatorEconomy'],
    },
    tiktok: {
      caption: `Unpopular truth about "${cleanTitle}" ☕ Stop spending 4 hours editing a 30s video. Do this instead ⚡ #creator #editingtips #productivity #ai #kontentos`,
      hashtags: ['creator', 'editingtips', 'productivity', 'ai', 'kontentos'],
    },
    linkedin: {
      postText: `The creator economy is won on distribution speed, not editing fatigue.\n\nHere is the operational breakdown on "${cleanTitle}":\n\n• High-leverage creators do not spend half their day manually positioning subtitle keyframes.\n• They record unpolished high-conviction thoughts, leverage automated assembly, and syndicate.\n• One raw clip becomes a video reel, a 5-slide carousel, and a tactical text breakdown.\n\nAre you prioritizing manual production or streamlined distribution this quarter?`,
      slideOutline: [
        `Slide 1: Master Framework — ${cleanTitle}`,
        'Slide 2: The Bottleneck — Manual Editing Burnout',
        'Slide 3: The System — Raw Input + Automated AI Assembly',
        'Slide 4: The Leverage — Multi-Platform Syndication',
        'Slide 5: Save & Share with your creator team',
      ],
      hashtags: ['leadership', 'productivity', 'creatoreconomy', 'saas', 'automation'],
    },
    x: {
      thread: [
        `1/ Everything you need to know about "${cleanTitle}" (save this thread) 🧵👇`,
        `2/ Point 1: 90% of creators give up because post-production friction drains their creative battery.`,
        `3/ Point 2: The solution isn’t working harder—it’s turning raw 1-minute smartphone recordings into polished assets.`,
        `4/ Point 3: Syndicate each idea everywhere: Reels for discovery, Shorts for subscriber momentum, and LinkedIn for B2B deals.`,
        `5/ Want the complete viral creator blueprint? Retweet tweet #1 and check out @KontentOS! ⚡`,
      ],
      hashtags: ['buildinpublic', 'creatoreconomy', 'productivity'],
    },
    threads: {
      postText: `Unpopular truth about "${cleanTitle}" ☕\n\nYou do not need a 4K cinema rig or 10 hours in Premiere. You need raw conviction and a frictionless publishing pipeline.\n\nHow much time do you spend editing per week? 👇`,
      hashtags: ['creator', 'productivity', 'mindset'],
    },
    facebook: {
      postText: `Here is something every modern content creator needs to hear about "${cleanTitle}":\n\nConsistency beats complexity every single time. Stop getting stuck in editing loops and focus on getting your message out.\n\nDrop a comment if you agree! 👇`,
      hashtags: ['videocreator', 'digitalmarketing', 'contentstrategy'],
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
      '2. Open the platform-specific text files below and copy the optimized captions.',
      '3. Post during your scheduled peak engagement window.',
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
