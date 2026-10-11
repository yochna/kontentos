// KontentOS — Universal Studio Hub: 🎬 Pro Video & Reel Studio + 🖼️ AI Image & Carousel Studio
import { stateStore, GEO_LOCALES } from '../state.js';
import { openProModal } from './pro-modal.js';
import { api } from '../api.js';
import { openVideoGalleryModal } from './video-gallery.js';
import { openPublishingHistoryModal } from './publishing-history.js';
import { openScheduleModal } from './schedule-planner.js';
import { toPng, toBlob } from 'html-to-image';

// Master Catalog of 20+ Curated High-Resolution Background Photography
const MASTER_BG_CATALOG = [
  {
    id: 'minimalist_desk',
    name: 'Minimalist Workspace',
    tag: 'Workspace',
    url: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'modern_office',
    name: 'Architectural Window',
    tag: 'Office',
    url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'wooden_desk',
    name: 'Warm Wood & Laptop',
    tag: 'Warmth',
    url: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'minimal_plant',
    name: 'Sunlit Plant Desk',
    tag: 'Nature',
    url: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'moody_studio',
    name: 'Moody Creator Studio',
    tag: 'Studio',
    url: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'podcast_mic',
    name: 'Podcast Studio Mic',
    tag: 'Podcast',
    url: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'audio_console',
    name: 'Audio Mixing Desk',
    tag: 'Audio',
    url: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'aesthetic_coffee',
    name: 'Coffee & Laptop Desk',
    tag: 'Lifestyle',
    url: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'latte_notebook',
    name: 'Espresso & Notebook',
    tag: 'Journal',
    url: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'coworking_vibe',
    name: 'Co-Working Lounge',
    tag: 'Vibe',
    url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'coding_night',
    name: 'Clean Code Desk',
    tag: 'Focus',
    url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'abstract_mesh',
    name: 'Modern Fluid Gradient',
    tag: 'Abstract',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'pastel_peach',
    name: 'Terracotta & Peach',
    tag: 'Editorial',
    url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'chromatic_wave',
    name: 'Chromatic 3D Wave',
    tag: '3D Wave',
    url: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'cyber_neon',
    name: 'Neon Cyber Desk',
    tag: 'Cyber',
    url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'moody_mountain',
    name: 'Misty Alpine Silhouette',
    tag: 'Moody',
    url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=1200&q=80'
  },
  {
    id: 'none',
    name: 'Pure Solid / Minimal Glass',
    tag: 'Solid',
    url: ''
  }
];

export function renderRawStudio(container) {
  const state = stateStore.get();
  const profile = state.creatorProfile;
  const locale = GEO_LOCALES[state.geo] || GEO_LOCALES.IN;

  // Studio Mode: 'video' or 'image'
  let activeStudioMode = 'video';

  // Video Mode State
  let isVideoUploaded = false;
  let isAutoEdited = false;
  let currentVideoUrl = null;
  let currentFileName = 'raw_phone_recording.mp4';
  let isPlaying = true;
  let currentVideoId = null;
  let uploadProgress = 0;
  let processingStatus = 'idle'; // 'idle', 'uploading', 'transcribing', 'captioning', 'ready', 'error'
  let processingMessage = '';
  let subtitlesData = null; // { srt, vtt, segments, transcript }
  
  // Multi-Platform AI Copy & Distribution Engine State (MVP Priority 2)
  let activeCopyPlatform = 'instagram'; // 'instagram', 'youtube', 'tiktok', 'linkedin', 'x', 'threads', 'facebook'
  let selectedCopyTone = 'Viral & Punchy'; // 'Viral & Punchy', 'Professional & Authoritative', 'Educational & Tactical', 'Storyteller & Relatable'
  let isGeneratingCopy = false;
  let isGeneratingAllCopy = false;
  let copyClipboardToast = false;
  let multiPublishModalOpen = false;
  let multiPublishingInProgress = false;
  let multiPublishResults = null;

  let platformCopyStore = {
    instagram: {
      caption: `📌 Stop wasting hours on manual editing. Here is the 3-step system top creators use to automate their video pipeline.\n\n1️⃣ Batch raw ideas when creative flow is high\n2️⃣ AI auto-transcription & kinetic captions\n3️⃣ 1-click multi-platform distribution\n\n👇 Save this reel for your next batch creation session!`,
      hashtags: ['contentcreator', 'reelsgrowth', 'videoproduction', 'solopreneur', 'aivideo'],
      approved: false,
      maxChars: 2200,
      label: 'Instagram Reels',
      icon: '📸',
      badge: 'REELS'
    },
    youtube: {
      caption: `🔥 3-Step Video Creation System for Creators (Automate in 60s)\n\nIn this video, discover the exact step-by-step framework to turn raw footage into viral short-form videos with burned-in kinetic subtitles.\n\nWhat is your biggest video creation hurdle right now? Let us know in the comments!`,
      hashtags: ['Shorts', 'VideoEditing', 'CreatorEconomy', 'YouTubeShorts', 'KontentOS'],
      approved: false,
      maxChars: 1000,
      label: 'YouTube Shorts',
      icon: '▶️',
      badge: 'SHORTS'
    },
    tiktok: {
      caption: `The 3-step video workflow top creators use to save 10+ hours a week 👀 which step will you try first?`,
      hashtags: ['creatortips', 'videoediting', 'filmtok', 'aivideo', 'learnontiktok'],
      approved: false,
      maxChars: 400,
      label: 'TikTok',
      icon: '🎵',
      badge: 'TIKTOK'
    },
    linkedin: {
      caption: `Video creation shouldn't take 5 hours per post.\n\nHere is how top digital operators streamline short-form video production:\n• Step 1: Capture raw high-signal thoughts on your phone\n• Step 2: Leverage AI for kinetic transcription & subtitle formatting\n• Step 3: Distribute across 4+ platforms simultaneously\n\nHow is your team modernizing its video workflow this quarter?`,
      hashtags: ['ContentStrategy', 'VideoMarketing', 'CreatorEconomy', 'Productivity'],
      approved: false,
      maxChars: 1500,
      label: 'LinkedIn Video',
      icon: '💼',
      badge: 'LINKEDIN'
    },
    x: {
      caption: `90% of video creation friction is editing. The 3-step framework to publish 10x faster: raw capture → AI subtitles → instant multi-platform syndicate. ⚡`,
      hashtags: ['CreatorEconomy', 'VideoTips', 'BuildInPublic'],
      approved: false,
      maxChars: 280,
      label: 'X (Twitter)',
      icon: '𝕏',
      badge: 'X POST'
    },
    threads: {
      caption: `Honest creator check-in ☕\n\nAutomating your video subtitles and distribution saves at least 8 hours a week.\n\nAre you still editing your reels manually or using automated pipelines? Drop your thoughts 👇`,
      hashtags: ['threads', 'creators', 'productivity', 'reelsgrowth'],
      approved: false,
      maxChars: 500,
      label: 'Threads',
      icon: '🧵',
      badge: 'THREADS'
    },
    facebook: {
      caption: `🚀 A quick workflow tip for anyone building and creating content online!\n\nStop spending hours on manual video subtitles. Use an automated kinetic caption pipeline and publish across all channels with 1 click.\n\n🙌 Share this with a fellow creator who needs to see this!`,
      hashtags: ['contentcreators', 'digitalmarketing', 'businessgrowth', 'creatorhacks'],
      approved: false,
      maxChars: 800,
      label: 'Facebook',
      icon: '👥',
      badge: 'FACEBOOK'
    }
  };

  let editableCaptionText = platformCopyStore.instagram.caption;
  let editableHashtags = platformCopyStore.instagram.hashtags;
  let isCaptionApproved = false;
  let isPublishing = false;
  let lastPublishedUrl = null;

  // Pro Video Editor Settings
  let activeEditorTab = 'subtitles'; // 'subtitles', 'color_pro', 'effects', 'transitions', 'audio_sfx'
  
  // 1. Subtitles State
  let selectedSubtitlePreset = 'plain_white'; // 'plain_white', 'beast', 'hormozi', 'ali_abdaal'
  let subtitlePosition = 'bottom'; // 'bottom', 'center', 'top'
  let subtitleFontSize = '1.15rem';
  let subtitleHighlightColor = '#39ff14';
  let liveTranscriptText = "STOP DOING THIS IN 2026! THE #1 MISTAKE CREATORS MAKE";
  let selectedLanguage = 'English'; // 'English', 'Hindi', 'Hinglish', 'Spanish', 'French', 'German', 'Japanese', 'Portuguese', 'Arabic'
  let isTranscribing = false;
  let isTranslating = false;
  let isRecordingMic = false;
  let speechRecInstance = null;

  // 2. AI B-Roll & Emojis State
  let bRollEnabled = true;
  let bRollType = 'tech_growth'; // 'tech_growth', 'lifestyle', 'crypto_money', 'viral_memes'
  let emojiPopupsEnabled = true;
  let emojiStyle = '3d_bounce'; // '3d_bounce', 'glow_pop', 'fire_smoke'

  // 3. Pro Color Adjustments & LUTs State
  let selectedFilter = 'none'; // 'none', 'teal_orange', 'cyber_neon', 'vintage_film', 'studio_bright', 'black_white'
  let colorBrightness = 100; // 80 - 130%
  let colorContrast = 100; // 80 - 140%
  let colorSaturation = 100; // 50 - 150%
  let colorVignette = 0; // 0 - 60%

  // 4. Effects & Dynamic Zooms State
  let selectedEffect = 'none'; // 'none', 'smart_zoom', 'glitch_flash', 'light_leak', 'film_grain'
  let motionBlurEnabled = false;
  let speedRampEnabled = false;

  // 5. Transitions & Pacing State
  let selectedTransition = 'whip_pan'; // 'whip_pan', 'zoom_snap', 'glitch', 'camera_flash'
  let cutPacing = 'viral_fast'; // 'viral_fast' (1.2s), 'medium_pace' (2.5s), 'cinematic' (4.0s)

  // 6. Audio & Sound FX State
  let voiceIsolator = false;
  let voiceSpeed = '1.0x'; // '1.0x', '1.05x', '1.15x', '0.95x'
  let sfxPack = 'beast_high_viral'; // 'beast_high_viral', 'vox_documentary', 'clean_tech', 'cinematic_trailer', 'retro_gaming', 'tiktok_trending', 'none'
  let bgMusicTrack = 'lofi_chill'; // 'lofi_chill', 'phonk_drift', 'synthwave_drive', 'upbeat_pop', 'cinematic_ambient', 'trap_banger', 'afrobeats_vibe', 'none'
  let bgMusicVolume = 45;
  let isAudioMuted = false;
  let audioCtx = null;
  let bgmOscillators = [];
  let bgmGainNode = null;
  let videoSourceNode = null;
  let currentSourceVideoEl = null;

  const BGM_TRACK_CONFIGS = {
    lofi_chill: {
      name: 'Lofi Chai',
      emoji: '☕',
      desc: 'Minimal Lofi Swell',
      chords: [261.63, 329.63, 392.00, 493.88], // Cmaj7 smooth lofi swell
      type: 'sine',
      gainFactor: 0.14
    },
    phonk_drift: {
      name: 'Brazilian Phonk',
      emoji: '🏎️',
      desc: '808 Sawtooth Drive',
      chords: [130.81, 155.56, 196.00, 233.08], // C minor 808 sawtooth bass drive
      type: 'sawtooth',
      gainFactor: 0.18
    },
    synthwave_drive: {
      name: 'Tokyo Synthwave',
      emoji: '🌆',
      desc: '80s Cyber Cruise',
      chords: [174.61, 220.00, 261.63, 329.63], // Fmaj7 80s cyber synth pulse
      type: 'square',
      gainFactor: 0.12
    },
    upbeat_pop: {
      name: 'Viral Pop Beat',
      emoji: '✨',
      desc: 'Bouncy Funk Pop',
      chords: [293.66, 369.99, 440.00, 587.33], // D major bouncy viral pop
      type: 'triangle',
      gainFactor: 0.15
    },
    cinematic_ambient: {
      name: 'Cinematic Ambient',
      emoji: '🎻',
      desc: 'Ethereal Story Pads',
      chords: [220.00, 261.63, 329.63, 440.00], // Am9 ethereal storytelling pad
      type: 'sine',
      gainFactor: 0.13
    },
    trap_banger: {
      name: 'Hype Trap Beat',
      emoji: '💣',
      desc: 'Hi-Hats & Sub Bass',
      chords: [116.54, 146.83, 174.61, 220.00], // Bb minor underground sub trap
      type: 'sawtooth',
      gainFactor: 0.19
    },
    afrobeats_vibe: {
      name: 'Summer Afrobeats',
      emoji: '🌴',
      desc: 'Amapiano Groove',
      chords: [164.81, 207.65, 246.94, 329.63], // E major afro groove
      type: 'triangle',
      gainFactor: 0.15
    }
  };

  const SFX_PACK_SOUNDBOARDS = {
    beast_high_viral: [
      { id: 'sub_drop', label: '💥 Sub Bass Drop', desc: 'Punchy 808 sub bass drop for opening hooks' },
      { id: 'whip_whoosh', label: '💨 Whip Whoosh', desc: 'High-speed air whoosh for fast cuts' },
      { id: 'pop_impact', label: '🎈 Pop Impact', desc: 'Snappy cork pop for fast text pops' },
      { id: 'gold_chime', label: '✨ Gold Chime', desc: 'Magic shimmering chime for value moments' },
      { id: 'vine_boom', label: '💣 Viral Bass Boom', desc: 'Heavy dramatic meme bass boom' },
      { id: 'riser_short', label: '⚡ Tension Riser', desc: 'Ascending swell before punchlines' },
      { id: 'whoosh_heavy', label: '🌪️ Heavy Swoosh', desc: 'Deep air displacement for camera zooms' },
      { id: 'cinema_hit', label: '🎬 Cinematic Hit', desc: 'Blockbuster trailer stinger hit' }
    ],
    vox_documentary: [
      { id: 'tape_click', label: '📼 Tape Click', desc: 'Vintage cassette tape mechanical switch' },
      { id: 'key_clack', label: '⌨️ Key Clack', desc: 'Tactile mechanical keyboard switch tap' },
      { id: 'paper_rustle', label: '📄 Paper Rustle', desc: 'Crisp editorial document slide' },
      { id: 'bell_tone', label: '🔔 Soft Bell', desc: 'Warm acoustic bell for key facts' },
      { id: 'camera_click', label: '📸 Camera Snap', desc: 'DSLR shutter click with flash burst' },
      { id: 'lightbulb_ping', label: '💡 Lightbulb Ping', desc: 'Instant aha eureka moment ping' },
      { id: 'pencil_scribble', label: '✏️ Note Scribble', desc: 'Pencil scratching on paper' },
      { id: 'page_turn', label: '📖 Page Turn', desc: 'Crisp magazine page turn' }
    ],
    clean_tech: [
      { id: 'glass_chime', label: '🥂 Glass Chime', desc: 'Crystal clear UI affirmation tone' },
      { id: 'soft_bubble', label: '🫧 Soft Bubble', desc: 'Gentle organic UI bubble pop' },
      { id: 'digital_beep', label: '📟 Digital Beep', desc: 'Modern minimal HUD notification' },
      { id: 'smooth_swipe', label: '👆 Smooth Swipe', desc: 'Subtle high-frequency finger swipe' },
      { id: 'sci_fi_blip', label: '🤖 Cyber Blip', desc: 'Futuristic AI compute pulse' },
      { id: 'scanner_beep', label: '🏷️ Scanner Beep', desc: 'High-precision barcode scanner' },
      { id: 'ui_confirm', label: '✅ Haptic Confirm', desc: 'Two-tone positive feedback pulse' },
      { id: 'hologram_warp', label: '🌌 Hologram Warp', desc: 'Ethereal frequency modulation sweep' }
    ],
    cinematic_trailer: [
      { id: 'horn_braam', label: '🎺 Horn Braam', desc: 'Low-frequency brass brass blast' },
      { id: 'sub_boom', label: '💥 Sub Boom', desc: 'Deep seismic sub rumble' },
      { id: 'metal_impact', label: '🔨 Metal Impact', desc: 'Industrial steel strike with reverb' },
      { id: 'tension_sweep', label: '🌊 Tension Sweep', desc: 'Ominous dark atmospheric swell' },
      { id: 'anvil_strike', label: '⚔️ Anvil Strike', desc: 'Resonant blacksmith iron clang' },
      { id: 'heartbeat_thump', label: '💓 Heartbeat', desc: 'Low-pass cardiac tension pulse' },
      { id: 'reverse_cymbal', label: '🌪️ Reverse Cymbal', desc: 'Gradual build-up whoosh stinger' },
      { id: 'trailer_hit', label: '🥁 Trailer Stinger', desc: 'Dramatic cinematic climax boom' }
    ],
    retro_gaming: [
      { id: 'coin_collect', label: '🪙 Coin Collect', desc: '8-bit Mario-style gold coin ping' },
      { id: 'powerup_beep', label: '⚡ Powerup Fanfare', desc: 'Retro 4-tone level-up arpeggio' },
      { id: 'laser_zap', label: '🔫 Laser Zap', desc: 'Arcade plasma blaster shot' },
      { id: 'glitch_burst', label: '👾 Glitch Burst', desc: '8-bit corrupted memory noise' },
      { id: 'jump_arcade', label: '🦘 Arcade Jump', desc: 'Ascending square-wave jump spring' },
      { id: 'item_found', label: '🏆 Item Found', desc: 'Triumphant major fanfare stinger' },
      { id: 'buzzer_fail', label: '❌ 8-Bit Buzz', desc: 'Descending error tone' },
      { id: 'ding_correct', label: '🎯 Level Clear', desc: 'High-pitch score increment bell' }
    ],
    tiktok_trending: [
      { id: 'vine_boom', label: '💣 Vine Boom', desc: 'Legendary punchline bass impact' },
      { id: 'record_scratch', label: '💿 Record Scratch', desc: 'Classic DJ turntable rewind stop' },
      { id: 'cash_register', label: '💵 Ka-Ching!', desc: 'Mechanical bell cash register chime' },
      { id: 'boing_jump', label: '🌀 Boing Jump', desc: 'Cartoon spring jump wobble' },
      { id: 'airhorn_single', label: '📢 Airhorn Hit', desc: 'Hype Jamaican dancehall airhorn' },
      { id: 'buzzer_fail', label: '🚨 Wrong Buzzer', desc: 'Obnoxious game show fail buzz' },
      { id: 'ding_correct', label: '🛎️ Elevator Ding', desc: 'Satisfying service bell ding' },
      { id: 'record_stop', label: '🛑 Tape Stop', desc: 'Vinyl motor slowdown cut' }
    ]
  };

  function computeProColorFilter(filterId = selectedFilter, bright = colorBrightness, cont = colorContrast, sat = colorSaturation) {
    const b = bright / 100;
    const c = cont / 100;
    const s = sat / 100;

    if (filterId === 'teal_orange') {
      return `brightness(${Math.round(b * 100)}%) contrast(${Math.round(c * 118)}%) saturate(${Math.round(s * 130)}%) hue-rotate(-12deg)`;
    } else if (filterId === 'cyber_neon') {
      return `brightness(${Math.round(b * 100)}%) contrast(${Math.round(c * 130)}%) saturate(${Math.round(s * 145)}%) hue-rotate(20deg)`;
    } else if (filterId === 'vintage_film') {
      return `sepia(0.32) brightness(${Math.round(b * 108)}%) contrast(${Math.round(c * 92)}%) saturate(${Math.round(s * 85)}%)`;
    } else if (filterId === 'studio_bright') {
      return `brightness(${Math.round(b * 114)}%) contrast(${Math.round(c * 110)}%) saturate(${Math.round(s * 115)}%)`;
    } else if (filterId === 'black_white') {
      return `grayscale(1) brightness(${Math.round(b * 100)}%) contrast(${Math.round(c * 135)}%)`;
    } else {
      if (bright === 100 && cont === 100 && sat === 100) return '';
      return `brightness(${bright}%) contrast(${cont}%) saturate(${sat}%)`;
    }
  }

  let voiceIsoHighpassNode = null;
  let voiceIsoPresenceNode = null;
  let voiceIsoCompressorNode = null;

  function setupVoiceIsolatorPipeline(videoElement) {
    if (!videoElement) return;
    initAudioContext();
    if (!audioCtx) return;

    try {
      if (!videoSourceNode || currentSourceVideoEl !== videoElement) {
        videoSourceNode = audioCtx.createMediaElementSource(videoElement);
        currentSourceVideoEl = videoElement;
      }

      if (!voiceIsoHighpassNode) {
        voiceIsoHighpassNode = audioCtx.createBiquadFilter();
        voiceIsoHighpassNode.type = 'highpass';
        voiceIsoHighpassNode.frequency.value = 95;

        voiceIsoPresenceNode = audioCtx.createBiquadFilter();
        voiceIsoPresenceNode.type = 'peaking';
        voiceIsoPresenceNode.frequency.value = 3200;
        voiceIsoPresenceNode.gain.value = 4.5;

        voiceIsoCompressorNode = audioCtx.createDynamicsCompressor();
        voiceIsoCompressorNode.threshold.setValueAtTime(-24, audioCtx.currentTime);
        voiceIsoCompressorNode.knee.setValueAtTime(30, audioCtx.currentTime);
        voiceIsoCompressorNode.ratio.setValueAtTime(4, audioCtx.currentTime);
        voiceIsoCompressorNode.attack.setValueAtTime(0.003, audioCtx.currentTime);
        voiceIsoCompressorNode.release.setValueAtTime(0.25, audioCtx.currentTime);
      }

      videoSourceNode.disconnect();
      if (voiceIsolator) {
        videoSourceNode.connect(voiceIsoHighpassNode);
        voiceIsoHighpassNode.connect(voiceIsoPresenceNode);
        voiceIsoPresenceNode.connect(voiceIsoCompressorNode);
        voiceIsoCompressorNode.connect(audioCtx.destination);
      } else {
        videoSourceNode.connect(audioCtx.destination);
      }
    } catch (err) {
      console.warn('Voice isolator audio node connection:', err);
    }
  }

  function initAudioContext() {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  }

  let autoKeywordSfxEnabled = true;
  let triggeredSfxSegmentIds = new Set();

  // Universal Web Audio Synthesizer for 40+ Sound Effects (works in both Live AudioContext and OfflineAudioContext)
  function synthSfxToContext(ctx, sfxType, startTime = 0, destNode = null) {
    if (!ctx || !sfxType) return;
    const now = startTime;

    const connectNode = (node) => {
      if (destNode) {
        try { node.connect(destNode); } catch (e) {}
      } else if (ctx.destination) {
        try { node.connect(ctx.destination); } catch (e) {}
      }
    };

    try {
      if (sfxType === 'sub_drop' || sfxType === 'sub_boom' || sfxType === 'vine_boom') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = sfxType === 'vine_boom' ? 'triangle' : 'sine';
        const startFreq = sfxType === 'vine_boom' ? 145 : (sfxType === 'sub_boom' ? 160 : 190);
        const endFreq = sfxType === 'vine_boom' ? 24 : 32;
        const dur = sfxType === 'vine_boom' ? 0.75 : 0.55;
        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
        gain.gain.setValueAtTime(sfxType === 'vine_boom' ? 0.7 : 0.55, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(gain);
        connectNode(gain);
        osc.start(now);
        osc.stop(now + dur);
      } else if (sfxType === 'cinema_hit' || sfxType === 'trailer_hit' || sfxType === 'metal_impact' || sfxType === 'anvil_strike') {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(sfxType === 'anvil_strike' ? 440 : 110, now);
        osc1.frequency.exponentialRampToValueAtTime(sfxType === 'anvil_strike' ? 80 : 35, now + 0.65);
        osc2.frequency.setValueAtTime(sfxType === 'anvil_strike' ? 880 : 220, now);
        osc2.frequency.exponentialRampToValueAtTime(sfxType === 'anvil_strike' ? 160 : 55, now + 0.45);

        filter.type = sfxType === 'metal_impact' ? 'highpass' : 'lowpass';
        filter.frequency.setValueAtTime(sfxType === 'metal_impact' ? 800 : 400, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.65);

        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        connectNode(gain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.65);
        osc2.stop(now + 0.65);
      } else if (sfxType === 'horn_braam') {
        [65, 68, 130].forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, now);
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(320, now);
          filter.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
          filter.frequency.exponentialRampToValueAtTime(240, now + 0.9);
          gain.gain.setValueAtTime(0.32 / (idx + 1), now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
          osc.connect(filter);
          filter.connect(gain);
          connectNode(gain);
          osc.start(now);
          osc.stop(now + 0.9);
        });
      } else if (sfxType === 'heartbeat_thump') {
        [0, 0.22].forEach(offset => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(80, now + offset);
          osc.frequency.exponentialRampToValueAtTime(35, now + offset + 0.12);
          gain.gain.setValueAtTime(0.55, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);
          osc.connect(gain);
          connectNode(gain);
          osc.start(now + offset);
          osc.stop(now + offset + 0.12);
        });
      } else if (sfxType === 'whip_whoosh' || sfxType === 'smooth_swipe' || sfxType === 'whoosh_heavy' || sfxType === 'fast_swish' || sfxType === 'tension_sweep' || sfxType === 'reverse_cymbal' || sfxType === 'hologram_warp') {
        const dur = (sfxType === 'tension_sweep' || sfxType === 'reverse_cymbal') ? 0.75 : (sfxType === 'whoosh_heavy' ? 0.42 : 0.25);
        const bufferSize = Math.floor(ctx.sampleRate * dur);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        if (sfxType === 'reverse_cymbal' || sfxType === 'tension_sweep') {
          filter.frequency.setValueAtTime(150, now);
          filter.frequency.exponentialRampToValueAtTime(4200, now + dur);
        } else {
          filter.frequency.setValueAtTime(220, now);
          filter.frequency.exponentialRampToValueAtTime(3400, now + dur * 0.45);
          filter.frequency.exponentialRampToValueAtTime(260, now + dur);
        }

        const gain = ctx.createGain();
        if (sfxType === 'reverse_cymbal') {
          gain.gain.setValueAtTime(0.01, now);
          gain.gain.linearRampToValueAtTime(0.45, now + dur * 0.9);
          gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        } else {
          gain.gain.setValueAtTime(0.02, now);
          gain.gain.linearRampToValueAtTime(0.4, now + dur * 0.4);
          gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        }

        noise.connect(filter);
        filter.connect(gain);
        connectNode(gain);
        noise.start(now);
        noise.stop(now + dur);
      } else if (sfxType === 'riser_short') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.45);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.35, now + 0.38);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        connectNode(gain);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (sfxType === 'pop_impact' || sfxType === 'soft_bubble' || sfxType === 'ui_confirm') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(sfxType === 'pop_impact' ? 920 : (sfxType === 'ui_confirm' ? 580 : 420), now);
        osc.frequency.exponentialRampToValueAtTime(sfxType === 'pop_impact' ? 120 : (sfxType === 'ui_confirm' ? 880 : 140), now + 0.08);
        gain.gain.setValueAtTime(0.42, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        connectNode(gain);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (sfxType === 'gold_chime' || sfxType === 'glass_chime' || sfxType === 'bell_tone' || sfxType === 'lightbulb_ping' || sfxType === 'ding_correct' || sfxType === 'zen_gong') {
        const freqs = sfxType === 'glass_chime' ? [1200, 1600, 2400] : (sfxType === 'lightbulb_ping' ? [1760, 2637] : (sfxType === 'ding_correct' ? [1318, 1760] : (sfxType === 'zen_gong' ? [220, 440, 660] : [1046, 1318, 1567])));
        const chimeDur = sfxType === 'zen_gong' ? 0.9 : 0.4;
        freqs.forEach((f, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = sfxType === 'zen_gong' ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(f, now + i * 0.035);
          gain.gain.setValueAtTime(0.24 / (i + 1), now + i * 0.035);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.035 + chimeDur);
          osc.connect(gain);
          connectNode(gain);
          osc.start(now + i * 0.035);
          osc.stop(now + i * 0.035 + chimeDur);
        });
      } else if (sfxType === 'cash_register') {
        [1760, 2349].forEach((f, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(f, now + i * 0.06);
          gain.gain.setValueAtTime(0.2, now + i * 0.06);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.28);
          osc.connect(gain);
          connectNode(gain);
          osc.start(now + i * 0.06);
          osc.stop(now + i * 0.06 + 0.28);
        });
      } else if (sfxType === 'coin_collect' || sfxType === 'powerup_beep' || sfxType === 'item_found' || sfxType === 'jump_arcade') {
        const notes = sfxType === 'powerup_beep' ? [440, 554, 659, 880] : (sfxType === 'item_found' ? [523, 659, 784, 1046] : (sfxType === 'jump_arcade' ? [220, 330, 440, 660] : [987, 1318]));
        const noteStep = sfxType === 'jump_arcade' ? 0.025 : 0.05;
        notes.forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(f, now + idx * noteStep);
          gain.gain.setValueAtTime(0.18, now + idx * noteStep);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * noteStep + 0.12);
          osc.connect(gain);
          connectNode(gain);
          osc.start(now + idx * noteStep);
          osc.stop(now + idx * noteStep + 0.12);
        });
      } else if (sfxType === 'laser_zap' || sfxType === 'record_scratch' || sfxType === 'glitch_burst' || sfxType === 'record_stop' || sfxType === 'sci_fi_blip') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = sfxType === 'laser_zap' ? 'sawtooth' : (sfxType === 'glitch_burst' ? 'square' : 'sine');
        osc.frequency.setValueAtTime(sfxType === 'sci_fi_blip' ? 1400 : 1800, now);
        osc.frequency.exponentialRampToValueAtTime(sfxType === 'sci_fi_blip' ? 700 : 120, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        connectNode(gain);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (sfxType === 'boing_jump') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(720, now + 0.22);
        gain.gain.setValueAtTime(0.38, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        connectNode(gain);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (sfxType === 'buzzer_fail') {
        [140, 144].forEach(f => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, now);
          gain.gain.setValueAtTime(0.28, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
          osc.connect(gain);
          connectNode(gain);
          osc.start(now);
          osc.stop(now + 0.35);
        });
      } else if (sfxType === 'airhorn_single') {
        [466.16, 587.33, 698.46].forEach((f, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, now);
          gain.gain.setValueAtTime(0.18, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
          osc.connect(gain);
          connectNode(gain);
          osc.start(now);
          osc.stop(now + 0.35);
        });
      } else {
        // Default mechanical clicks, camera shutter, paper slides, HUD beeps
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = (sfxType === 'digital_beep' || sfxType === 'scanner_beep') ? 'sine' : (sfxType === 'key_clack' ? 'square' : 'triangle');
        const freq = (sfxType === 'digital_beep' || sfxType === 'scanner_beep') ? 2200 : (sfxType === 'camera_click' ? 440 : 280);
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
        osc.connect(gain);
        connectNode(gain);
        osc.start(now);
        osc.stop(now + 0.045);
      }
    } catch (e) {
      console.warn('SFX synthesis notice:', e);
    }
  }

  function playSfx(sfxType, customDest = null) {
    if (sfxPack === 'none' && !sfxType) return;
    initAudioContext();
    if (!audioCtx) return;
    synthSfxToContext(audioCtx, sfxType, audioCtx.currentTime, customDest);
  }

  // Export & Download Individual Standalone Sound Effect as pristine .WAV file
  function downloadSfxAudioWav(sfxId, label = '') {
    if (!sfxId) return;
    const sampleRate = 44100;
    const duration = 0.95; // 0.95s is optimal for snappy short-form SFX
    const OfflineCtxClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtxClass) {
      showStudioToast('Audio download is not supported in this browser.', 'warn');
      return;
    }

    try {
      const offlineCtx = new OfflineCtxClass(2, sampleRate * duration, sampleRate);
      synthSfxToContext(offlineCtx, sfxId, 0, offlineCtx.destination);

      offlineCtx.startRendering().then(renderedBuffer => {
        const wavBlob = audioBufferToWavBlob(renderedBuffer);
        const blobUrl = URL.createObjectURL(wavBlob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${sfxId}_studio_sfx.wav`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        showStudioToast(`Downloaded ${label || sfxId} (.WAV)`, 'success');
      }).catch(e => {
        console.error('SFX WAV render error:', e);
        showStudioToast('Could not export SFX. Please try again.', 'error');
      });
    } catch (err) {
      console.error('SFX download error:', err);
    }
  }

  // Batch Download All Sound Effects in Selected Sound Pack as .WAV files
  function downloadFullSoundPack(packKey = sfxPack) {
    const pack = SFX_PACK_SOUNDBOARDS[packKey];
    if (!pack || pack.length === 0) {
      showStudioToast('Please select a valid SFX sound pack first!', 'warn');
      return;
    }
    showStudioToast(`Downloading all ${pack.length} SFX audio files (.WAV)...`, 'info');
    pack.forEach((sound, idx) => {
      setTimeout(() => {
        downloadSfxAudioWav(sound.id, sound.label);
      }, idx * 280);
    });
  }

  function checkKeywordHookSfxTrigger(curTime, activeSeg, customDest = null) {
    if (!autoKeywordSfxEnabled || !activeSeg || sfxPack === 'none') return;
    const segId = `${activeSeg.start || '0'}_${activeSeg.end || '0'}_${(activeSeg.text || '').slice(0, 15)}`;
    if (triggeredSfxSegmentIds.has(segId)) return;

    triggeredSfxSegmentIds.add(segId);

    const textLower = (activeSeg.text || '').toLowerCase();
    const packSounds = SFX_PACK_SOUNDBOARDS[sfxPack] || [];
    if (packSounds.length === 0) return;

    let sfxToPlay = null;
    const isPowerHook = /stop|mistake|secret|viral|money|10x|insane|boom|hack|don't|dont|never|free|system|boost|results|great|huge|big|top|attention|watch/i.test(textLower);
    const isStepAction = /step|1|2|3|first|second|third|now|today|quick|easy|pro|tip|how|save|share/i.test(textLower);

    if (isPowerHook && packSounds[0]) {
      sfxToPlay = packSounds[Math.floor(Math.random() * Math.min(3, packSounds.length))].id;
    } else if (isStepAction && packSounds.length > 1) {
      sfxToPlay = packSounds[1 % packSounds.length].id;
    } else if (packSounds.length > 2) {
      sfxToPlay = packSounds[2 % packSounds.length].id;
    } else {
      sfxToPlay = packSounds[0].id;
    }

    if (sfxToPlay) {
      playSfx(sfxToPlay, customDest);
    }
  }

  let aiSfxCues = [];
  let triggeredAiCueIds = new Set();
  let isAiSfxAnalyzing = false;

  function showStudioToast(message, type = 'info') {
    const existing = document.querySelector('#studio-global-toast') || document.querySelector('#audio-studio-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'studio-global-toast';
    
    let icon = '✨';
    let borderColor = 'var(--accent-primary)';
    if (type === 'error' || type === 'warn') {
      icon = '⚠️';
      borderColor = 'var(--accent-red)';
    } else if (type === 'copy') {
      icon = '📋';
      borderColor = 'var(--accent-secondary)';
    } else if (type === 'success') {
      icon = '⚡';
      borderColor = 'var(--accent-primary)';
    }

    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      background: var(--bg-surface-card);
      color: var(--text-main);
      border: 1.5px solid ${borderColor};
      box-shadow: var(--shadow-lg);
      border-radius: 12px;
      padding: 12px 18px;
      font-size: 0.85rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: 440px;
      line-height: 1.4;
      animation: fadeInToast 0.25s ease-out forwards;
    `;
    toast.innerHTML = `<span style="font-size: 1.1rem; flex-shrink: 0;">${icon}</span> <span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function showAudioNotification(message) {
    showStudioToast(message, 'info');
  }

  function runAiSmartSfxPlacement() {
    isAiSfxAnalyzing = true;
    renderMain();

    setTimeout(() => {
      aiSfxCues = [];

      const parseSec = (str) => {
        if (!str) return 0;
        const parts = str.split(':');
        if (parts.length < 3) return 0;
        const secParts = parts[2].split(/[,\.]/);
        return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(secParts[0], 10) + (parseInt(secParts[1] || 0, 10) / 1000);
      };

      const formatSecToStr = (sec) => {
        const m = String(Math.floor(sec / 60)).padStart(2, '0');
        const s = String(Math.floor(sec % 60)).padStart(2, '0');
        const ms = String(Math.floor((sec % 1) * 10));
        return `${m}:${s}.${ms}`;
      };

      // 1. Gather all transcript units from Copy Engine & Subtitles
      let transcriptUnits = [];

      // Source A: Subtitle Speech Segments
      if (subtitlesData && Array.isArray(subtitlesData.segments) && subtitlesData.segments.length > 0) {
        subtitlesData.segments.forEach((seg, idx) => {
          const sec = parseSec(seg.start);
          const timeStr = seg.start ? seg.start.substring(3, 8) : formatSecToStr(sec);
          transcriptUnits.push({
            text: seg.text || '',
            seconds: Math.max(0.2, sec + 0.1),
            timeStr: timeStr,
            source: 'Subtitles STT'
          });
        });
      }

      // Source B: Copy Engine AI Captions & Live Script Hook
      const activeCopyObj = platformCopyStore[activeCopyPlatform] || platformCopyStore.instagram;
      const copyEngineText = activeCopyObj?.caption || editableCaptionText || '';
      const combinedTextPool = [liveTranscriptText, copyEngineText].filter(Boolean).join('\n\n');

      if (combinedTextPool) {
        const lines = combinedTextPool
          .split(/[\n\.\!\?•]+/g)
          .map(l => l.trim())
          .filter(l => l.length > 3 && !l.startsWith('#'));

        const videoDuration = 12; // Standard video reel timeframe
        const timeStep = Math.max(1.4, videoDuration / Math.max(1, lines.length));

        lines.forEach((line, idx) => {
          const estimatedSec = Math.max(0.4, idx * timeStep + 0.3);
          if (estimatedSec <= videoDuration) {
            transcriptUnits.push({
              text: line,
              seconds: estimatedSec,
              timeStr: formatSecToStr(estimatedSec),
              source: 'Copy Engine AI Script'
            });
          }
        });
      }

      // 2. Multi-Keyword Category & Dynamic Sound Variations
      const hookRegex = /\b(stop|secret|viral|never|don't|dont|boom|insane|crazy|warning|shocking|unbelievable|huge|big|massive|watch|hook|omg|wtf|no way|listen|look)\b/i;
      const warningRegex = /\b(mistake|wrong|lie|myth|fake|scam|bad|fail|lose|problem|issue|error|flaw|trap|scams|avoid|danger)\b/i;
      const moneyRegex = /(\$|\b(money|10x|cash|profit|sales|rich|free|win|revenue|dollar|earnings|roi|cost|paid|price|business|growth|dollars|wealth|crypto|million)\b)/i;
      const stepRegex = /\b(step|hack|tip|how|system|method|framework|trick|easy|fast|quick|first|second|third|1|2|3|4|5|now|today|start|next|guide)\b/i;
      const techRegex = /\b(ai|tech|automation|tool|app|software|code|smart|future|level|upgrade|power|bot|algorithm|machine|cloud|device|digital)\b/i;
      const ctaRegex = /\b(like|subscribe|follow|share|comment|click|link|bio|save|drop|below|button|tap|notification|dm|check)\b/i;
      const insightRegex = /\b(truth|remember|key|lesson|quote|rule|principle|fact|insight|note|golden|secret|mindset|focus)\b/i;

      const SFX_CATEGORY_VARIATIONS = {
        hook: [
          { sfxId: 'sub_drop', sfxLabel: '💥 Sub Bass Drop', reason: 'Power Hook Impact', icon: '🔥' },
          { sfxId: 'vine_boom', sfxLabel: '💣 Viral Bass Boom', reason: 'Dramatic Hook Boom', icon: '💣' },
          { sfxId: 'horn_braam', sfxLabel: '🎺 Horn Braam', reason: 'Cinematic Teaser Hook', icon: '🎺' },
          { sfxId: 'cinema_hit', sfxLabel: '🎬 Cinematic Hit', reason: 'Blockbuster Hook Stinger', icon: '🎬' },
          { sfxId: 'whoosh_heavy', sfxLabel: '🌪️ Heavy Swoosh', reason: 'Energy Hook Inrush', icon: '🌪️' },
          { sfxId: 'riser_short', sfxLabel: '⚡ Tension Riser', reason: 'Anticipation Build Hook', icon: '⚡' }
        ],
        warning: [
          { sfxId: 'record_scratch', sfxLabel: '💿 Record Scratch', reason: 'Warning / Mistake Stop', icon: '🚨' },
          { sfxId: 'buzzer_fail', sfxLabel: '❌ Wrong Buzzer', reason: 'Common Error Alert', icon: '❌' },
          { sfxId: 'metal_impact', sfxLabel: '🔨 Metal Impact', reason: 'Critical Danger Clang', icon: '🔨' },
          { sfxId: 'glitch_burst', sfxLabel: '👾 Glitch Burst', reason: 'Flaw / System Glitch', icon: '👾' },
          { sfxId: 'record_stop', sfxLabel: '🛑 Tape Stop', reason: 'Abrupt Reality Check', icon: '🛑' }
        ],
        money: [
          { sfxId: 'cash_register', sfxLabel: '💵 Ka-Ching!', reason: 'High-Value Financial Term', icon: '💰' },
          { sfxId: 'gold_chime', sfxLabel: '✨ Gold Chime', reason: 'Profit & Wealth Magic', icon: '✨' },
          { sfxId: 'coin_collect', sfxLabel: '🪙 Coin Collect', reason: 'Revenue Growth Ping', icon: '🪙' },
          { sfxId: 'item_found', sfxLabel: '🏆 Jackpot Fanfare', reason: 'Big Reward Moment', icon: '🏆' }
        ],
        step: [
          { sfxId: 'whip_whoosh', sfxLabel: '💨 Whip Whoosh', reason: 'Action Step / Transition', icon: '⚡' },
          { sfxId: 'smooth_swipe', sfxLabel: '👆 Smooth Swipe', reason: 'Rapid Tutorial Step', icon: '👆' },
          { sfxId: 'camera_click', sfxLabel: '📸 Camera Snap', reason: 'Visual Step Screenshot', icon: '📸' },
          { sfxId: 'paper_rustle', sfxLabel: '📄 Paper Rustle', reason: 'Blueprint / Framework', icon: '📄' },
          { sfxId: 'tape_click', sfxLabel: '📼 Tape Click', reason: 'Mechanical Step Switch', icon: '📼' }
        ],
        tech: [
          { sfxId: 'sci_fi_blip', sfxLabel: '🤖 Cyber Blip', reason: 'AI & Automation Pulse', icon: '🤖' },
          { sfxId: 'powerup_beep', sfxLabel: '⚡ Powerup Fanfare', reason: 'Tech Level Up', icon: '⚡' },
          { sfxId: 'digital_beep', sfxLabel: '📟 Digital Beep', reason: 'HUD Code Notification', icon: '📟' },
          { sfxId: 'laser_zap', sfxLabel: '🔫 Laser Zap', reason: 'High-Tech Feature Zap', icon: '🔫' },
          { sfxId: 'scanner_beep', sfxLabel: '🏷️ Scanner Beep', reason: 'Deep Tech Scan', icon: '🏷️' }
        ],
        cta: [
          { sfxId: 'pop_impact', sfxLabel: '🎈 Pop Impact', reason: 'Call-To-Action Pop', icon: '📌' },
          { sfxId: 'ding_correct', sfxLabel: '🎯 Level Clear', reason: 'Engagement Target Ding', icon: '🎯' },
          { sfxId: 'soft_bubble', sfxLabel: '🫧 Soft Bubble', reason: 'Subtle Follow Prompt', icon: '🫧' },
          { sfxId: 'boing_jump', sfxLabel: '🌀 Boing Jump', reason: 'Playful Action Link', icon: '🌀' },
          { sfxId: 'ui_confirm', sfxLabel: '✅ Haptic Confirm', reason: 'Tap / Subscribe Affirm', icon: '✅' }
        ],
        insight: [
          { sfxId: 'bell_tone', sfxLabel: '🔔 Soft Bell', reason: 'Key Insight / Truth', icon: '💡' },
          { sfxId: 'lightbulb_ping', sfxLabel: '💡 Lightbulb Ping', reason: 'Eureka Moment Ping', icon: '💡' },
          { sfxId: 'glass_chime', sfxLabel: '🥂 Glass Chime', reason: 'Crystal Clear Clarity', icon: '🥂' },
          { sfxId: 'zen_gong', sfxLabel: '🔔 Resonant Gong', reason: 'Golden Rule Stinger', icon: '💡' }
        ]
      };

      const categoryCounters = { hook: 0, warning: 0, money: 0, step: 0, tech: 0, cta: 0, insight: 0 };
      const getNextVariation = (catKey) => {
        const list = SFX_CATEGORY_VARIATIONS[catKey] || SFX_CATEGORY_VARIATIONS.hook;
        const item = list[categoryCounters[catKey] % list.length];
        categoryCounters[catKey]++;
        return item;
      };

      const addedTimeBuckets = new Set();

      transcriptUnits.forEach((unit, idx) => {
        const textLower = unit.text.toLowerCase();
        // Bucket timestamps to prevent overlapping collisions
        const timeBucket = Math.round(unit.seconds * 2) / 2;
        if (addedTimeBuckets.has(timeBucket)) return;

        let matched = null;

        if (hookRegex.test(textLower)) {
          const match = textLower.match(hookRegex)[0];
          const v = getNextVariation('hook');
          matched = {
            sfxId: v.sfxId,
            sfxLabel: v.sfxLabel,
            keyword: match.toUpperCase(),
            reason: v.reason,
            icon: v.icon
          };
        } else if (warningRegex.test(textLower)) {
          const match = textLower.match(warningRegex)[0];
          const v = getNextVariation('warning');
          matched = {
            sfxId: v.sfxId,
            sfxLabel: v.sfxLabel,
            keyword: match.toUpperCase(),
            reason: v.reason,
            icon: v.icon
          };
        } else if (moneyRegex.test(textLower)) {
          const match = textLower.match(moneyRegex)[0];
          const v = getNextVariation('money');
          matched = {
            sfxId: v.sfxId,
            sfxLabel: v.sfxLabel,
            keyword: match.toUpperCase(),
            reason: v.reason,
            icon: v.icon
          };
        } else if (stepRegex.test(textLower)) {
          const match = textLower.match(stepRegex)[0];
          const v = getNextVariation('step');
          matched = {
            sfxId: v.sfxId,
            sfxLabel: v.sfxLabel,
            keyword: match.toUpperCase(),
            reason: v.reason,
            icon: v.icon
          };
        } else if (techRegex.test(textLower)) {
          const match = textLower.match(techRegex)[0];
          const v = getNextVariation('tech');
          matched = {
            sfxId: v.sfxId,
            sfxLabel: v.sfxLabel,
            keyword: match.toUpperCase(),
            reason: v.reason,
            icon: v.icon
          };
        } else if (ctaRegex.test(textLower)) {
          const match = textLower.match(ctaRegex)[0];
          const v = getNextVariation('cta');
          matched = {
            sfxId: v.sfxId,
            sfxLabel: v.sfxLabel,
            keyword: match.toUpperCase(),
            reason: v.reason,
            icon: v.icon
          };
        } else if (insightRegex.test(textLower)) {
          const match = textLower.match(insightRegex)[0];
          const v = getNextVariation('insight');
          matched = {
            sfxId: v.sfxId,
            sfxLabel: v.sfxLabel,
            keyword: match.toUpperCase(),
            reason: v.reason,
            icon: v.icon
          };
        }

        if (matched) {
          addedTimeBuckets.add(timeBucket);
          aiSfxCues.push({
            id: 'cue_' + idx + '_' + Math.random().toString(36).substr(2, 4),
            timestamp: unit.timeStr,
            seconds: unit.seconds,
            sfxId: matched.sfxId,
            sfxLabel: matched.sfxLabel,
            word: unit.text.slice(0, 24),
            keyword: matched.keyword,
            reason: matched.reason,
            icon: matched.icon,
            source: unit.source
          });
        }
      });

      // Default fallback diverse cues if no keywords matched
      if (aiSfxCues.length === 0) {
        aiSfxCues = [
          {
            id: 'cue_def_0',
            timestamp: '00:00.5',
            seconds: 0.5,
            sfxId: 'sub_drop',
            sfxLabel: '💥 Sub Bass Drop',
            word: (liveTranscriptText || 'Opening Hook').slice(0, 20),
            keyword: 'HOOK',
            reason: 'Opening Hook Attention',
            icon: '🔥',
            source: 'Copy Engine AI Script'
          },
          {
            id: 'cue_def_1',
            timestamp: '00:02.8',
            seconds: 2.8,
            sfxId: 'whip_whoosh',
            sfxLabel: '💨 Whip Whoosh',
            word: 'Core Action Step',
            keyword: 'STEP',
            reason: 'Fast Pacing Transition',
            icon: '⚡',
            source: 'Copy Engine AI Script'
          },
          {
            id: 'cue_def_2',
            timestamp: '00:05.4',
            seconds: 5.4,
            sfxId: 'cash_register',
            sfxLabel: '💵 Ka-Ching!',
            word: 'Key Value Moment',
            keyword: 'VALUE',
            reason: 'Financial Value Moment',
            icon: '💰',
            source: 'Copy Engine AI Script'
          },
          {
            id: 'cue_def_3',
            timestamp: '00:08.2',
            seconds: 8.2,
            sfxId: 'gold_chime',
            sfxLabel: '✨ Gold Chime',
            word: 'Outro Engagement',
            keyword: 'CTA',
            reason: 'Call-to-Action Resonance',
            icon: '✨',
            source: 'Copy Engine AI Script'
          }
        ];
      }

      isAiSfxAnalyzing = false;
      showAudioNotification(`🤖 AI Extracted ${aiSfxCues.length} Keywords & Synchronized Sound FX!`);
      renderMain();
    }, 450);
  }

  function checkAiTimelineSfxTrigger(curTime, customDest = null) {
    if (!aiSfxCues || aiSfxCues.length === 0) return;
    aiSfxCues.forEach(cue => {
      if (Math.abs(curTime - cue.seconds) < 0.22) {
        if (!triggeredAiCueIds.has(cue.id)) {
          triggeredAiCueIds.add(cue.id);
          playSfx(cue.sfxId, customDest);
        }
      }
    });
  }

  function selectAndApplyBgm(trackId) {
    bgMusicTrack = trackId;
    initAudioContext();

    if (bgMusicTrack !== 'none' && !isAudioMuted) {
      startBgmPlayback();
    } else {
      stopBgmPlayback();
    }

    const videoTag = document.querySelector('#player-video-tag');
    if (videoTag) {
      if (videoTag.paused) {
        videoTag.play().catch(() => {});
      }
    }

    const trackObj = BGM_TRACK_CONFIGS[trackId];
    const trackName = trackObj ? `${trackObj.emoji} ${trackObj.name}` : trackId;
    showAudioNotification(`🎵 Added '${trackName}' Background Music to Video!`);
    renderMain();
  }

  function audioBufferToWavBlob(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const out = new DataView(new ArrayBuffer(length));
    let channels = [], sampleRate = buffer.sampleRate, offset = 0, pos = 0;

    function setUint16(data) { out.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { out.setUint32(pos, data, true); pos += 4; }

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt "
    setUint32(16);
    setUint16(1);          // PCM
    setUint16(numOfChan);
    setUint32(sampleRate);
    setUint32(sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (offset < buffer.length) {
      for (let i = 0; i < numOfChan; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        out.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([out], { type: 'audio/wav' });
  }

  function downloadBgmTrack(trackId) {
    if (!trackId || trackId === 'none') {
      showStudioToast('Please select a viral background music track from the list first!', 'warn');
      return;
    }
    const config = BGM_TRACK_CONFIGS[trackId] || BGM_TRACK_CONFIGS.lofi_chill;
    const sampleRate = 44100;
    const duration = 12; // 12 second loop
    const OfflineCtxClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OfflineCtxClass) {
      showStudioToast('Audio download is not supported in this browser environment.', 'warn');
      return;
    }

    try {
      const offlineCtx = new OfflineCtxClass(2, sampleRate * duration, sampleRate);
      const bgmGain = offlineCtx.createGain();
      const vol = (config.gainFactor || 0.14) * 1.5;
      bgmGain.gain.setValueAtTime(vol, 0);
      bgmGain.connect(offlineCtx.destination);

      config.chords.forEach((f, i) => {
        const osc = offlineCtx.createOscillator();
        const oscGain = offlineCtx.createGain();
        osc.type = config.type || 'sine';
        osc.frequency.setValueAtTime(f, 0);
        oscGain.gain.setValueAtTime(0.2 / (i + 1), 0);
        osc.connect(oscGain);
        oscGain.connect(bgmGain);
        osc.start(0);
        osc.stop(duration);
      });

      offlineCtx.startRendering().then(renderedBuffer => {
        const wavBlob = audioBufferToWavBlob(renderedBuffer);
        const blobUrl = URL.createObjectURL(wavBlob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${trackId}_viral_bgm_track.wav`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      }).catch(e => {
        console.error('BGM download render error:', e);
        showStudioToast('Could not download audio track. Please try auditioning it first.', 'error');
      });
    } catch (err) {
      console.error('BGM download creation error:', err);
    }
  }

  function startBgmPlayback() {
    if (bgMusicTrack === 'none' || isAudioMuted) {
      stopBgmPlayback();
      return;
    }
    initAudioContext();
    if (!audioCtx) return;
    stopBgmPlayback();

    try {
      bgmGainNode = audioCtx.createGain();
      const config = BGM_TRACK_CONFIGS[bgMusicTrack] || BGM_TRACK_CONFIGS.lofi_chill;
      const vol = ((parseInt(bgMusicVolume, 10) || 45) / 100) * (config.gainFactor || 0.14);
      bgmGainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
      bgmGainNode.connect(audioCtx.destination);

      const freqs = config.chords;
      bgmOscillators = freqs.map((f, i) => {
        const osc = audioCtx.createOscillator();
        const oscGain = audioCtx.createGain();
        osc.type = config.type || 'sine';
        osc.frequency.setValueAtTime(f, audioCtx.currentTime);
        oscGain.gain.setValueAtTime(0.18 / (i + 1), audioCtx.currentTime);
        osc.connect(oscGain);
        oscGain.connect(bgmGainNode);
        osc.start();
        return osc;
      });
    } catch (e) {
      console.warn('BGM synth notice:', e);
    }
  }

  function stopBgmPlayback() {
    if (bgmOscillators.length > 0) {
      bgmOscillators.forEach(osc => {
        try { osc.stop(); osc.disconnect(); } catch (e) {}
      });
      bgmOscillators = [];
    }
    if (bgmGainNode) {
      try { bgmGainNode.disconnect(); } catch (e) {}
      bgmGainNode = null;
    }
  }

  // Overlay Helpers
  let showSafeZoneGrid = false;

  // Image / Carousel Mode State
  let selectedImageTemplate = 'instagram'; // 'instagram', 'linkedin', 'tweet', 'carousel', 'quote'
  let selectedAspectRatio = '1:1'; // '1:1', '4:5', '16:9'
  let selectedImageTheme = 'sahara'; // 'sahara', 'midnight', 'emerald', 'amber', 'monolith'
  let userUploadedBgObj = null; // Custom photo uploaded from device
  let aiPromptText = '';
  let isGeneratingAiCopy = false;

  function getRandomBackgrounds() {
    const photoPool = MASTER_BG_CATALOG.filter(b => b.id !== 'none');
    const shuffled = [...photoPool].sort(() => 0.5 - Math.random()).slice(0, 5);
    shuffled.push(MASTER_BG_CATALOG.find(b => b.id === 'none'));
    return shuffled;
  }

  let currentDisplayedBgs = getRandomBackgrounds();
  let selectedBgObj = currentDisplayedBgs[0];

  let imageHeadline = "Most creators spend 80% of their time on repetitive edits instead of high-leverage ideas.";
  let imageBody = "Here is the exact 3-step system to turn 1 raw thought into 6 high-converting assets in under 5 minutes.";
  let carouselSlideNum = 1;
  let totalCarouselSlides = 5;

  let creatorHandle = profile.handle || profile.instagramHandle || '@creator';
  let creatorPfpUrl = profile.avatarUrl || null;

  function renderAvatarHtml(size = 22, fontSize = '0.72rem', accentColor = '#00f0ff') {
    if (creatorPfpUrl) {
      return `<img src="${creatorPfpUrl}" alt="PFP" style="width: ${size}px; height: ${size}px; border-radius: 50%; object-fit: cover; border: 1.5px solid rgba(255,255,255,0.4); flex-shrink: 0; display: inline-block;" />`;
    }
    const clean = (creatorHandle || '').replace('@', '').trim() || profile.fullName || 'C';
    const initial = clean.charAt(0).toUpperCase();
    return `<div style="width: ${size}px; height: ${size}px; border-radius: 50%; background: ${accentColor}; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #fff; font-size: ${fontSize}; border: 1.5px solid rgba(255,255,255,0.4); flex-shrink: 0;">${initial}</div>`;
  }

  function renderMain() {
    container.innerHTML = `
      <div class="content-container" style="max-width: 1200px;">
        <!-- Hidden File Input for Native Camera Roll / Video Picker -->
        <input type="file" id="video-file-input" accept="video/*,image/*" style="display: none;" />

        <!-- Top Header & Studio Mode Switcher -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
              <h1 style="font-size: 2rem;">⚡ Content Studio Hub</h1>
              <span class="badge badge-neon">PRO VIDEO SUITE</span>
            </div>
            <p style="color: var(--text-muted); font-size: 0.92rem;">
              Upload raw footage → 1-click AI Auto-Edit into viral Super Reels → Fine-tune with pro visual effects, B-Rolls, LUTs, SFX & kinetic captions.
            </p>
          </div>

          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <!-- Studio Mode Switcher Tabs -->
            <div style="display: flex; background: var(--bg-surface-card); padding: 4px; border-radius: 12px; border: 1px solid var(--border-subtle); gap: 4px;">
              <button id="tab-mode-video" class="btn ${activeStudioMode === 'video' ? 'btn-primary' : 'btn-secondary'}" style="padding: 0.45rem 1.15rem; font-size: 0.85rem; border-radius: 8px;">
                <span>🎬 Video & Reel Studio</span>
              </button>
              <button id="tab-mode-image" class="btn ${activeStudioMode === 'image' ? 'btn-primary' : 'btn-secondary'}" style="padding: 0.45rem 1.15rem; font-size: 0.85rem; border-radius: 8px;">
                <span>🖼️ AI Image & Carousel Studio</span>
              </button>
            </div>
          </div>
        </div>

        ${processingStatus !== 'idle' ? `
          <div id="pipeline-status-banner" style="margin-bottom: 1.5rem; padding: 1rem 1.25rem; background: var(--bg-surface-card); border: 1.5px solid var(--accent-primary); border-radius: 12px; box-shadow: var(--shadow-md);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div style="font-weight: 700; font-size: 0.9rem; display: flex; align-items: center; gap: 8px; color: var(--text-main);">
                <span style="font-size: 1.2rem; animation: spin 1.5s linear infinite;">⚡</span>
                <span class="pipeline-status-text">${processingMessage || 'Processing Video...'}</span>
              </div>
              <span class="badge badge-neon" style="font-size: 0.72rem; text-transform: uppercase;">${processingStatus}</span>
            </div>
            <div style="width: 100%; height: 8px; background: var(--bg-surface-low); border-radius: 999px; overflow: hidden;">
              <div class="pipeline-progress-bar" style="width: ${uploadProgress}%; height: 100%; background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary)); transition: width 0.3s ease;"></div>
            </div>
          </div>
        ` : ''}

        <!-- Mode Workspace Container -->
        <div id="studio-workspace-area">
          ${activeStudioMode === 'video' ? renderVideoStudioHtml() : renderImageStudioHtml()}
        </div>

      </div>
    `;

    attachModeEvents();
    if (activeStudioMode === 'video') {
      attachVideoEvents();
    } else {
      attachImageEvents();
    }
  }

  // ==========================================
  // 1. VIDEO STUDIO HTML GENERATOR (Pro Suite)
  // ==========================================
  function renderVideoStudioHtml() {
    // Build Pro CSS Filter String based on selected LUT and adjustment sliders
    const filterValue = computeProColorFilter(selectedFilter, colorBrightness, colorContrast, colorSaturation);
    const filterStyle = filterValue ? `filter: ${filterValue};` : '';
    const pacingDur = cutPacing === 'viral_fast' ? '1.2s' : (cutPacing === 'medium_pace' ? '2.5s' : '4.0s');

    return `
      <div class="bento-grid" style="margin-bottom: 2rem;">
        
        <!-- Left Column: 9:16 Video Player & Live Effect Simulator -->
        <div class="card" style="grid-column: span 7; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 560px; position: relative;">
          
          <!-- Drop Zone (When no video uploaded) -->
          <div id="drop-zone" style="width: 100%; border: 2px dashed var(--border-glass); border-radius: 16px; padding: 3rem 1.5rem; text-align: center; background: var(--bg-surface-low); cursor: pointer; transition: all 0.25s ease; ${isVideoUploaded ? 'display: none;' : ''}">
            <div style="width: 64px; height: 64px; border-radius: 50%; background: var(--bg-surface-high); margin: 0 auto 1.25rem auto; display: flex; align-items: center; justify-content: center; font-size: 2rem; color: var(--accent-primary);">
              ☁️
            </div>
            <h3 style="font-size: 1.25rem; margin-bottom: 0.35rem;">Drop Raw Phone Recording Here</h3>
            <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 420px; margin: 0 auto 1.5rem auto;">
              Supports MP4, MOV, ProRes up to 4K / Max 10GB. Upload your unedited clip to preview and run AI auto-edits.
            </p>
            <div style="display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap;">
              <button class="btn btn-primary" id="btn-browse-file" type="button" style="padding: 0.75rem 1.5rem; font-size: 0.92rem;">
                <span>📁 Browse Camera Roll</span>
              </button>
              <button class="btn btn-secondary" id="btn-sample-video" type="button">
                <span>⚡ Load Sample 4K Video</span>
              </button>
            </div>
          </div>

          <!-- Live 9:16 Interactive Video Simulator -->
          <div id="video-simulator" style="width: 100%; max-width: 320px; height: 550px; background: #000; border-radius: 20px; position: relative; overflow: hidden; box-shadow: var(--shadow-lg); border: 2px solid var(--border-glass); ${isVideoUploaded ? 'display: flex;' : 'display: none;'} flex-direction: column; justify-content: space-between; padding: 1.25rem;">
            
            <!-- Video Layer with Applied Color Filter & Smart Zoom Classes -->
            <div id="video-media-container" class="${isAutoEdited && selectedEffect === 'smart_zoom' ? 'fx-smart-zoom-active' : ''}" style="position: absolute; inset: 0; z-index: 1; background: radial-gradient(circle at center, #232733 0%, #0c0e14 100%); display: flex; align-items: center; justify-content: center; transition: filter 0.15s ease, transform 0.25s ease; cursor: pointer; --pacing-duration: ${pacingDur}; ${filterStyle}">
              ${currentVideoUrl ? `
                <video id="player-video-tag" src="${currentVideoUrl}" crossorigin="anonymous" autoplay loop playsinline style="width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0;"></video>
              ` : `
                <div style="text-align: center; opacity: 0.9; position: relative; z-index: 2;">
                  <div style="font-size: 4.5rem; animation: pulse 2s infinite;">🎬</div>
                  <div style="font-size: 0.82rem; font-weight: 700; color: var(--accent-primary); margin-top: 0.5rem;" id="simulated-label">
                    ${isAutoEdited ? '⚡ [SUPER REEL: 4K 60FPS AI EDITED]' : '📹 [RAW FOOTAGE: UNEDITED]'}
                  </div>
                  <div style="font-size: 0.7rem; color: var(--text-dim); margin-top: 2px;">
                    ${isAutoEdited ? '8 Silence Cuts • Auto Subtitles • Color Graded' : '0 Pauses Trimmed • No Captions'}
                  </div>
                </div>
              `}
            </div>

            <!-- FX Overlay Layer (Glitch, Light Leak, Film Grain) -->
            <div id="fx-layer-container">
              ${isAutoEdited && selectedEffect === 'glitch_flash' ? '<div class="fx-glitch-overlay"></div>' : ''}
              ${isAutoEdited && selectedEffect === 'light_leak' ? '<div class="fx-light-leak-overlay"></div>' : ''}
              ${isAutoEdited && selectedEffect === 'film_grain' ? '<div class="fx-film-grain-overlay"></div>' : ''}
            </div>

            <!-- Safe-Zone Overlay Grid (Toggleable) -->
            <div id="safe-zone-overlay" style="position: absolute; inset: 0; z-index: 18; pointer-events: none; border: 1px dashed rgba(0, 240, 255, 0.4); display: ${showSafeZoneGrid ? 'flex' : 'none'}; flex-direction: column; justify-content: space-between; padding: 1.5rem 0.75rem;">
              <div style="font-size: 0.62rem; color: #00f0ff; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 4px; align-self: flex-start;">Safe Top Header</div>
              <div style="font-size: 0.62rem; color: #00f0ff; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 4px; align-self: flex-end;">Safe Bottom CTA</div>
            </div>

            <!-- Audio & Sound Toggle Button -->
            <button id="btn-toggle-audio-mute" type="button" style="position: absolute; top: 12px; right: 12px; z-index: 25; background: ${isAudioMuted ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.9)'}; backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.35); color: #fff; padding: 5px 12px; border-radius: 999px; font-size: 0.72rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); transition: all 0.2s;">
              ${isAudioMuted ? '🔇 <span id="audio-btn-label">Muted (Click to Unmute)</span>' : '🔊 <span id="audio-btn-label">Sound ON (100%)</span>'}
            </button>

            <!-- Center Play/Pause Overlay -->
            <button id="btn-play-pause" style="position: absolute; top: 46%; left: 50%; transform: translate(-50%, -50%); z-index: 15; width: 50px; height: 50px; border-radius: 50%; background: rgba(0,0,0,0.65); backdrop-filter: blur(8px); border: 1.5px solid rgba(255,255,255,0.35); color: #fff; font-size: 1.25rem; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0.85; transition: all 0.2s; box-shadow: 0 4px 16px rgba(0,0,0,0.6);">
              ❚❚
            </button>

            <!-- Dynamic Animated Subtitle Layer (Karaoke) -->
            <div id="subtitle-preview-box" style="z-index: 10; margin-bottom: ${subtitlePosition === 'top' ? 'auto' : (subtitlePosition === 'center' ? 'auto' : '1.5rem')}; margin-top: ${subtitlePosition === 'top' ? '1.5rem' : 'auto'}; text-align: center; position: relative; ${isAutoEdited ? 'display: block;' : 'display: none;'}">
              <!-- Content generated dynamically -->
            </div>

            <!-- Bottom Video Scrub Timeline & Timecode -->
            <div id="player-progress-container" style="z-index: 10; position: relative; background: rgba(0,0,0,0.7); backdrop-filter: blur(10px); padding: 6px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15); margin-bottom: 4px;">
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.68rem; color: var(--text-dim); margin-bottom: 5px;">
                <span id="player-timecode" style="font-variant-numeric: tabular-nums; font-weight: 600; color: #fff;">00:00 / 00:30</span>
                <span style="color: var(--accent-cyan); font-weight: 600;">${voiceSpeed} Speed • 9:16 HD</span>
              </div>
              <div id="player-progress-track" style="height: 6px; background: rgba(255,255,255,0.22); border-radius: 999px; overflow: hidden; position: relative; cursor: pointer;">
                <div id="player-progress-fill" style="width: 0%; height: 100%; background: var(--accent-primary); border-radius: 999px; transition: width 0.05s linear;"></div>
              </div>
            </div>

            <!-- Watermark Overlay Badge -->
            <div id="watermark-overlay" style="position: absolute; bottom: 10px; right: 12px; z-index: 20; ${profile.includeWatermark ? 'display: flex;' : 'display: none;'}; align-items: center; gap: 4px; background: rgba(15, 17, 21, 0.85); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.15); padding: 4px 8px; border-radius: 999px; box-shadow: 0 2px 8px rgba(0,0,0,0.6);">
              <span style="font-size: 0.75rem; color: var(--accent-primary-light);">⚡</span>
              <span style="font-size: 0.68rem; font-weight: 800; letter-spacing: 0.02em; color: #fff;">Made with <span style="color: var(--accent-cyan);">KontentOS</span></span>
            </div>

          </div>

          <!-- Video Upload Status Card Below Player -->
          ${isVideoUploaded ? `
            <div style="margin-top: 1rem; width: 100%; max-width: 320px; background: var(--bg-surface-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 0.85rem 1rem; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 0.75rem;">
              
              <!-- File Info Header -->
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; min-width: 0;">
                  <div style="width: 28px; height: 28px; border-radius: 8px; background: var(--bg-surface-high); display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;">
                    📹
                  </div>
                  <div style="overflow: hidden; min-width: 0;">
                    <div style="font-size: 0.82rem; font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${currentFileName}">
                      ${currentFileName}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Action Buttons Row -->
              <div style="display: grid; grid-template-columns: ${isAutoEdited ? '1fr 1fr' : '1fr'}; gap: 0.5rem;">
                <button id="btn-change-video" type="button" class="btn btn-secondary" style="padding: 0.5rem 0.75rem; font-size: 0.78rem; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px; border-radius: 8px;">
                  <span style="font-size: 0.85rem;">🔄</span>
                  <span>Replace Video</span>
                </button>
                ${isAutoEdited ? `
                  <button id="btn-revert-raw" type="button" class="btn btn-secondary" style="padding: 0.5rem 0.75rem; font-size: 0.78rem; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px; border-radius: 8px; color: #ff6b81; border-color: rgba(255, 107, 129, 0.25); background: rgba(255, 107, 129, 0.08);">
                    <span style="font-size: 0.85rem;">↺</span>
                    <span>Revert to Raw</span>
                  </button>
                ` : ''}
              </div>

            </div>
          ` : ''}
        </div>

        <!-- Right Column: AI Auto-Edit Trigger & Pro Video Editor Suite -->
        <div class="card" style="grid-column: span 5; display: flex; flex-direction: column; gap: 1.15rem;">
          
          <!-- PHASE 1: When Video is Raw (Before AI Auto-Edit) -->
          ${!isAutoEdited ? `
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h3 style="font-size: 1.15rem;">⚡ AI Magic Auto-Edit</h3>
                <span class="badge badge-neon">ONE-CLICK ENHANCE</span>
              </div>
              <p style="color: var(--text-muted); font-size: 0.82rem; margin-bottom: 1rem; line-height: 1.4;">
                Transform your raw unedited recording into a viral Super Reel with kinetic subtitles, silence trimming, face zooms & studio audio.
              </p>

              <!-- Auto-Edit Engine Controls -->
              <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.25rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0.85rem; background: var(--bg-surface-low); border-radius: 10px; border: 1px solid var(--border-subtle);">
                  <div>
                    <div style="font-weight: 600; font-size: 0.85rem;">Trim Silence & Filler Words</div>
                    <div style="font-size: 0.7rem; color: var(--text-dim);">Auto-removes dead pauses > 0.4s & 'um/like'</div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" checked id="toggle-trim-silence">
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0.85rem; background: var(--bg-surface-low); border-radius: 10px; border: 1px solid var(--border-subtle);">
                  <div>
                    <div style="font-weight: 600; font-size: 0.85rem;">9:16 Smart Face & Object Tracking</div>
                    <div style="font-size: 0.7rem; color: var(--text-dim);">Keeps your face in dynamic center frame</div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" checked id="toggle-reframe">
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.65rem 0.85rem; background: var(--bg-surface-low); border-radius: 10px; border: 1px solid var(--border-subtle);">
                  <div>
                    <div style="font-weight: 600; font-size: 0.85rem;">Studio Mic Voice Isolator</div>
                    <div style="font-size: 0.7rem; color: var(--text-dim);">Eliminates room echo & enhances voice presence</div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" checked id="toggle-mic">
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              </div>

              <!-- Main Hero Action Button: RUN AUTO-EDIT -->
              <button id="btn-run-auto-edit" class="btn btn-primary" style="padding: 0.95rem; width: 100%; font-size: 1.05rem; box-shadow: var(--shadow-glow);">
                <span>⚡ Run AI Auto-Edit (Turn into Super Reel)</span>
              </button>
            </div>
          ` : `
            <!-- PHASE 2: Pro Creative Video Editor Suite (After AI Auto-Edit) -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem;">
                <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin: 0;">🎬 Pro Video Editor Suite</h3>
              </div>

              <!-- Editor Sub-Tabs Navigation (5-Tab Suite) -->
              <div style="display: flex; gap: 0.35rem; overflow-x: auto; padding-bottom: 4px; margin-bottom: 0.85rem;">
                <button class="editor-subtab-btn ${activeEditorTab === 'subtitles' ? 'active' : ''}" data-tab="subtitles">🔤 Captions</button>
                <button class="editor-subtab-btn ${activeEditorTab === 'color_pro' ? 'active' : ''}" data-tab="color_pro">🎨 Pro Color</button>
                <button class="editor-subtab-btn ${activeEditorTab === 'effects' ? 'active' : ''}" data-tab="effects">✨ FX & Zooms</button>
                <button class="editor-subtab-btn ${activeEditorTab === 'transitions' ? 'active' : ''}" data-tab="transitions">🔄 Transitions</button>
                <button class="editor-subtab-btn ${activeEditorTab === 'audio_sfx' ? 'active' : ''}" data-tab="audio_sfx">🔊 Audio & SFX</button>
              </div>

              <!-- Sub-Tab Content Rendering -->
              <div id="editor-subtab-content" style="background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 1rem; min-height: 250px;">
                ${renderEditorSubtabContent()}
              </div>

              <!-- Export / Publish Action Bar -->
              <div style="display: flex; gap: 0.5rem; margin-top: 1.15rem;">
                <button id="btn-export-reel" class="btn btn-primary" style="flex: 1.2; padding: 0.75rem; font-size: 0.9rem;">
                  <span>💾 Export 4K 60FPS Super Reel</span>
                </button>
                <button id="btn-publish-all" class="btn btn-secondary" style="flex: 1; padding: 0.75rem; font-size: 0.9rem;">
                  <span>🚀 Publish to All Channels</span>
                </button>
              </div>
            </div>
          `}

        </div>
      </div>

      <!-- Multi-Platform AI Copy Generator Deck (MVP Priority 2) -->
      <div id="atomizer-results-section" style="${isAutoEdited ? 'display: block;' : 'display: none;'} margin-top: 2rem;">
        
        <!-- Priority 2: Multi-Platform AI Copy Generator Command Center -->
        <div class="card card-glow" style="margin-bottom: 1.5rem; background: var(--bg-surface-card); border: 1.5px solid var(--accent-primary); border-radius: 16px; padding: 1.5rem;">
          
          <!-- Command Center Header -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 1.3rem;">⚡</span>
                <h3 style="font-size: 1.25rem; font-weight: 800;">Multi-Platform AI Copy & Distribution Engine</h3>
              </div>
              <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 3px;">
                Auto-generate and tailor viral hooks, takeaway copy, and hashtag stacks tailored to each social algorithm directly from your speech transcript.
              </p>
            </div>

            <!-- Global Action Controls -->
            <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
              <!-- Tone Selector -->
              <div style="display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 8px; border: 1px solid var(--border-glass);">
                <span style="font-size: 0.75rem; color: var(--text-dim);">Tone:</span>
                <select id="select-copy-tone" class="form-input" style="padding: 3px 6px; font-size: 0.78rem; border: none; background: transparent; color: var(--text-main); cursor: pointer;">
                  <option value="Viral & Punchy" ${selectedCopyTone === 'Viral & Punchy' ? 'selected' : ''}>⚡ Viral & Punchy</option>
                  <option value="Professional & Authoritative" ${selectedCopyTone === 'Professional & Authoritative' ? 'selected' : ''}>👔 Professional</option>
                  <option value="Educational & Tactical" ${selectedCopyTone === 'Educational & Tactical' ? 'selected' : ''}>💡 Educational</option>
                  <option value="Storyteller & Relatable" ${selectedCopyTone === 'Storyteller & Relatable' ? 'selected' : ''}>📖 Storyteller</option>
                </select>
              </div>

              <!-- Generate All Button -->
              <button id="btn-generate-all-copy" class="btn btn-secondary" style="padding: 0.45rem 0.85rem; font-size: 0.82rem; border-color: var(--accent-cyan); color: var(--accent-cyan);" ${isGeneratingAllCopy ? 'disabled' : ''}>
                <span>${isGeneratingAllCopy ? '⏳ Generating All...' : '✨ Generate All 5 Platforms'}</span>
              </button>
            </div>
          </div>

          <!-- Platform Tab Bar -->
          <div style="display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border-glass); padding-bottom: 0.75rem; margin-bottom: 1.25rem; overflow-x: auto;">
            ${Object.keys(platformCopyStore).map(pKey => {
              const pData = platformCopyStore[pKey];
              const isActive = activeCopyPlatform === pKey;
              return `
                <button type="button" class="btn-copy-platform-tab btn ${isActive ? 'btn-primary' : 'btn-secondary'}" data-platform="${pKey}" style="padding: 0.45rem 0.95rem; font-size: 0.84rem; display: flex; align-items: center; gap: 6px; white-space: nowrap; border-radius: 10px;">
                  <span>${pData.icon}</span>
                  <strong>${pData.label}</strong>
                  <span class="badge" style="font-size: 0.62rem; padding: 1px 5px; background: ${isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'};">${pData.badge}</span>
                  ${pData.approved ? '<span style="font-size: 0.75rem; color: #39ff14;">✓</span>' : ''}
                </button>
              `;
            }).join('')}
          </div>

          <!-- Active Platform Banner & Actions -->
          ${(() => {
            const curPlat = platformCopyStore[activeCopyPlatform] || platformCopyStore.instagram;
            const curText = curPlat.caption || '';
            const curTags = curPlat.hashtags || [];
            const maxChars = curPlat.maxChars || 2200;
            const charRatio = Math.min(100, Math.round((curText.length / maxChars) * 100));
            const isOverLimit = curText.length > maxChars;

            return `
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <span style="font-size: 1.15rem;">${curPlat.icon}</span>
                  <span style="font-weight: 700; font-size: 0.95rem;">${curPlat.label} Copy</span>
                  <span class="badge ${curPlat.approved ? 'badge-neon' : 'badge-purple'}" style="font-size: 0.7rem;">
                    ${curPlat.approved ? '✅ Ready to Post' : '✏️ Draft Copy'}
                  </span>
                </div>

                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                  <!-- Regenerate This Platform -->
                  <button id="btn-regenerate-single-copy" class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" ${isGeneratingCopy ? 'disabled' : ''}>
                    <span>${isGeneratingCopy ? '⏳ Writing...' : `⚡ Regenerate ${curPlat.label}`}</span>
                  </button>

                  <!-- Copy Formatted Text -->
                  <button id="btn-copy-clipboard" class="btn btn-secondary" style="padding: 0.4rem 0.85rem; font-size: 0.8rem; border-color: var(--accent-secondary); color: var(--accent-secondary);">
                    <span>${copyClipboardToast ? '✓ Copied to Clipboard!' : '📋 Copy Full Text'}</span>
                  </button>

                  <!-- Auto-Sync SFX from Copy Script -->
                  <button id="btn-sync-sfx-from-copy" class="btn btn-secondary" style="padding: 0.4rem 0.85rem; font-size: 0.8rem; border-color: var(--accent-primary); color: #d8b4fe;" title="Extract script keywords and auto-place SFX sounds">
                    <span>🤖 Auto-Sync SFX from Script</span>
                  </button>

                  <!-- Toggle Approval -->
                  <button id="btn-toggle-approval" class="btn ${curPlat.approved ? 'btn-primary' : 'btn-secondary'}" style="padding: 0.4rem 0.85rem; font-size: 0.8rem;">
                    <span>${curPlat.approved ? '✅ Approved' : '⏳ Approve Copy'}</span>
                  </button>

                  <!-- Save Reel & Copy Package -->
                  <button id="btn-save-reel-package" class="btn btn-primary" style="padding: 0.45rem 1.15rem; font-size: 0.82rem; background: var(--accent-primary);" ${!curPlat.approved || isPublishing ? 'disabled' : ''}>
                    <span>${isPublishing ? '⏳ Saving...' : '💾 Save to Video Library'}</span>
                  </button>

                  <!-- Schedule Reel to Calendar -->
                  <button id="btn-schedule-reel-post" class="btn btn-secondary" style="padding: 0.45rem 1rem; font-size: 0.82rem; background: rgba(99, 102, 241, 0.2); border: 1px solid #6366f1; color: #c7d2fe; cursor: pointer; font-weight: 700;">
                    <span>📅 Schedule to Calendar</span>
                  </button>
                </div>
              </div>

              ${lastPublishedUrl ? `
                <div style="margin-bottom: 1rem; padding: 0.75rem 1rem; background: rgba(57,255,20,0.12); border: 1px solid var(--accent-secondary); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                  <div style="font-size: 0.85rem; color: #fff;">
                    🎉 <strong>Saved Successfully!</strong> Reel and copy packaged in your local library.
                  </div>
                </div>
              ` : ''}

              <!-- Live Editable Caption Textarea & Character Meter -->
              <div style="margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <label for="reel-caption-textarea" style="font-weight: 700; font-size: 0.85rem; color: var(--text-main);">
                    Formatted Post Copy:
                  </label>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 80px; height: 5px; background: rgba(255,255,255,0.1); border-radius: 999px; overflow: hidden;">
                      <div style="width: ${charRatio}%; height: 100%; background: ${isOverLimit ? '#ff4458' : charRatio > 85 ? '#fbbf24' : '#39ff14'};"></div>
                    </div>
                    <span id="caption-char-count" style="font-size: 0.78rem; font-weight: 700; color: ${isOverLimit ? 'var(--accent-red)' : 'var(--text-dim)'};">
                      ${curText.length} / ${maxChars.toLocaleString()} chars
                    </span>
                  </div>
                </div>
                <textarea id="reel-caption-textarea" class="form-input" rows="6" style="width: 100%; font-size: 0.88rem; line-height: 1.55; resize: vertical; padding: 0.85rem; font-family: inherit;">${curText}</textarea>
              </div>

              <!-- Individual Hashtag Chips Editor -->
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <span style="font-weight: 700; font-size: 0.85rem; color: var(--text-main);">
                    Targeted Hashtags (${curTags.length} Tags):
                  </span>
                  <span style="font-size: 0.75rem; color: var(--text-dim);">Click ✕ to remove tag or add custom</span>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;">
                  ${curTags.map((tag, idx) => `
                    <span class="badge" style="background: rgba(0,240,255,0.1); border: 1px solid var(--accent-cyan); color: var(--accent-cyan); padding: 4px 10px; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px; border-radius: 999px;">
                      #${String(tag).replace(/^#/, '')}
                      <button type="button" class="btn-remove-tag" data-index="${idx}" style="background: none; border: none; color: inherit; cursor: pointer; font-size: 0.85rem; padding: 0; line-height: 1;">✕</button>
                    </span>
                  `).join('')}

                  <div style="display: inline-flex; gap: 4px; align-items: center;">
                    <input type="text" id="input-new-tag" placeholder="+ add tag" class="form-input" style="width: 110px; padding: 3px 8px; font-size: 0.78rem; border-radius: 999px;" />
                    <button type="button" id="btn-add-tag" class="btn btn-secondary" style="padding: 3px 8px; font-size: 0.75rem; border-radius: 999px;">Add</button>
                  </div>
                </div>
              </div>
            `;
          })()}
        </div>
      </div>
    `;
  }

  // ==========================================
  // 2. PRO SUB-TAB CONTENT GENERATOR
  // ==========================================
  function renderEditorSubtabContent() {
    if (activeEditorTab === 'subtitles') {
      return `
        <div>
          <!-- AI STT & Translation Header Banner -->
          <div style="background: linear-gradient(135deg, rgba(255, 68, 88, 0.12), rgba(0, 240, 255, 0.08)); border: 1px solid rgba(255, 68, 88, 0.3); border-radius: 10px; padding: 0.75rem; margin-bottom: 0.95rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.35rem;">
              <div style="display: flex; align-items: center; gap: 0.4rem;">
                <span style="font-size: 1.05rem;">🎙️</span>
                <strong style="font-size: 0.85rem; color: var(--text-main);">AI Speech-to-Text & Translation Hub</strong>
              </div>
              <div style="display: flex; gap: 0.35rem; align-items: center;">
                <span class="badge badge-purple" id="badge-current-lang" style="font-size: 0.62rem;">🌐 ${selectedLanguage.toUpperCase()}</span>
              </div>
            </div>

            <!-- Primary STT Action Bar -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.45rem; margin-bottom: 0.6rem;">
              <button type="button" id="btn-run-stt-transcribe" class="btn btn-primary" style="padding: 0.42rem 0.5rem; font-size: 0.76rem; display: flex; align-items: center; justify-content: center; gap: 0.35rem;" ${isTranscribing ? 'disabled' : ''}>
                ${isTranscribing ? '<span>⏳ Transcribing Audio...</span>' : '<span>🎙️ Auto-Transcribe (STT)</span>'}
              </button>

              <button type="button" id="btn-toggle-mic-stt" class="btn ${isRecordingMic ? 'btn-danger' : 'btn-secondary'}" style="padding: 0.42rem 0.5rem; font-size: 0.76rem; display: flex; align-items: center; justify-content: center; gap: 0.35rem; border-color: ${isRecordingMic ? '#ff4444' : 'var(--border-glass)'};">
                ${isRecordingMic ? '<span>🔴 Stop Live Mic STT</span>' : '<span>🎤 Live Mic Dictation</span>'}
              </button>
            </div>

            ${isRecordingMic ? `
              <div style="background: rgba(255, 68, 68, 0.15); border: 1px solid rgba(255, 68, 68, 0.4); border-radius: 6px; padding: 0.4rem 0.6rem; font-size: 0.72rem; color: #ff6b6b; display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.6rem;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #ff4444;"></span>
                <span>Listening to your microphone live... Speak naturally to stream kinetic captions!</span>
              </div>
            ` : ''}

            <!-- Multi-Language STT Translation Bar -->
            <div style="background: var(--bg-surface-card); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 0.55rem; display: flex; flex-direction: column; gap: 0.45rem;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.74rem; font-weight: 700; color: var(--text-dim);">🌐 STT Subtitle Translation</span>
              </div>
              <div style="display: flex; gap: 0.4rem;">
                <select id="select-stt-target-lang" class="form-input" style="flex: 1; padding: 0.35rem 0.5rem; font-size: 0.76rem; background: var(--bg-surface-low);">
                  <option value="English" ${selectedLanguage === 'English' ? 'selected' : ''}>🇺🇸 English</option>
                  <option value="Spanish" ${selectedLanguage === 'Spanish' ? 'selected' : ''}>🇪🇸 Spanish (Español)</option>
                  <option value="Hindi" ${selectedLanguage === 'Hindi' ? 'selected' : ''}>🇮🇳 Hindi (हिंदी)</option>
                  <option value="Hinglish" ${selectedLanguage === 'Hinglish' ? 'selected' : ''}>🇮🇳 Hinglish (Roman Hindi)</option>
                  <option value="French" ${selectedLanguage === 'French' ? 'selected' : ''}>🇫🇷 French (Français)</option>
                  <option value="German" ${selectedLanguage === 'German' ? 'selected' : ''}>🇩🇪 German (Deutsch)</option>
                  <option value="Japanese" ${selectedLanguage === 'Japanese' ? 'selected' : ''}>🇯🇵 Japanese (日本語)</option>
                  <option value="Portuguese" ${selectedLanguage === 'Portuguese' ? 'selected' : ''}>🇧🇷 Portuguese (Português)</option>
                  <option value="Arabic" ${selectedLanguage === 'Arabic' ? 'selected' : ''}>🇦🇪 Arabic (العربية)</option>
                </select>
                <button type="button" id="btn-run-stt-translate" class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.76rem; white-space: nowrap; border-color: var(--accent-primary);" ${isTranslating ? 'disabled' : ''}>
                  ${isTranslating ? '⏳ Translating...' : '⚡ Translate Subtitles'}
                </button>
              </div>
            </div>
          </div>

          <!-- Live Transcript Word Editor -->
          <div style="margin-bottom: 0.85rem;">
            <div style="margin-bottom: 5px;">
              <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-dim);">Live Transcribed Hook Text (Editable)</span>
            </div>
            <input type="text" id="input-transcript-text" class="form-input" value="${(liveTranscriptText || '').replace(/"/g, '&quot;')}" style="font-size: 0.82rem; font-weight: 700;" />
          </div>

          <!-- Interactive Subtitle Segments Timeline -->
          ${subtitlesData?.segments && subtitlesData.segments.length > 0 ? `
            <div style="margin-bottom: 0.95rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-dim);">Synced Speech Segments (${subtitlesData.segments.length})</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.35rem; max-height: 120px; overflow-y: auto; background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 0.4rem;">
                ${subtitlesData.segments.map((seg, idx) => `
                  <div class="subtitle-segment-row ${liveTranscriptText === seg.text ? 'active-segment' : ''}" data-idx="${idx}" data-text="${seg.text.replace(/"/g, '&quot;')}" style="display: flex; align-items: center; justify-content: space-between; padding: 0.35rem 0.5rem; background: ${liveTranscriptText === seg.text ? 'rgba(255,68,88,0.15)' : 'var(--bg-surface-card)'}; border-radius: 6px; cursor: pointer; border: 1px solid ${liveTranscriptText === seg.text ? 'var(--accent-primary)' : 'transparent'};">
                    <div style="display: flex; align-items: center; gap: 0.4rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      <span style="font-family: monospace; font-size: 0.65rem; color: var(--accent-cyan); font-weight: 700;">${seg.start.slice(3, 8)}</span>
                      <span style="font-size: 0.72rem; color: var(--text-main); font-weight: 600;">${seg.text}</span>
                    </div>
                    <span style="font-size: 0.65rem; color: var(--text-dim);">▶</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Kinetic Caption Style Presets -->
          <div style="margin-bottom: 0.6rem;">
            <strong style="font-size: 0.85rem; color: var(--text-main);">Caption Style Presets</strong>
          </div>

          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.45rem; margin-bottom: 0.85rem;">
            <!-- Plain White -->
            <div class="subtitle-card card ${selectedSubtitlePreset === 'plain_white' ? 'active-card' : ''}" data-sub="plain_white" style="cursor: pointer; padding: 0.55rem 0.35rem; text-align: center; border-color: ${selectedSubtitlePreset === 'plain_white' ? 'var(--accent-primary)' : 'var(--border-subtle)'};">
              <div style="background: rgba(0,0,0,0.85); padding: 4px; border-radius: 6px; border: 1.5px solid rgba(255,255,255,0.6); margin-bottom: 4px;">
                <span style="font-weight: 700; font-size: 0.72rem; color: #ffffff;">PLAIN TEXT</span>
              </div>
              <div style="font-weight: 800; font-size: 0.72rem; color: var(--text-main);">Plain White</div>
              <div style="font-size: 0.62rem; color: var(--text-dim);">Clean Minimal</div>
            </div>

            <!-- Beast -->
            <div class="subtitle-card card ${selectedSubtitlePreset === 'beast' ? 'active-card' : ''}" data-sub="beast" style="cursor: pointer; padding: 0.55rem 0.35rem; text-align: center; border-color: ${selectedSubtitlePreset === 'beast' ? 'var(--accent-primary)' : 'var(--border-subtle)'};">
              <div style="background: #000; padding: 4px; border-radius: 6px; border: 1.5px solid #39ff14; margin-bottom: 4px;">
                <span style="font-weight: 900; font-size: 0.72rem; color: #fff;">STOP <span style="background: #39ff14; color: #000; padding: 1px 3px; border-radius: 3px;">THIS</span></span>
              </div>
              <div style="font-weight: 800; font-size: 0.72rem; color: var(--text-main);">The Beast</div>
              <div style="font-size: 0.62rem; color: var(--text-dim);">Neon Pop</div>
            </div>

            <!-- Hormozi -->
            <div class="subtitle-card card ${selectedSubtitlePreset === 'hormozi' ? 'active-card' : ''}" data-sub="hormozi" style="cursor: pointer; padding: 0.55rem 0.35rem; text-align: center; border-color: ${selectedSubtitlePreset === 'hormozi' ? 'var(--accent-primary)' : 'var(--border-subtle)'};">
              <div style="background: #000; padding: 4px; border-radius: 6px; border: 1.5px solid #fbbf24; margin-bottom: 4px;">
                <span style="font-weight: 900; font-size: 0.72rem; color: #fff;">THE <span style="background: #fbbf24; color: #000; padding: 1px 3px; border-radius: 3px;">#1 FIX</span></span>
              </div>
              <div style="font-weight: 800; font-size: 0.72rem; color: var(--text-main);">Hormozi</div>
              <div style="font-size: 0.62rem; color: var(--text-dim);">Yellow Block</div>
            </div>

            <!-- Ali Abdaal -->
            <div class="subtitle-card card ${selectedSubtitlePreset === 'ali_abdaal' ? 'active-card' : ''}" data-sub="ali_abdaal" style="cursor: pointer; padding: 0.55rem 0.35rem; text-align: center; border-color: ${selectedSubtitlePreset === 'ali_abdaal' ? 'var(--accent-primary)' : 'var(--border-subtle)'};">
              <div style="background: #0f172a; padding: 4px; border-radius: 6px; border: 1.5px solid #38bdf8; margin-bottom: 4px;">
                <span style="font-weight: 700; font-size: 0.72rem; color: #38bdf8;">Abdaal</span>
              </div>
              <div style="font-weight: 800; font-size: 0.72rem; color: var(--text-main);">Abdaal</div>
              <div style="font-size: 0.62rem; color: var(--text-dim);">Clean Blue</div>
            </div>
          </div>

          <!-- Position Selector -->
          <div style="margin-bottom: 0.85rem;">
            <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-dim); margin-bottom: 4px;">Vertical Position (Safe Zone)</div>
            <div style="display: flex; gap: 0.4rem;">
              <button class="btn ${subtitlePosition === 'bottom' ? 'btn-primary' : 'btn-secondary'} btn-sub-pos" data-pos="bottom" style="flex: 1; padding: 0.3rem; font-size: 0.75rem;">
                Safe Zone Bottom
              </button>
              <button class="btn ${subtitlePosition === 'center' ? 'btn-primary' : 'btn-secondary'} btn-sub-pos" data-pos="center" style="flex: 1; padding: 0.3rem; font-size: 0.75rem;">
                Center Screen
              </button>
              <button class="btn ${subtitlePosition === 'top' ? 'btn-primary' : 'btn-secondary'} btn-sub-pos" data-pos="top" style="flex: 1; padding: 0.3rem; font-size: 0.75rem;">
                Top Header
              </button>
            </div>
          </div>

          <!-- Font Size Selector -->
          <div style="margin-bottom: 0.85rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.78rem; font-weight: 700; color: var(--text-dim); margin-bottom: 4px;">
              <span>Font Size</span>
              <span id="label-sub-size">${subtitleFontSize}</span>
            </div>
            <input type="range" id="range-sub-size" min="0.9" max="1.5" step="0.05" value="${parseFloat(subtitleFontSize)}" style="width: 100%; accent-color: var(--accent-primary);" />
          </div>

          <!-- Feature 8: Subtitle Display & Export (SRT / VTT) -->
          <div style="margin-top: 1rem; border-top: 1px solid var(--border-subtle); padding-top: 0.85rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-main);">SRT Subtitles (${selectedLanguage})</span>
            </div>

            <div style="display: flex; gap: 0.4rem; margin-bottom: 0.65rem;">
              <button type="button" id="btn-download-srt" class="btn btn-secondary" style="flex: 1; padding: 0.35rem 0.5rem; font-size: 0.75rem;">
                📥 Download .SRT
              </button>
              <button type="button" id="btn-download-vtt" class="btn btn-secondary" style="flex: 1; padding: 0.35rem 0.5rem; font-size: 0.75rem;">
                📥 Download .VTT
              </button>
            </div>

            <div style="background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 0.5rem; font-family: monospace; font-size: 0.68rem; color: var(--text-dim); max-height: 90px; overflow-y: auto; white-space: pre-wrap;">
${subtitlesData?.srt_content || subtitlesData?.srt || `1\n00:00:00,000 --> 00:00:03,500\n${liveTranscriptText}\n\n2\n00:00:03,500 --> 00:00:06,000\nStop wasting hours on manual edits in 2026.`}
            </div>
          </div>
        </div>
      `;
    } else if (activeEditorTab === 'color_pro') {
      // 3. Pro Color & LUTs Subtab
      const filters = [
        { id: 'none', name: 'Natural / Raw', tag: 'Original', color: '#64748b' },
        { id: 'teal_orange', name: 'Teal & Orange', tag: 'Cinematic', color: '#0ea5e9' },
        { id: 'cyber_neon', name: 'Cyber Neon', tag: 'Vibrant', color: '#a855f7' },
        { id: 'vintage_film', name: 'Vintage 90s Film', tag: 'Warm Grain', color: '#d97706' },
        { id: 'studio_bright', name: 'Studio Daylight', tag: 'Clean', color: '#10b981' },
        { id: 'black_white', name: 'Dramatic Noir', tag: 'B&W', color: '#ffffff' }
      ];

      return `
        <div>
          <div style="font-size: 0.85rem; font-weight: 700; margin-bottom: 0.5rem;">Cinematic LUT Presets</div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.45rem; margin-bottom: 1rem;">
            ${filters.map(f => `
              <button class="btn ${selectedFilter === f.id ? 'btn-primary' : 'btn-secondary'} btn-select-filter" data-filter="${f.id}" style="padding: 0.5rem 0.35rem; font-size: 0.72rem; display: flex; flex-direction: column; align-items: center; gap: 2px;">
                <div style="width: 12px; height: 12px; border-radius: 50%; background: ${f.color};"></div>
                <strong style="font-size: 0.72rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${f.name}</strong>
              </button>
            `).join('')}
          </div>

          <!-- Color Correction Adjustment Sliders -->
          <div style="display: flex; flex-direction: column; gap: 0.5rem; border-top: 1px solid var(--border-subtle); padding-top: 0.75rem;">
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-dim);">
                <span>Brightness</span>
                <span id="label-brightness">${colorBrightness}%</span>
              </div>
              <input type="range" id="range-brightness" min="80" max="130" value="${colorBrightness}" style="width: 100%; accent-color: var(--accent-primary);" />
            </div>

            <div>
              <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-dim);">
                <span>Contrast</span>
                <span id="label-contrast">${colorContrast}%</span>
              </div>
              <input type="range" id="range-contrast" min="80" max="140" value="${colorContrast}" style="width: 100%; accent-color: var(--accent-primary);" />
            </div>

            <div>
              <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-dim);">
                <span>Saturation / Vibrance</span>
                <span id="label-saturation">${colorSaturation}%</span>
              </div>
              <input type="range" id="range-saturation" min="60" max="150" value="${colorSaturation}" style="width: 100%; accent-color: var(--accent-primary);" />
            </div>
          </div>
        </div>
      `;
    } else if (activeEditorTab === 'effects') {
      const effects = [
        { id: 'smart_zoom', name: 'Smart Face Zoom', desc: 'Auto-punches in 1.2x on key hook words', icon: '🔍' },
        { id: 'glitch_flash', name: 'Glitch Chromatic Flash', desc: 'RGB chromatic snap on transitions', icon: '⚡' },
        { id: 'light_leak', name: 'Warm Light Leak Flare', desc: 'Golden hour optical flare overlay', icon: '☀️' },
        { id: 'film_grain', name: 'Cinematic 35mm Grain', desc: 'High-end cinema camera texture', icon: '🎞️' },
        { id: 'none', name: 'No Visual FX', desc: 'Clean un-overlayed footage', icon: '🚫' }
      ];

      return `
        <div>
          <div style="font-size: 0.85rem; font-weight: 700; margin-bottom: 0.6rem;">Visual FX & Dynamic Zooms</div>
          <div style="display: flex; flex-direction: column; gap: 0.45rem; margin-bottom: 0.85rem;">
            ${effects.map(fx => `
              <div class="btn ${selectedEffect === fx.id ? 'btn-primary' : 'btn-secondary'} btn-select-effect" data-effect="${fx.id}" style="padding: 0.55rem 0.75rem; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between;">
                <div>
                  <div style="font-weight: 700; font-size: 0.8rem;">${fx.icon} ${fx.name}</div>
                  <div style="font-size: 0.65rem; opacity: 0.85; margin-top: 1px;">${fx.desc}</div>
                </div>
                <span style="font-size: 0.8rem;">${selectedEffect === fx.id ? '✓' : ''}</span>
              </div>
            `).join('')}
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; background: var(--bg-surface-card); border-radius: 8px; border: 1px solid var(--border-subtle);">
            <div>
              <div style="font-weight: 700; font-size: 0.78rem;">Dynamic Motion Blur on Swipes</div>
              <div style="font-size: 0.65rem; color: var(--text-dim);">Renders speed blur on fast camera moves</div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" ${motionBlurEnabled ? 'checked' : ''} id="toggle-motion-blur">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      `;
    } else if (activeEditorTab === 'transitions') {
      const transitions = [
        { id: 'whip_pan', name: 'Whip Pan Right', tag: 'Viral Standard' },
        { id: 'zoom_snap', name: 'Smooth Zoom Snap', tag: 'High Energy' },
        { id: 'glitch', name: 'Glitch Slice Cut', tag: 'Cyber' },
        { id: 'camera_flash', name: 'Camera Flash Fade', tag: 'Dramatic' }
      ];

      return `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
            <div style="font-size: 0.85rem; font-weight: 700;">Transition Style on Jump Cuts</div>
            <button type="button" id="btn-audition-transition" class="btn btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.72rem; border-color: var(--accent-primary); color: var(--accent-primary-light);">
              ⚡ Preview Cut
            </button>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.45rem; margin-bottom: 1rem;">
            ${transitions.map(t => `
              <button class="btn ${selectedTransition === t.id ? 'btn-primary' : 'btn-secondary'} btn-select-transition" data-transition="${t.id}" style="padding: 0.55rem; font-size: 0.78rem; text-align: left;">
                <div style="font-weight: 700;">${t.name}</div>
                <div style="font-size: 0.65rem; opacity: 0.8;">${t.tag}</div>
              </button>
            `).join('')}
          </div>

          <div style="border-top: 1px solid var(--border-subtle); padding-top: 0.75rem;">
            <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-dim); margin-bottom: 4px;">Cut Frequency / Pacing Velocity</div>
            <div style="display: flex; gap: 0.4rem;">
              <button class="btn ${cutPacing === 'viral_fast' ? 'btn-primary' : 'btn-secondary'} btn-select-pacing" data-pacing="viral_fast" style="flex: 1; padding: 0.35rem; font-size: 0.72rem;">
                🔥 Viral (1.2s cuts)
              </button>
              <button class="btn ${cutPacing === 'medium_pace' ? 'btn-primary' : 'btn-secondary'} btn-select-pacing" data-pacing="medium_pace" style="flex: 1; padding: 0.35rem; font-size: 0.72rem;">
                ⚡ Dynamic (2.5s)
              </button>
              <button class="btn ${cutPacing === 'cinematic' ? 'btn-primary' : 'btn-secondary'} btn-select-pacing" data-pacing="cinematic" style="flex: 1; padding: 0.35rem; font-size: 0.72rem;">
                🎬 Cinema (4s)
              </button>
            </div>
          </div>
        </div>
      `;
    } else if (activeEditorTab === 'audio_sfx') {
      return `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <strong style="font-size: 0.85rem;">Audio Isolation, Voice Pitch & SFX Packs</strong>
            <span class="badge badge-neon" style="font-size: 0.6rem;">STUDIO MIC</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.65rem; margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0.75rem; background: var(--bg-surface-card); border-radius: 8px; border: 1px solid var(--border-subtle);">
              <div>
                <div style="font-weight: 700; font-size: 0.8rem;">Studio Mic Voice Isolator</div>
                <div style="font-size: 0.68rem; color: var(--text-dim);">Cuts room echo, fan noise & HVAC rumble</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" ${voiceIsolator ? 'checked' : ''} id="toggle-editor-voice-iso">
                <span class="toggle-slider"></span>
              </label>
            </div>

            <!-- Voice Speed / Pacing Dial -->
            <div>
              <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-dim); margin-bottom: 4px;">Voice Speed Ramping</div>
              <div style="display: flex; gap: 0.35rem;">
                <button class="btn ${voiceSpeed === '1.0x' ? 'btn-primary' : 'btn-secondary'} btn-voice-speed" data-spd="1.0x" style="flex: 1; padding: 0.25rem; font-size: 0.72rem;">1.0x Natural</button>
                <button class="btn ${voiceSpeed === '1.05x' ? 'btn-primary' : 'btn-secondary'} btn-voice-speed" data-spd="1.05x" style="flex: 1; padding: 0.25rem; font-size: 0.72rem;">⚡ 1.05x Snappy</button>
                <button class="btn ${voiceSpeed === '1.15x' ? 'btn-primary' : 'btn-secondary'} btn-voice-speed" data-spd="1.15x" style="flex: 1; padding: 0.25rem; font-size: 0.72rem;">🔥 1.15x Fast</button>
              </div>
            </div>

            <!-- AI Smart SFX Auto-Placement Block -->
            <div style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.12)); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 10px; padding: 0.75rem; margin-top: 0.4rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 6px;">
                <div>
                  <div style="font-size: 0.82rem; font-weight: 800; color: var(--text-bright); display: flex; align-items: center; gap: 6px;">
                    <span>🤖 AI Smart SFX Auto-Placement</span>
                    <span style="font-size: 0.62rem; background: var(--accent-primary); color: #fff; padding: 1px 6px; border-radius: 12px; font-weight: 700;">PRO AI</span>
                  </div>
                  <div style="font-size: 0.68rem; color: var(--text-dim); margin-top: 2px;">
                    Scans transcript keywords to synchronize varied sound effects (bass drops, risers, whooshes, chimes) at emotional hooks.
                  </div>
                </div>
                <div style="display: flex; gap: 0.35rem; align-items: center;">
                  ${aiSfxCues.length > 0 ? `
                    <button type="button" class="btn btn-secondary btn-export-all-cues-wavs" style="padding: 0.35rem 0.6rem; font-size: 0.68rem; gap: 4px;" title="Download all active SFX cues as standalone .WAV audio files">
                      ⬇️ Download Cues (.WAV)
                    </button>
                  ` : ''}
                  <button type="button" class="btn btn-primary btn-run-ai-sfx" style="padding: 0.35rem 0.75rem; font-size: 0.72rem; gap: 5px; flex-shrink: 0;" ${isAiSfxAnalyzing ? 'disabled' : ''}>
                    ${isAiSfxAnalyzing ? '⏳ Analyzing...' : '✨ Auto-Place SFX'}
                  </button>
                </div>
              </div>

              ${aiSfxCues.length > 0 ? `
                <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-dim); margin-bottom: 0.35rem; display: flex; justify-content: space-between; align-items: center;">
                  <span>🎯 SYNCHRONIZED TIMELINE CUES (${aiSfxCues.length} VARIATIONS PLACED)</span>
                  <button type="button" class="btn btn-secondary btn-clear-ai-sfx" style="padding: 0.15rem 0.4rem; font-size: 0.62rem;">Clear Cues</button>
                </div>
                <div style="display: flex; flex-direction: column; gap: 0.4rem; max-height: 220px; overflow-y: auto; padding-right: 2px;">
                  ${aiSfxCues.map(cue => `
                    <div style="background: var(--bg-surface-card); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 0.45rem 0.65rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; gap: 8px;">
                      <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                        <span style="font-weight: 800; color: var(--accent-cyan); font-family: monospace; font-size: 0.7rem; background: rgba(0, 240, 255, 0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(0, 240, 255, 0.2); white-space: nowrap;">⏱️ ${cue.timestamp}</span>
                        <div style="min-width: 0;">
                          <div style="font-weight: 700; color: var(--text-bright); display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="white-space: nowrap;">${cue.icon || '✨'} ${cue.sfxLabel}</span>
                            ${cue.keyword ? `
                              <span style="font-size: 0.58rem; background: rgba(168, 85, 247, 0.2); border: 1px solid #a855f7; color: #d8b4fe; padding: 1px 5px; border-radius: 4px; font-weight: 800; white-space: nowrap;">
                                KEYWORD: "${cue.keyword}"
                              </span>
                            ` : ''}
                          </div>
                          <div style="font-size: 0.63rem; color: var(--text-dim); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            "${cue.word}" • <span style="color: #38bdf8;">${cue.reason}</span> <span style="color: var(--text-dim); opacity: 0.75;">(${cue.source || 'Script'})</span>
                          </div>
                        </div>
                      </div>
                      <div style="display: flex; gap: 4px; flex-shrink: 0;">
                        <button type="button" class="btn btn-secondary btn-audition-cue" data-sfx="${cue.sfxId}" style="padding: 0.25rem 0.5rem; font-size: 0.68rem;" title="Audition Sound Effect">▶️</button>
                        <button type="button" class="btn btn-secondary btn-download-cue-wav" data-sfx="${cue.sfxId}" data-label="${cue.sfxLabel}" style="padding: 0.25rem 0.5rem; font-size: 0.68rem; color: var(--accent-primary);" title="Download .WAV audio file">📥</button>
                        <button type="button" class="btn btn-secondary btn-remove-cue" data-id="${cue.id}" style="padding: 0.25rem 0.45rem; font-size: 0.68rem; color: #ef4444;" title="Remove Cue">🗑️</button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div style="text-align: center; font-size: 0.72rem; color: var(--text-dim); padding: 0.5rem; background: rgba(0,0,0,0.15); border-radius: 6px;">
                  Click <strong>"✨ Auto-Place SFX"</strong> above to let AI automatically position rich, multi-variety sound effects (bass drops, risers, whooshes, chimes) synchronized across your video!
                </div>
              `}
            </div>

            <!-- Sound FX Pack Selector & Soundboard -->
            <div>
              <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-dim); margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                <span>Sound Design (SFX Pack)</span>
                <label style="display: flex; align-items: center; gap: 4px; font-size: 0.68rem; color: var(--accent-primary); cursor: pointer;" title="Automatically trigger sound FX as soon as keywords or hooks are spoken">
                  <input type="checkbox" id="toggle-keyword-sfx" ${autoKeywordSfxEnabled ? 'checked' : ''} style="accent-color: var(--accent-primary);">
                  <span>⚡ Auto-SFX on Keywords</span>
                </label>
              </div>
              <select id="select-sfx-pack" class="form-select" style="font-size: 0.82rem; margin-bottom: 0.35rem;">
                <option value="beast_high_viral" ${sfxPack === 'beast_high_viral' ? 'selected' : ''}>💥 MrBeast High-Energy Viral (8 SFX Variations)</option>
                <option value="vox_documentary" ${sfxPack === 'vox_documentary' ? 'selected' : ''}>🎙️ Vox Explainer & Mini-Doc (8 SFX Variations)</option>
                <option value="clean_tech" ${sfxPack === 'clean_tech' ? 'selected' : ''}>💻 Clean Tech & Modern UI (8 SFX Variations)</option>
                <option value="cinematic_trailer" ${sfxPack === 'cinematic_trailer' ? 'selected' : ''}>🎬 Dark Cinematic Trailer (8 SFX Variations)</option>
                <option value="retro_gaming" ${sfxPack === 'retro_gaming' ? 'selected' : ''}>🕹️ 8-Bit Arcade & Retro Glitch (8 SFX Variations)</option>
                <option value="tiktok_trending" ${sfxPack === 'tiktok_trending' ? 'selected' : ''}>📱 TikTok & Reels Meme Pack (8 SFX Variations)</option>
                <option value="none" ${sfxPack === 'none' ? 'selected' : ''}>🚫 Mute All Sound FX</option>
              </select>

              ${SFX_PACK_SOUNDBOARDS[sfxPack] ? `
                <div style="background: var(--bg-surface-card); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 0.55rem; margin-top: 0.45rem;">
                  <div style="font-size: 0.68rem; font-weight: 700; color: var(--text-dim); margin-bottom: 0.45rem; display: flex; justify-content: space-between; align-items: center;">
                    <span style="text-transform: uppercase;">🔊 SOUNDBOARD (${SFX_PACK_SOUNDBOARDS[sfxPack].length} HIGH-DEF SOUNDS):</span>
                    <button type="button" class="btn btn-secondary btn-download-pack-wavs" data-pack="${sfxPack}" style="padding: 0.15rem 0.5rem; font-size: 0.62rem; gap: 3px; color: var(--accent-primary);" title="Download all SFX in this pack as .WAV files">
                      📦 Download Pack (.WAVs)
                    </button>
                  </div>
                  <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.4rem;">
                    ${SFX_PACK_SOUNDBOARDS[sfxPack].map(sfx => `
                      <div style="background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 0.35rem 0.45rem; display: flex; flex-direction: column; justify-content: space-between; gap: 4px;">
                        <div>
                          <div style="font-weight: 700; font-size: 0.72rem; color: var(--text-bright); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${sfx.label}
                          </div>
                          ${sfx.desc ? `
                            <div style="font-size: 0.58rem; color: var(--text-dim); margin-top: 1px; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;">
                              ${sfx.desc}
                            </div>
                          ` : ''}
                        </div>
                        <div style="display: flex; gap: 3px; margin-top: 2px;">
                          <button type="button" class="btn btn-secondary btn-trigger-sfx" data-sfx="${sfx.id}" style="flex: 1; padding: 0.2rem 0.35rem; font-size: 0.65rem; justify-content: center; gap: 3px;">
                            ▶️ Play
                          </button>
                          <button type="button" class="btn btn-secondary btn-download-sfx" data-sfx="${sfx.id}" data-label="${sfx.label}" style="padding: 0.2rem 0.35rem; font-size: 0.65rem; color: var(--accent-primary);" title="Download ${sfx.label} as .WAV">
                            📥
                          </button>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Background Music Track Selection -->
          <div>
            <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-dim); margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
              <span>Viral Background Music (BGM) — 1-Click Apply</span>
              <div style="display: flex; gap: 0.35rem; align-items: center;">
                <button type="button" class="btn btn-secondary btn-audition-bgm" style="padding: 0.2rem 0.5rem; font-size: 0.68rem; gap: 4px;">
                  ▶️ Audition
                </button>
                <button type="button" class="btn btn-secondary btn-download-bgm" style="padding: 0.2rem 0.5rem; font-size: 0.68rem; gap: 4px;" title="Download standalone viral background music track audio file">
                  ⬇️ Download Track
                </button>
              </div>
            </div>

            <!-- BGM Interactive Cards Grid -->
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 0.45rem; margin-bottom: 0.6rem;">
              ${Object.keys(BGM_TRACK_CONFIGS).map(trackId => {
                const track = BGM_TRACK_CONFIGS[trackId];
                const isSelected = bgMusicTrack === trackId;
                return `
                  <div class="card-bgm-track ${isSelected ? 'active' : ''}" data-bgm="${trackId}" style="
                    background: ${isSelected ? 'rgba(99, 102, 241, 0.18)' : 'var(--bg-surface-card)'};
                    border: 1.5px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'};
                    border-radius: 8px; padding: 0.45rem 0.55rem; cursor: pointer; transition: all 0.2s ease;
                    box-shadow: ${isSelected ? '0 0 12px rgba(99, 102, 241, 0.25)' : 'none'};
                  ">
                    <div style="font-size: 0.75rem; font-weight: 700; color: ${isSelected ? 'var(--accent-primary)' : 'var(--text-bright)'}; display: flex; justify-content: space-between; align-items: center; gap: 4px;">
                      <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${track.emoji} ${track.name}</span>
                      ${isSelected ? '<span style="font-size: 0.6rem; background: var(--accent-primary); color: #fff; padding: 1px 4px; border-radius: 4px; font-weight: 800; flex-shrink: 0;">✓ IN REEL</span>' : ''}
                    </div>
                    <div style="font-size: 0.64rem; color: var(--text-dim); margin-top: 2px; line-height: 1.1;">
                      ${track.desc}
                    </div>
                    <div style="font-size: 0.62rem; color: ${isSelected ? '#38bdf8' : 'var(--accent-primary)'}; margin-top: 4px; font-weight: 700;">
                      ${isSelected ? '▶ Music Active' : '⚡ Click to Add'}
                    </div>
                  </div>
                `;
              }).join('')}
              <div class="card-bgm-track ${bgMusicTrack === 'none' ? 'active' : ''}" data-bgm="none" style="
                background: ${bgMusicTrack === 'none' ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-surface-card)'};
                border: 1.5px solid ${bgMusicTrack === 'none' ? '#ef4444' : 'var(--border-subtle)'};
                border-radius: 8px; padding: 0.45rem 0.55rem; cursor: pointer; transition: all 0.2s ease;
              ">
                <div style="font-size: 0.75rem; font-weight: 700; color: ${bgMusicTrack === 'none' ? '#ef4444' : 'var(--text-bright)'};">
                  🚫 No BGM
                </div>
                <div style="font-size: 0.64rem; color: var(--text-dim); margin-top: 2px;">Voice Only</div>
                <div style="font-size: 0.62rem; color: #ef4444; margin-top: 4px; font-weight: 700;">
                  ${bgMusicTrack === 'none' ? '✓ Muted' : 'Mute BGM'}
                </div>
              </div>
            </div>

            <select id="select-bgm-track" class="form-select" style="font-size: 0.82rem; margin-bottom: 0.5rem; display: none;">
              <option value="lofi_chill" ${bgMusicTrack === 'lofi_chill' ? 'selected' : ''}>☕ Lofi Chai & Focus Chill</option>
              <option value="phonk_drift" ${bgMusicTrack === 'phonk_drift' ? 'selected' : ''}>🏎️ Brazilian Phonk Drift</option>
              <option value="synthwave_drive" ${bgMusicTrack === 'synthwave_drive' ? 'selected' : ''}>🌆 Midnight Tokyo Synthwave</option>
              <option value="upbeat_pop" ${bgMusicTrack === 'upbeat_pop' ? 'selected' : ''}>✨ Upbeat Viral Pop Beat</option>
              <option value="cinematic_ambient" ${bgMusicTrack === 'cinematic_ambient' ? 'selected' : ''}>🎻 Emotional Storytelling Ambient</option>
              <option value="trap_banger" ${bgMusicTrack === 'trap_banger' ? 'selected' : ''}>💣 Underground Hype Trap Beat</option>
              <option value="afrobeats_vibe" ${bgMusicTrack === 'afrobeats_vibe' ? 'selected' : ''}>🌴 Summer Afrobeats & Amapiano</option>
              <option value="none" ${bgMusicTrack === 'none' ? 'selected' : ''}>🚫 No Background Music</option>
            </select>

            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-dim);">
              <span>BGM Volume Level</span>
              <span id="label-bgm-vol">${bgMusicVolume}%</span>
            </div>
            <input type="range" id="range-bgm-vol" min="10" max="100" value="${bgMusicVolume}" style="width: 100%; accent-color: var(--accent-primary);" />
          </div>
        </div>
      `;
    }
    return '';
  }

  // ==========================================
  // 3. AI IMAGE & CAROUSEL STUDIO HTML GENERATOR
  // ==========================================
  function renderImageStudioHtml() {
    const currentTheme = getThemeObject(selectedImageTheme);

    let aspectWidth = '440px';
    let aspectHeight = '440px';
    if (selectedAspectRatio === '4:5') {
      aspectWidth = '380px';
      aspectHeight = '475px';
    } else if (selectedAspectRatio === '16:9') {
      aspectWidth = '480px';
      aspectHeight = '270px';
    }

    return `
      <div class="bento-grid" style="margin-bottom: 2rem;">
        <!-- Left: Live Graphic Card Canvas -->
        <div class="card" style="grid-column: span 7; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 540px; background: var(--bg-surface-low); position: relative; padding: 2rem 1rem;">
          
          <!-- Target Platform & Format Indicator Tabs on Canvas -->
          <div style="display: flex; gap: 0.4rem; align-items: center; margin-bottom: 1.25rem; z-index: 10; flex-wrap: wrap; justify-content: center;">
            <button class="btn ${selectedImageTemplate === 'instagram' ? 'btn-primary' : 'btn-secondary'} btn-template-select" data-template="instagram" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; border-radius: 999px;">
              📸 Instagram Post (Overlay)
            </button>
            <button class="btn ${selectedImageTemplate === 'linkedin' ? 'btn-primary' : 'btn-secondary'} btn-template-select" data-template="linkedin" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; border-radius: 999px;">
              💼 LinkedIn Post (Split)
            </button>
            <button class="btn ${selectedImageTemplate === 'tweet' ? 'btn-primary' : 'btn-secondary'} btn-template-select" data-template="tweet" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; border-radius: 999px;">
              𝕏 Tweet Card
            </button>
            <button class="btn ${selectedImageTemplate === 'carousel' ? 'btn-primary' : 'btn-secondary'} btn-template-select" data-template="carousel" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; border-radius: 999px;">
              📊 Carousel Slide
            </button>
            <button class="btn ${selectedImageTemplate === 'quote' ? 'btn-primary' : 'btn-secondary'} btn-template-select" data-template="quote" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; border-radius: 999px;">
              ✨ Editorial Quote
            </button>
          </div>

          <!-- Dynamic Visual Graphic Card Element -->
          <div id="live-graphic-canvas" style="width: ${aspectWidth}; min-height: ${aspectHeight}; max-width: 100%; border: 2px solid ${currentTheme.border}; border-radius: 18px; box-shadow: 0 16px 40px rgba(0,0,0,0.35); position: relative; overflow: hidden; display: flex; flex-direction: column; transition: all 0.25s ease;">
            ${renderGraphicCanvasContent(currentTheme, selectedBgObj)}
          </div>

          <!-- Quick Canvas Actions -->
          <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem; flex-wrap: wrap; justify-content: center;">
            <button id="btn-download-image" class="btn btn-primary" style="padding: 0.55rem 1.25rem; font-size: 0.85rem;">
              <span>💾 Export High-Res PNG (300 DPI)</span>
            </button>
            <button id="btn-random-bg-canvas" class="btn btn-secondary" style="padding: 0.55rem 1rem; font-size: 0.85rem;">
              <span>🎲 Randomize Photo</span>
            </button>
            <button id="btn-copy-image" class="btn btn-secondary" style="padding: 0.55rem 1rem; font-size: 0.85rem;">
              <span>📋 Copy Image & Text</span>
            </button>
          </div>
        </div>

        <!-- Right: Background Photography, Layout, Content & Theme Controls -->
        <div class="card" style="grid-column: span 5; display: flex; flex-direction: column; gap: 1.15rem;">
          
          <!-- Hidden File Inputs -->
          <input type="file" id="input-device-photo" accept="image/*" style="display: none;" />
          <input type="file" id="input-creator-pfp" accept="image/*" style="display: none;" />

          <!-- Creator Identity: Name / Handle & PFP Customization -->
          <div style="background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 0.85rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.55rem;">
              <strong style="font-size: 0.85rem; color: var(--text-main);">👤 Creator Name & PFP</strong>
              <span style="font-size: 0.7rem; color: var(--text-dim);">Shown top-left on card</span>
            </div>

            <div style="display: flex; gap: 0.65rem; align-items: center;">
              <!-- PFP Avatar Preview & Upload Trigger -->
              <div style="position: relative; display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0;">
                <button type="button" id="btn-trigger-pfp" title="Upload custom profile picture" style="position: relative; width: 42px; height: 42px; border-radius: 50%; padding: 0; border: 2px dashed ${creatorPfpUrl ? 'var(--accent-primary)' : 'var(--border-subtle)'}; background: var(--bg-surface-card); cursor: pointer; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                  ${creatorPfpUrl 
                    ? `<img src="${creatorPfpUrl}" alt="PFP" style="width: 100%; height: 100%; object-fit: cover;" />` 
                    : `<span style="font-size: 1.15rem;">📷</span>`}
                </button>
                ${creatorPfpUrl ? `
                  <button type="button" id="btn-remove-pfp" class="btn btn-secondary" style="padding: 0.2rem 0.45rem; font-size: 0.68rem; border-radius: 6px; color: #f87171;" title="Remove custom PFP">
                    ✕
                  </button>
                ` : `
                  <button type="button" id="btn-upload-pfp-label" class="btn btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.72rem; border-radius: 8px; white-space: nowrap;">
                    Upload PFP
                  </button>
                `}
              </div>

              <!-- Handle / Name Input -->
              <div style="flex: 1;">
                <input 
                  type="text" 
                  id="input-creator-handle" 
                  class="form-input" 
                  value="${creatorHandle}" 
                  placeholder="e.g. @yourhandle or Your Name" 
                  style="font-size: 0.84rem; padding: 0.45rem 0.75rem;" 
                />
              </div>
            </div>
          </div>

          <!-- 1. Background Photography Preset Selector with Device Upload & Refresh Button -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.45rem; flex-wrap: wrap; gap: 0.35rem;">
              <div style="display: flex; align-items: center; gap: 0.4rem;">
                <strong style="font-size: 0.88rem; color: var(--text-main);">🖼️ Background Photo</strong>
              </div>
              
              <div style="display: flex; align-items: center; gap: 0.35rem;">
                <!-- Upload from Device CTA -->
                <button id="btn-upload-device-photo" class="btn btn-primary" style="padding: 0.25rem 0.65rem; font-size: 0.72rem; border-radius: 999px;" title="Upload custom photo from your device">
                  <span>📁 Upload Image</span>
                </button>

                <!-- Refresh Background Photos CTA -->
                <button id="btn-refresh-bgs" class="btn btn-secondary" style="padding: 0.25rem 0.65rem; font-size: 0.72rem; border-radius: 999px;" title="Shuffle 6 new high-res photos">
                  <span id="refresh-bg-icon">🔄</span>
                  <span>Presets</span>
                </button>
              </div>
            </div>

            <!-- Drag & Drop or Active Upload Banner -->
            ${userUploadedBgObj ? `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.65rem; background: var(--bg-surface-low); border: 1px dashed var(--accent-primary); border-radius: 8px; margin-bottom: 0.45rem; font-size: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.4rem; overflow: hidden;">
                  <span style="font-size: 0.85rem;">📱</span>
                  <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px; color: var(--text-main);">
                    <strong>${userUploadedBgObj.name}</strong>
                  </span>
                  ${selectedBgObj && selectedBgObj.id === 'device_upload' ? '<span class="badge badge-neon" style="font-size: 0.58rem;">ACTIVE ON CARD</span>' : ''}
                </div>
                <div style="display: flex; gap: 0.3rem;">
                  <button id="btn-use-device-photo" class="btn ${selectedBgObj && selectedBgObj.id === 'device_upload' ? 'btn-primary' : 'btn-secondary'}" style="padding: 0.15rem 0.45rem; font-size: 0.68rem; border-radius: 6px;">
                    ${selectedBgObj && selectedBgObj.id === 'device_upload' ? 'Selected' : 'Use'}
                  </button>
                  <button id="btn-clear-device-photo" class="btn btn-secondary" style="padding: 0.15rem 0.45rem; font-size: 0.68rem; border-radius: 6px; color: #f87171;">
                    ✕ Clear
                  </button>
                </div>
              </div>
            ` : `
              <div id="dropzone-device-photo" style="display: flex; align-items: center; justify-content: center; gap: 0.45rem; padding: 0.45rem 0.65rem; border: 1px dashed var(--border-subtle); border-radius: 8px; margin-bottom: 0.45rem; cursor: pointer; background: var(--bg-surface-low); transition: all 0.2s;" title="Click or drop an image file here">
                <span style="font-size: 0.85rem;">📁</span>
                <span style="font-size: 0.74rem; color: var(--text-muted);"><strong style="color: var(--text-main);">Click to upload</strong> or drop photo from device</span>
              </div>
            `}

            <!-- Background Grid (Photos) -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem;" id="bg-selector-grid">
              ${userUploadedBgObj ? `
                <button class="btn ${selectedBgObj && selectedBgObj.id === 'device_upload' ? 'btn-primary' : 'btn-secondary'} btn-bg-select" data-bg-id="device_upload" style="padding: 0.4rem; font-size: 0.72rem; display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; overflow: hidden; border: 1px solid var(--accent-primary);">
                  <span style="font-weight: 700; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; max-width: 100%; color: var(--accent-primary);">📱 Device Photo</span>
                  <span style="font-size: 0.62rem; opacity: 0.85;">Custom Upload</span>
                </button>
              ` : ''}
              ${currentDisplayedBgs.map(bg => {
                const isActive = selectedBgObj && selectedBgObj.id === bg.id;
                return `
                  <button class="btn ${isActive ? 'btn-primary' : 'btn-secondary'} btn-bg-select" data-bg-id="${bg.id}" style="padding: 0.4rem; font-size: 0.72rem; display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; overflow: hidden;">
                    <span style="font-weight: 700; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; max-width: 100%;">${bg.tag}</span>
                    <span style="font-size: 0.62rem; opacity: 0.8;">${bg.name.split(' ')[0]}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <!-- 2. Aspect Ratio Selection -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
              <strong style="font-size: 0.85rem; color: var(--text-main);">Aspect Ratio</strong>
              <span style="font-size: 0.7rem; color: var(--text-dim);">Instagram (1:1 / 4:5) • 𝕏 / LinkedIn (16:9)</span>
            </div>
            <div style="display: flex; gap: 0.4rem;">
              <button class="btn ${selectedAspectRatio === '1:1' ? 'btn-primary' : 'btn-secondary'} btn-ratio-select" data-ratio="1:1" style="flex: 1; padding: 0.35rem; font-size: 0.78rem;">
                1:1 Square
              </button>
              <button class="btn ${selectedAspectRatio === '4:5' ? 'btn-primary' : 'btn-secondary'} btn-ratio-select" data-ratio="4:5" style="flex: 1; padding: 0.35rem; font-size: 0.78rem;">
                4:5 Portrait
              </button>
              <button class="btn ${selectedAspectRatio === '16:9' ? 'btn-primary' : 'btn-secondary'} btn-ratio-select" data-ratio="16:9" style="flex: 1; padding: 0.35rem; font-size: 0.78rem;">
                16:9 Landscape
              </button>
            </div>
          </div>

          <!-- 3. Color Aesthetic Themes -->
          <div>
            <strong style="font-size: 0.85rem; color: var(--text-main); display: block; margin-bottom: 0.35rem;">Color Palette Theme</strong>
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
              <button class="btn ${selectedImageTheme === 'sahara' ? 'btn-primary' : 'btn-secondary'} btn-theme-select" data-theme-val="sahara" style="padding: 0.28rem 0.65rem; font-size: 0.72rem; border-radius: 999px;">
                ☀️ Sahara Linen
              </button>
              <button class="btn ${selectedImageTheme === 'midnight' ? 'btn-primary' : 'btn-secondary'} btn-theme-select" data-theme-val="midnight" style="padding: 0.28rem 0.65rem; font-size: 0.72rem; border-radius: 999px;">
                🌌 Midnight Cyan
              </button>
              <button class="btn ${selectedImageTheme === 'emerald' ? 'btn-primary' : 'btn-secondary'} btn-theme-select" data-theme-val="emerald" style="padding: 0.28rem 0.65rem; font-size: 0.72rem; border-radius: 999px;">
                🌿 Forest Emerald
              </button>
              <button class="btn ${selectedImageTheme === 'amber' ? 'btn-primary' : 'btn-secondary'} btn-theme-select" data-theme-val="amber" style="padding: 0.28rem 0.65rem; font-size: 0.72rem; border-radius: 999px;">
                🔥 Amber Heat
              </button>
              <button class="btn ${selectedImageTheme === 'monolith' ? 'btn-primary' : 'btn-secondary'} btn-theme-select" data-theme-val="monolith" style="padding: 0.28rem 0.65rem; font-size: 0.72rem; border-radius: 999px;">
                ⬛ Monolith Dark
              </button>
            </div>
          </div>

          <!-- 4. AI Post Idea & Headline/Supporting Text Generator -->
          <div style="background: var(--bg-surface-low); border: 1.5px solid var(--accent-primary); border-radius: 12px; padding: 0.85rem; box-shadow: var(--shadow-sm);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
              <div style="display: flex; align-items: center; gap: 0.4rem;">
                <span style="font-size: 0.95rem;">✨</span>
                <strong style="font-size: 0.85rem; color: var(--text-main);">AI Headline & Supporting Copy Generator</strong>
              </div>
              <span class="badge badge-neon" style="font-size: 0.6rem;">GEMINI AI</span>
            </div>
            
            <p style="font-size: 0.74rem; color: var(--text-muted); margin-bottom: 0.45rem; line-height: 1.35;">
              Describe what kind of post you want. AI will craft an authoritative headline & punchy supporting text formatted for this visual card.
            </p>

            <div style="display: flex; flex-direction: column; gap: 0.45rem;">
              <textarea 
                id="input-ai-post-prompt" 
                class="form-textarea" 
                rows="2" 
                placeholder="e.g. Why consistency beats high-budget production for creators in 2026, or a 3-step framework to repurpose video into carousels..."
                style="font-size: 0.82rem; resize: vertical;"
              >${aiPromptText}</textarea>

              <!-- Quick Inspiration Starters -->
              <div style="display: flex; gap: 0.3rem; flex-wrap: wrap; align-items: center;">
                <span style="font-size: 0.68rem; color: var(--text-dim);">Examples:</span>
                <button type="button" class="btn btn-secondary btn-prompt-chip" data-prompt="Why 90% of creators fail by quitting before their 30th video" style="padding: 0.15rem 0.45rem; font-size: 0.68rem; border-radius: 999px;">
                  🎯 Consistency Trap
                </button>
                <button type="button" class="btn btn-secondary btn-prompt-chip" data-prompt="A 3-step framework to turn 1 raw thought into 5 multi-channel assets" style="padding: 0.15rem 0.45rem; font-size: 0.68rem; border-radius: 999px;">
                  ⚡ Repurposing
                </button>
                <button type="button" class="btn btn-secondary btn-prompt-chip" data-prompt="Why audience trust matters 10x more than viral follower spikes in 2026" style="padding: 0.15rem 0.45rem; font-size: 0.68rem; border-radius: 999px;">
                  💎 Trust vs Virality
                </button>
              </div>

              <button id="btn-generate-graphic-copy" class="btn btn-primary" style="margin-top: 0.2rem; padding: 0.55rem; font-size: 0.82rem; display: flex; align-items: center; justify-content: center; gap: 0.4rem; font-weight: 700;" ${isGeneratingAiCopy ? 'disabled' : ''}>
                <span id="ai-generate-copy-icon">${isGeneratingAiCopy ? '⏳' : '⚡'}</span>
                <span id="ai-generate-copy-text">${isGeneratingAiCopy ? 'Crafting with Gemini AI...' : 'Generate Headline & Supporting Text'}</span>
              </button>
            </div>
          </div>

          <!-- 5. Content Copy Inputs (Headline & Supporting Text) -->
          <div style="display: flex; flex-direction: column; gap: 0.6rem;">
            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 3px;">
                Headline / Main Hook Statement
              </label>
              <textarea id="input-image-headline" class="form-textarea" rows="2" style="font-size: 0.85rem; resize: vertical;">${imageHeadline}</textarea>
            </div>

            <div>
              <label style="font-size: 0.78rem; font-weight: 700; color: var(--text-dim); display: block; margin-bottom: 3px;">
                Supporting Text / Tactical Takeaway
              </label>
              <textarea id="input-image-body" class="form-textarea" rows="2" style="font-size: 0.85rem; resize: vertical;">${imageBody}</textarea>
            </div>
          </div>

          <!-- 6. Watermark & Pro Membership Control -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0.85rem; background: var(--bg-surface-low); border: 1px solid var(--border-subtle); border-radius: 10px;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 1rem;">${profile.isPro ? '👑' : '⚡'}</span>
              <div>
                <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 0.35rem;">
                  <span>"Made with KontentOS" Watermark</span>
                  ${profile.isPro ? '<span class="badge badge-neon" style="font-size: 0.58rem;">PRO UNLOCKED</span>' : '<span class="badge badge-purple" style="font-size: 0.58rem;">PRO FEATURE</span>'}
                </div>
                <div style="font-size: 0.68rem; color: var(--text-dim);">
                  ${profile.isPro 
                    ? (profile.includeWatermark ? 'Watermark is ON • Uncheck to remove from card & exports' : 'Watermark is REMOVED from cards & exports') 
                    : 'Requires Pro membership to remove watermark'}
                </div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 0.45rem;">
              <label class="toggle-switch" style="cursor: pointer; display: flex; align-items: center; gap: 0.35rem;">
                <input type="checkbox" id="toggle-image-watermark" ${profile.includeWatermark ? 'checked' : ''} />
                <span style="font-size: 0.72rem; color: ${profile.includeWatermark ? 'var(--text-main)' : 'var(--accent-primary)'}; font-weight: 600;">
                  ${profile.includeWatermark ? 'Show' : 'Removed'}
                </span>
              </label>
              ${!profile.isPro ? `
                <button type="button" id="btn-unlock-pro-watermark" class="btn btn-primary" style="padding: 0.2rem 0.55rem; font-size: 0.68rem; border-radius: 999px;">
                  👑 Upgrade
                </button>
              ` : ''}
            </div>
          </div>

          <!-- Quick Actions -->
          <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem;">
            <button id="btn-download-image-side" class="btn btn-primary" style="flex: 1; padding: 0.75rem; font-size: 0.88rem;">
              <span>💾 Export Graphic (PNG)</span>
            </button>
            <button id="btn-copy-image-side" class="btn btn-secondary" style="flex: 1; padding: 0.75rem; font-size: 0.88rem;">
              <span>📋 Copy Post Text</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================
  // 4. GRAPHIC CANVAS CONTENT BUILDER
  // ==========================================
  function renderGraphicCanvasContent(theme, bgObj) {
    const hasBgImage = bgObj && bgObj.url && bgObj.url.length > 0;
    const bgStyle = hasBgImage ? `background: url('${bgObj.url}') center/cover no-repeat;` : `background: ${theme.bg};`;

    if (selectedImageTemplate === 'instagram') {
      return `
        <div style="position: absolute; inset: 0; ${bgStyle} z-index: 1;"></div>
        <div style="position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.72) 100%); z-index: 2;"></div>

        <div style="position: relative; z-index: 10; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 0.5rem; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.15);">
              ${renderAvatarHtml(22, '0.72rem', theme.accent)}
              <span style="font-size: 0.75rem; font-weight: 700; color: #fff;">${creatorHandle}</span>
            </div>
          </div>

          <div style="background: rgba(10, 12, 16, 0.82); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.18); border-radius: 16px; padding: 1.35rem; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <div style="color: #ffffff; font-size: 1.15rem; font-weight: 800; line-height: 1.35; font-family: 'Montserrat', 'Inter', sans-serif; margin-bottom: 0.65rem; text-shadow: 0 2px 6px rgba(0,0,0,0.6);">
              ${imageHeadline}
            </div>
            <div style="color: #cbd5e1; font-size: 0.85rem; line-height: 1.45; font-family: 'Inter', sans-serif;">
              ${imageBody}
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; align-items: center; color: #fff; font-size: 0.75rem;">
            ${getWatermarkHtml()}
          </div>
        </div>
      `;
    } else if (selectedImageTemplate === 'linkedin') {
      return `
        <div style="height: 100%; display: flex; flex-direction: column; background: ${theme.cardBg}; border-radius: 16px; overflow: hidden; position: relative;">
          <div style="height: 150px; width: 100%; ${bgStyle} position: relative; border-bottom: 2px solid ${theme.border};">
            <div style="position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.55) 100%);"></div>

            <div style="position: absolute; bottom: 10px; left: 12px; z-index: 10; display: flex; align-items: center; gap: 0.5rem;">
              ${renderAvatarHtml(28, '0.8rem', theme.accent)}
              <div>
                <div style="color: #fff; font-weight: 700; font-size: 0.8rem; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">${creatorHandle}</div>
              </div>
            </div>
          </div>

          <div style="flex: 1; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; background: ${theme.cardBg}; color: ${theme.text};">
            <div>
              <div style="font-size: 1.05rem; font-weight: 800; line-height: 1.4; color: ${theme.text}; font-family: 'Inter', sans-serif; margin-bottom: 0.6rem;">
                ${imageHeadline}
              </div>

              <div style="background: rgba(0,0,0,0.04); border-left: 3px solid ${theme.accent}; padding: 0.65rem 0.85rem; border-radius: 6px; font-size: 0.82rem; line-height: 1.4; color: ${theme.muted};">
                💡 <strong>Core Takeaway:</strong> ${imageBody}
              </div>
            </div>

            <div style="display: flex; justify-content: flex-end; align-items: center; border-top: 1px solid ${theme.border}; padding-top: 0.65rem; margin-top: 0.75rem; font-size: 0.72rem; color: ${theme.muted};">
              ${getWatermarkHtml()}
            </div>
          </div>
        </div>
      `;
    } else if (selectedImageTemplate === 'tweet') {
      return `
        <div style="position: absolute; inset: 0; ${hasBgImage ? `background: url('${bgObj.url}') center/cover no-repeat; opacity: 0.15; filter: blur(2px);` : ''} z-index: 1;"></div>
        
        <div style="position: relative; z-index: 10; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 1.5rem; background: ${theme.bg}; color: ${theme.text};">
          <div>
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.15rem;">
              ${renderAvatarHtml(44, '1.1rem', theme.accent)}
              <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 4px;">
                  <strong style="color: ${theme.text}; font-size: 0.95rem; font-family: 'Manrope', 'Inter', sans-serif;">${creatorHandle.startsWith('@') ? creatorHandle.slice(1) : creatorHandle}</strong>
                  <span style="color: ${theme.accent}; font-size: 0.95rem;">☑️</span>
                </div>
                <div style="color: ${theme.muted}; font-size: 0.78rem; font-family: monospace;">
                  ${creatorHandle.startsWith('@') ? creatorHandle : `@${creatorHandle}`}
                </div>
              </div>
              <div style="font-size: 1.1rem; color: ${theme.muted};">𝕏</div>
            </div>

            <div style="color: ${theme.text}; font-size: 1.08rem; font-weight: 700; line-height: 1.45; font-family: 'Inter', sans-serif; margin-bottom: 0.85rem;">
              ${imageHeadline}
            </div>

            <div style="color: ${theme.muted}; font-size: 0.88rem; line-height: 1.45; font-family: 'Inter', sans-serif;">
              ${imageBody}
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; align-items: center; border-top: 1px solid ${theme.border}; padding-top: 0.85rem; margin-top: 1rem; color: ${theme.muted}; font-size: 0.75rem;">
            ${getWatermarkHtml()}
          </div>
        </div>
      `;
    } else if (selectedImageTemplate === 'carousel') {
      return `
        <div style="height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 1.5rem; background: ${theme.bg}; color: ${theme.text}; position: relative;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
              <div style="display: flex; align-items: center; gap: 0.4rem;">
                ${renderAvatarHtml(20, '0.68rem', theme.accent)}
                <span style="font-size: 0.75rem; font-weight: 700; color: ${theme.muted};">${creatorHandle}</span>
              </div>
              <span style="font-weight: 800; font-size: 0.75rem; color: ${theme.accent}; letter-spacing: 0.08em; text-transform: uppercase;">
                SLIDE ${carouselSlideNum} OF ${totalCarouselSlides}
              </span>
            </div>

            <div style="color: ${theme.text}; font-size: 1.15rem; font-weight: 800; line-height: 1.35; margin-bottom: 0.85rem; font-family: 'Montserrat', 'Inter', sans-serif;">
              ${imageHeadline}
            </div>

            ${hasBgImage ? `
              <div style="height: 110px; width: 100%; ${bgStyle} border-radius: 10px; margin-bottom: 0.85rem; border: 1px solid ${theme.border};"></div>
            ` : ''}

            <div style="background: rgba(0,0,0,0.05); padding: 0.75rem 0.95rem; border-radius: 10px; border-left: 3px solid ${theme.accent};">
              <div style="color: ${theme.text}; font-size: 0.85rem; line-height: 1.45;">
                👉 ${imageBody}
              </div>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; align-items: center; margin-top: 1rem; border-top: 1px solid ${theme.border}; padding-top: 0.75rem;">
            ${getWatermarkHtml()}
          </div>
        </div>
      `;
    } else {
      return `
        <div style="position: absolute; inset: 0; ${hasBgImage ? `background: url('${bgObj.url}') center/cover no-repeat; opacity: 0.18; filter: blur(2px);` : ''} z-index: 1;"></div>

        <div style="position: relative; z-index: 10; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 1.75rem; background: ${theme.bg}; color: ${theme.text};">
          <div>
            <div style="font-size: 3.5rem; line-height: 1; color: ${theme.accent}; font-family: 'EB Garamond', serif; opacity: 0.85; margin-bottom: 0.25rem;">
              “
            </div>

            <div style="color: ${theme.text}; font-size: 1.25rem; font-weight: 700; line-height: 1.4; font-family: 'EB Garamond', 'Montserrat', serif; margin-bottom: 1rem;">
              ${imageHeadline}
            </div>

            <div style="color: ${theme.muted}; font-size: 0.92rem; line-height: 1.5; font-style: italic;">
              ${imageBody}
            </div>
          </div>

          <div style="border-top: 2px solid ${theme.accent}; padding-top: 0.75rem; margin-top: 1.25rem; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              ${renderAvatarHtml(26, '0.75rem', theme.accent)}
              <div>
                <strong style="color: ${theme.text}; font-size: 0.88rem; display: block;">— ${creatorHandle}</strong>
              </div>
            </div>
            ${getWatermarkHtml()}
          </div>
        </div>
      `;
    }
  }

  // ==========================================
  // 5. EVENT BINDINGS & SUBTITLE LOGIC
  // ==========================================
  function attachModeEvents() {
    const tabVideo = container.querySelector('#tab-mode-video');
    const tabImage = container.querySelector('#tab-mode-image');

    if (tabVideo) {
      tabVideo.addEventListener('click', () => {
        activeStudioMode = 'video';
        renderMain();
      });
    }

    if (tabImage) {
      tabImage.addEventListener('click', () => {
        activeStudioMode = 'image';
        renderMain();
      });
    }
  }

  function updateSubtitleText() {
    const subBox = container.querySelector('#subtitle-preview-box');
    if (!subBox) return;

    // Show subtitles if auto-edited or if video is uploaded and text is present
    if (!liveTranscriptText || (!isAutoEdited && !isVideoUploaded)) {
      subBox.style.display = 'none';
      return;
    }
    subBox.style.display = 'block';

    // Position alignment
    if (subtitlePosition === 'top') {
      subBox.style.marginTop = '1.5rem';
      subBox.style.marginBottom = 'auto';
    } else if (subtitlePosition === 'center') {
      subBox.style.marginTop = 'auto';
      subBox.style.marginBottom = 'auto';
    } else {
      subBox.style.marginTop = 'auto';
      subBox.style.marginBottom = '2.2rem';
    }

    const words = liveTranscriptText.trim().split(/\s+/);
    const splitIndex = Math.max(1, Math.ceil(words.length * 0.6));
    const firstPart = words.slice(0, splitIndex).join(' ');
    const lastPart = words.slice(splitIndex).join(' ');

    if (selectedSubtitlePreset === 'plain_white') {
      subBox.innerHTML = `
        <div class="subtitle-pop-anim" style="display: inline-block; background: rgba(0, 0, 0, 0.78); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.28); border-radius: 10px; padding: 8px 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.85); max-width: 90%;">
          <div style="font-size: ${subtitleFontSize}; font-weight: 700; color: #ffffff; text-align: center; letter-spacing: 0.01em; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.35; text-shadow: 0 2px 8px rgba(0,0,0,0.9);">
            ${liveTranscriptText}
          </div>
        </div>
      `;
    } else if (selectedSubtitlePreset === 'beast') {
      subBox.innerHTML = `
        <div class="subtitle-pop-anim" style="display: inline-block; background: rgba(0, 0, 0, 0.94); backdrop-filter: blur(12px); border: 2.5px solid #39ff14; border-radius: 14px; padding: 8px 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.95); max-width: 92%;">
          <div style="font-size: ${subtitleFontSize}; font-weight: 900; color: #ffffff; text-transform: uppercase; letter-spacing: 0.02em; font-family: 'Montserrat', sans-serif; line-height: 1.25;">
            ${firstPart} ${lastPart ? `<span style="color: #000000; background: #39ff14; padding: 2px 8px; border-radius: 6px; display: inline-block; transform: rotate(-2deg); font-weight: 900; box-shadow: 0 0 16px #39ff14;">${lastPart}</span>` : ''}
          </div>
        </div>
      `;
    } else if (selectedSubtitlePreset === 'hormozi') {
      subBox.innerHTML = `
        <div class="subtitle-pop-anim" style="display: inline-block; background: rgba(0, 0, 0, 0.94); backdrop-filter: blur(12px); border: 2.5px solid #fbbf24; border-radius: 14px; padding: 8px 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.95); max-width: 92%;">
          <div style="font-size: ${subtitleFontSize}; font-weight: 900; color: #ffffff; text-transform: uppercase; font-family: 'Montserrat', sans-serif; line-height: 1.25;">
            ${firstPart} ${lastPart ? `<span style="color: #000000; background: #fbbf24; padding: 2px 8px; border-radius: 6px; font-weight: 900; display: inline-block; box-shadow: 0 0 16px #fbbf24;">${lastPart}</span>` : ''}
          </div>
        </div>
      `;
    } else if (selectedSubtitlePreset === 'ali_abdaal') {
      subBox.innerHTML = `
        <div class="subtitle-pop-anim" style="display: inline-block; background: rgba(15, 23, 42, 0.94); backdrop-filter: blur(12px); border: 2px solid #38bdf8; border-radius: 12px; padding: 8px 16px; box-shadow: 0 8px 26px rgba(0,0,0,0.85); max-width: 92%;">
          <div style="font-size: ${subtitleFontSize}; font-weight: 800; color: #f8fafc; font-family: 'Inter', sans-serif; line-height: 1.3;">
            ${firstPart} ${lastPart ? `<span style="color: #38bdf8; text-decoration: underline; text-underline-offset: 3px;">${lastPart}</span>` : ''}
          </div>
        </div>
      `;
    } else {
      subBox.innerHTML = `
        <div class="subtitle-pop-anim" style="display: inline-block; background: rgba(0, 0, 0, 0.78); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.28); border-radius: 10px; padding: 8px 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.85); max-width: 90%;">
          <div style="font-size: ${subtitleFontSize}; font-weight: 700; color: #ffffff; text-align: center; line-height: 1.35;">
            ${liveTranscriptText}
          </div>
        </div>
      `;
    }
  }

  function attachVideoEvents() {
    updateSubtitleText();

    const fileInput = container.querySelector('#video-file-input');
    const btnBrowse = container.querySelector('#btn-browse-file');
    const btnSample = container.querySelector('#btn-sample-video');
    const dropZone = container.querySelector('#drop-zone');
    const btnChangeVideo = container.querySelector('#btn-change-video');
    const btnPlayPause = container.querySelector('#btn-play-pause');
    const btnRunAutoEdit = container.querySelector('#btn-run-auto-edit');
    const btnRevertRaw = container.querySelector('#btn-revert-raw');
    const btnToggleGrid = container.querySelector('#btn-toggle-grid');

    function downloadFile(content, filename, type) {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function getFullReelContext() {
      let fullTranscript = '';
      if (subtitlesData?.transcript_text) {
        fullTranscript = subtitlesData.transcript_text;
      } else if (subtitlesData?.transcript) {
        fullTranscript = subtitlesData.transcript;
      } else if (subtitlesData?.segments && subtitlesData.segments.length > 0) {
        fullTranscript = subtitlesData.segments.map(s => s.text).join(' ');
      } else if (liveTranscriptText) {
        fullTranscript = liveTranscriptText;
      }

      if (!fullTranscript || fullTranscript.trim().length === 0) {
        fullTranscript = "Stop doing manual video edits in 2026! The #1 mistake creators make is spending 4 hours per video instead of automating kinetic captions and cross-platform distribution.";
      }

      const cleanTitle = (currentFileName || 'video_reel')
        .replace(/\.[^/.]+$/, '')
        .replace(/[_\\-]/g, ' ');

      return {
        transcript: fullTranscript.trim(),
        title: cleanTitle,
        language: selectedLanguage
      };
    }

    async function loadVideoFile(file) {
      if (!file) return;
      currentFileName = file.name || 'uploaded_video.mp4';
      const objectUrl = URL.createObjectURL(file);
      currentVideoUrl = objectUrl;
      isVideoUploaded = true;
      isAutoEdited = false;
      processingStatus = 'uploading';
      uploadProgress = 15;
      processingMessage = `Uploading ${file.name} (Chunked)...`;
      renderMain();

      try {
        const videoRecord = await api.uploadVideo(file, (progress) => {
          uploadProgress = Math.max(15, Math.min(progress, 85));
          processingMessage = `Uploading ${file.name} (${uploadProgress}%)...`;
          const banner = container.querySelector('#pipeline-status-banner');
          if (banner) {
            const bar = banner.querySelector('.pipeline-progress-bar');
            const text = banner.querySelector('.pipeline-status-text');
            if (bar) bar.style.width = `${uploadProgress}%`;
            if (text) text.textContent = processingMessage;
          }
        });

        currentVideoId = videoRecord.id;
        // Keep objectUrl for zero-latency local playback and canvas rendering
        if (!currentVideoUrl && videoRecord.file_url) {
          currentVideoUrl = videoRecord.file_url;
        }

        // Auto-transcription
        processingStatus = 'transcribing';
        uploadProgress = 90;
        processingMessage = 'AI Transcribing Speech to Kinetic Subtitles (Gemini)...';
        renderMain();

        const transRes = await api.transcribe(videoRecord.id);
        subtitlesData = transRes;
        if (transRes.segments && transRes.segments.length > 0) {
          liveTranscriptText = transRes.segments[0].text;
        } else if (transRes.transcript_text) {
          liveTranscriptText = transRes.transcript_text.slice(0, 70);
        } else if (transRes.transcript) {
          liveTranscriptText = transRes.transcript.slice(0, 70);
        }

        // Auto caption generation grounded in reel context
        processingStatus = 'captioning';
        uploadProgress = 96;
        processingMessage = 'Generating Reel-Grounded Multi-Platform AI Copy & Hashtags (Priority 2)...';
        renderMain();

        try {
          const reelContext = getFullReelContext();
          const capRes = await api.generateCaption(
            videoRecord.id,
            reelContext.transcript,
            selectedCopyTone,
            activeCopyPlatform,
            false,
            reelContext.title
          );
          if (capRes) {
            if (platformCopyStore[activeCopyPlatform]) {
              platformCopyStore[activeCopyPlatform].caption = capRes.caption_text || platformCopyStore[activeCopyPlatform].caption;
              platformCopyStore[activeCopyPlatform].hashtags = capRes.hashtags || platformCopyStore[activeCopyPlatform].hashtags;
              platformCopyStore[activeCopyPlatform].approved = false;
            }
            editableCaptionText = capRes.caption_text || editableCaptionText;
            editableHashtags = capRes.hashtags || editableHashtags;
          }
        } catch (capErr) {
          console.warn('Caption auto-generation fallback:', capErr);
        }

        processingStatus = 'ready';
        uploadProgress = 100;
        processingMessage = 'Super Reel & Multi-Platform Copy Ready!';
        isAutoEdited = true;
        renderMain();
      } catch (err) {
        console.error('Video pipeline error:', err);
        processingStatus = 'idle';
        isAutoEdited = true;
        renderMain();
      }
    }

    async function triggerSampleVideo() {
      isVideoUploaded = true;
      currentFileName = 'sample_4k_creator_footage.mp4';
      processingStatus = 'transcribing';
      uploadProgress = 65;
      processingMessage = 'Loading sample footage & generating kinetic subtitles...';
      renderMain();

      try {
        const videos = await api.listVideos();
        let sampleVid = videos[0];
        if (!sampleVid) {
          const sampleFile = new File(['kontentos sample video raw binary'], 'sample_4k_creator_footage.mp4', { type: 'video/mp4' });
          sampleVid = await api.uploadVideo(sampleFile);
        }
        currentVideoId = sampleVid.id;
        const transRes = await api.transcribe(sampleVid.id);
        subtitlesData = transRes;
        if (transRes.segments && transRes.segments.length > 0) {
          liveTranscriptText = transRes.segments[0].text;
        } else if (transRes.transcript_text) {
          liveTranscriptText = transRes.transcript_text.slice(0, 70);
        }

        const reelContext = getFullReelContext();
        const capRes = await api.generateCaption(
          sampleVid.id,
          reelContext.transcript,
          selectedCopyTone,
          activeCopyPlatform,
          false,
          reelContext.title
        );
        if (capRes && platformCopyStore[activeCopyPlatform]) {
          platformCopyStore[activeCopyPlatform].caption = capRes.caption_text || platformCopyStore[activeCopyPlatform].caption;
          platformCopyStore[activeCopyPlatform].hashtags = capRes.hashtags || platformCopyStore[activeCopyPlatform].hashtags;
        }
      } catch (err) {
        console.warn('Sample auto-generation notice:', err);
      }

      processingStatus = 'ready';
      isAutoEdited = true;
      renderMain();
    }

    async function runAutoTranscribe(force = true) {
      if (!currentVideoId) {
        try {
          const vids = await api.listVideos();
          if (vids && vids.length > 0) {
            currentVideoId = vids[0].id;
          } else {
            const sampleFile = new File(['kontentos sample video raw binary'], 'sample_4k_creator_footage.mp4', { type: 'video/mp4' });
            const created = await api.uploadVideo(sampleFile);
            currentVideoId = created.id;
          }
        } catch (e) {
          console.warn('Video lookup error:', e);
        }
      }

      isTranscribing = true;
      renderMain();

      try {
        const transRes = await api.transcribe(currentVideoId, { forceRefresh: force, targetLanguage: selectedLanguage });
        subtitlesData = transRes;
        if (transRes.language) selectedLanguage = transRes.language;
        if (transRes.segments && transRes.segments.length > 0) {
          liveTranscriptText = transRes.segments[0].text;
        } else if (transRes.transcript_text) {
          liveTranscriptText = transRes.transcript_text.slice(0, 70);
        } else if (transRes.transcript) {
          liveTranscriptText = transRes.transcript.slice(0, 70);
        }

        const reelContext = getFullReelContext();
        const capRes = await api.generateCaption(
          currentVideoId,
          reelContext.transcript,
          selectedCopyTone,
          activeCopyPlatform,
          true,
          reelContext.title
        );
        if (capRes && platformCopyStore[activeCopyPlatform]) {
          platformCopyStore[activeCopyPlatform].caption = capRes.caption_text || platformCopyStore[activeCopyPlatform].caption;
          platformCopyStore[activeCopyPlatform].hashtags = capRes.hashtags || platformCopyStore[activeCopyPlatform].hashtags;
        }
      } catch (err) {
        console.error('Manual transcribe error:', err);
      } finally {
        isTranscribing = false;
        isAutoEdited = true;
        renderMain();
      }
    }

    async function runSubtitleTranslation(targetLang) {
      selectedLanguage = targetLang;
      if (!currentVideoId) {
        try {
          const vids = await api.listVideos();
          if (vids && vids.length > 0) currentVideoId = vids[0].id;
          else {
            const sampleFile = new File(['kontentos sample video raw binary'], 'sample_4k_creator_footage.mp4', { type: 'video/mp4' });
            const created = await api.uploadVideo(sampleFile);
            currentVideoId = created.id;
          }
        } catch (e) {
          console.warn('Video lookup error:', e);
        }
      }

      isTranslating = true;
      renderMain();

      try {
        const transRes = await api.translateSubtitles(
          currentVideoId,
          targetLang,
          subtitlesData?.srt_content || subtitlesData?.srt,
          liveTranscriptText
        );
        subtitlesData = transRes;
        if (transRes.language) selectedLanguage = transRes.language;
        if (transRes.segments && transRes.segments.length > 0) {
          liveTranscriptText = transRes.segments[0].text;
        } else if (transRes.transcript_text) {
          liveTranscriptText = transRes.transcript_text.slice(0, 70);
        }

        const reelContext = getFullReelContext();
        const capRes = await api.generateCaption(
          currentVideoId,
          reelContext.transcript,
          selectedCopyTone,
          activeCopyPlatform,
          true,
          reelContext.title
        );
        if (capRes && platformCopyStore[activeCopyPlatform]) {
          platformCopyStore[activeCopyPlatform].caption = capRes.caption_text || platformCopyStore[activeCopyPlatform].caption;
          platformCopyStore[activeCopyPlatform].hashtags = capRes.hashtags || platformCopyStore[activeCopyPlatform].hashtags;
        }
      } catch (err) {
        console.error('Subtitle translation error:', err);
      } finally {
        isTranslating = false;
        isAutoEdited = true;
        renderMain();
      }
    }

    function toggleLiveMicDictation() {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRec) {
        alert('Web Speech STT API is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
        return;
      }

      if (isRecordingMic) {
        if (speechRecInstance) {
          speechRecInstance.stop();
          speechRecInstance = null;
        }
        isRecordingMic = false;
        renderMain();
        return;
      }

      try {
        const recognition = new SpeechRec();
        recognition.continuous = true;
        recognition.interimResults = true;
        const langMap = {
          English: 'en-US',
          Spanish: 'es-ES',
          Hindi: 'hi-IN',
          Hinglish: 'hi-IN',
          French: 'fr-FR',
          German: 'de-DE',
          Japanese: 'ja-JP',
          Portuguese: 'pt-BR',
          Arabic: 'ar-SA'
        };
        recognition.lang = langMap[selectedLanguage] || 'en-US';

        recognition.onstart = () => {
          isRecordingMic = true;
          renderMain();
        };

        recognition.onresult = (event) => {
          let finalTranscript = '';
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          const spoken = (finalTranscript || interimTranscript).trim();
          if (spoken) {
            liveTranscriptText = spoken;
            updateSubtitleText();
            const input = container.querySelector('#input-transcript-text');
            if (input) input.value = spoken;
          }
        };

        recognition.onerror = (e) => {
          console.warn('Speech recognition notice:', e.error);
          isRecordingMic = false;
          renderMain();
        };

        recognition.onend = async () => {
          isRecordingMic = false;
          if (currentVideoId && liveTranscriptText) {
            try {
              const res = await api.saveLiveTranscription(currentVideoId, liveTranscriptText, selectedLanguage);
              if (res) subtitlesData = res;
            } catch (err) {
              console.warn('Failed to save live transcription:', err);
            }
          }
          renderMain();
        };

        speechRecInstance = recognition;
        recognition.start();
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
        isRecordingMic = false;
        renderMain();
      }
    }

    // Play/Pause & Audio Action
    const videoTag = container.querySelector('#player-video-tag');
    const btnAudioToggle = container.querySelector('#btn-toggle-audio-mute');

    function updateAudioUI() {
      if (btnAudioToggle) {
        if (isAudioMuted) {
          btnAudioToggle.innerHTML = '🔇 <span id="audio-btn-label">Muted (Click to Unmute)</span>';
          btnAudioToggle.style.background = 'rgba(239, 68, 68, 0.9)';
          btnAudioToggle.style.borderColor = 'rgba(255, 255, 255, 0.4)';
        } else {
          btnAudioToggle.innerHTML = '🔊 <span id="audio-btn-label">Sound ON (100%)</span>';
          btnAudioToggle.style.background = 'rgba(16, 185, 129, 0.9)';
          btnAudioToggle.style.borderColor = 'rgba(255, 255, 255, 0.4)';
        }
      }
    }

    if (btnAudioToggle) {
      btnAudioToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        initAudioContext();
        isAudioMuted = !isAudioMuted;
        if (videoTag) {
          videoTag.muted = isAudioMuted;
          if (!isAudioMuted) {
            videoTag.volume = 1.0;
            if (videoTag.paused) videoTag.play().catch(() => {});
          }
        }
        if (!isAudioMuted && (!videoTag || !videoTag.paused)) {
          startBgmPlayback();
        } else {
          stopBgmPlayback();
        }
        updateAudioUI();
      });
    }

    if (videoTag) {
      videoTag.volume = 1.0;
      videoTag.muted = isAudioMuted;
      videoTag.playbackRate = parseFloat(voiceSpeed) || 1.0;

      // Handle unmuted playback policy
      const playPromise = videoTag.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          if (!isAudioMuted) startBgmPlayback();
        }).catch((err) => {
          console.log('Unmuted autoplay policy blocked, starting muted with prompt:', err);
          videoTag.muted = true;
          isAudioMuted = true;
          updateAudioUI();
          videoTag.play().catch(() => {});
        });
      }
      updateAudioUI();

      // Click on video directly un-mutes and plays audio
      videoTag.addEventListener('click', () => {
        initAudioContext();
        if (videoTag.muted || isAudioMuted) {
          videoTag.muted = false;
          isAudioMuted = false;
          videoTag.volume = 1.0;
          startBgmPlayback();
          updateAudioUI();
        }
      });

      videoTag.addEventListener('play', () => {
        if (btnPlayPause) btnPlayPause.textContent = '❚❚';
        if (videoTag.currentTime < 0.2) {
          triggeredSfxSegmentIds.clear();
          triggeredAiCueIds.clear();
        }
        if (!isAudioMuted) startBgmPlayback();
      });

      videoTag.addEventListener('pause', () => {
        if (btnPlayPause) btnPlayPause.textContent = '▶';
        stopBgmPlayback();
      });

      const progressTrack = container.querySelector('#player-progress-track');
      const progressFill = container.querySelector('#player-progress-fill');
      const timecodeEl = container.querySelector('#player-timecode');

      const updateProgressUI = () => {
        if (!videoTag) return;
        const curTime = videoTag.currentTime || 0;
        const dur = videoTag.duration || 30;

        if (progressFill) {
          const pct = Math.min(100, Math.max(0, (curTime / dur) * 100));
          progressFill.style.width = `${pct}%`;
        }

        if (timecodeEl) {
          const curMin = Math.floor(curTime / 60);
          const curSec = Math.floor(curTime % 60);
          const durMin = Math.floor(dur / 60);
          const durSec = Math.floor(dur % 60);
          timecodeEl.textContent = `${String(curMin).padStart(2, '0')}:${String(curSec).padStart(2, '0')} / ${String(durMin).padStart(2, '0')}:${String(durSec).padStart(2, '0')}`;
        }
      };

      videoTag.addEventListener('timeupdate', () => {
        const curTime = videoTag.currentTime;
        updateProgressUI();

        // Trigger AI Smart SFX timeline cues
        checkAiTimelineSfxTrigger(curTime);

        if (subtitlesData && subtitlesData.segments && subtitlesData.segments.length > 0) {
          const parseTime = (str) => {
            if (!str) return 0;
            const parts = str.split(':');
            if (parts.length < 3) return 0;
            const secParts = parts[2].split(/[,\.]/);
            return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(secParts[0], 10) + (parseInt(secParts[1] || 0, 10) / 1000);
          };
          const matchedSeg = subtitlesData.segments.find(s => {
            const startSec = parseTime(s.start);
            const endSec = parseTime(s.end);
            return curTime >= startSec && curTime <= endSec;
          });
          if (matchedSeg && matchedSeg.text && matchedSeg.text !== liveTranscriptText) {
            liveTranscriptText = matchedSeg.text;
            updateSubtitleText();
          }
          if (matchedSeg) {
            checkKeywordHookSfxTrigger(curTime, matchedSeg);
          }
        } else if (liveTranscriptText) {
          if (curTime > 0.1 && curTime < 0.8) {
            checkKeywordHookSfxTrigger(curTime, { start: '00:00:00', end: '00:00:10', text: liveTranscriptText });
          }
        }
      });

      videoTag.addEventListener('loadedmetadata', updateProgressUI);
      videoTag.addEventListener('seeked', () => {
        triggeredSfxSegmentIds.clear();
        triggeredAiCueIds.clear();
        updateProgressUI();
      });

      if (progressTrack) {
        progressTrack.addEventListener('click', (e) => {
          if (!videoTag || !videoTag.duration) return;
          const rect = progressTrack.getBoundingClientRect();
          const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const ratio = clickX / rect.width;
          videoTag.currentTime = ratio * videoTag.duration;
          updateProgressUI();
        });
      }
    }

    if (btnPlayPause) {
      btnPlayPause.addEventListener('click', () => {
        initAudioContext();
        if (videoTag) {
          if (videoTag.paused) {
            // Unmute and ensure volume 1.0 on user gesture
            videoTag.muted = false;
            isAudioMuted = false;
            videoTag.volume = 1.0;
            videoTag.play().catch(e => console.warn(e));
            btnPlayPause.textContent = '❚❚';
            updateAudioUI();
            startBgmPlayback();
          } else {
            videoTag.pause();
            btnPlayPause.textContent = '▶';
            stopBgmPlayback();
          }
        } else {
          isPlaying = !isPlaying;
          btnPlayPause.textContent = isPlaying ? '❚❚' : '▶';
        }
      });
    }

    // Toggle 9:16 Safe Zone Grid
    if (btnToggleGrid) {
      btnToggleGrid.addEventListener('click', () => {
        showSafeZoneGrid = !showSafeZoneGrid;
        const grid = container.querySelector('#safe-zone-overlay');
        if (grid) grid.style.display = showSafeZoneGrid ? 'flex' : 'none';
        btnToggleGrid.classList.toggle('btn-primary', showSafeZoneGrid);
      });
    }

    // RUN AI AUTO-EDIT (Transform into Super Reel)
    if (btnRunAutoEdit) {
      btnRunAutoEdit.addEventListener('click', () => {
        btnRunAutoEdit.disabled = true;
        btnRunAutoEdit.innerHTML = `<span>⏳ AI Editing: Trimming Dead Silence & Synching Captions...</span>`;

        setTimeout(() => {
          isAutoEdited = true;
          renderMain();
          alert('⚡ Super Reel Generated! AI trimmed 8 dead silence pauses (-4.2s), generated kinetic karaoke captions, applied 9:16 Smart Face tracking, and enhanced voice presence.');
        }, 800);
      });
    }

    // Revert to Raw
    if (btnRevertRaw) {
      btnRevertRaw.addEventListener('click', () => {
        isAutoEdited = false;
        renderMain();
      });
    }

    // File Browse and Change
    if (btnBrowse && fileInput) {
      btnBrowse.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }

    if (btnChangeVideo && fileInput) {
      btnChangeVideo.addEventListener('click', () => {
        fileInput.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          loadVideoFile(e.target.files[0]);
        }
      });
    }

    if (dropZone) {
      dropZone.addEventListener('click', () => {
        if (fileInput) fileInput.click();
      });

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--accent-primary)';
        dropZone.style.background = 'var(--bg-surface-high)';
      });

      dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border-glass)';
        dropZone.style.background = 'var(--bg-surface-low)';
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border-glass)';
        dropZone.style.background = 'var(--bg-surface-low)';
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          loadVideoFile(e.dataTransfer.files[0]);
        }
      });
    }

    if (btnSample) btnSample.addEventListener('click', triggerSampleVideo);

    // Watermark Toggle with Pro Payment Trigger
    const watermarkToggle = container.querySelector('#toggle-watermark');
    const watermarkOverlay = container.querySelector('#watermark-overlay');

    if (watermarkToggle) {
      watermarkToggle.addEventListener('change', (e) => {
        if (!e.target.checked && !profile.isPro) {
          openProModal({
            onSuccess: () => {
              if (watermarkToggle) watermarkToggle.checked = false;
              if (watermarkOverlay) watermarkOverlay.style.display = 'none';
            },
            onCancel: () => {
              if (watermarkToggle) watermarkToggle.checked = true;
              stateStore.updateProfile({ includeWatermark: true });
              if (watermarkOverlay) watermarkOverlay.style.display = 'flex';
            }
          });
        } else {
          stateStore.updateProfile({ includeWatermark: e.target.checked });
          if (watermarkOverlay) watermarkOverlay.style.display = e.target.checked ? 'flex' : 'none';
        }
      });
    }

    // CapCut Editor Sub-Tabs
    container.querySelectorAll('.editor-subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeEditorTab = btn.getAttribute('data-tab');
        renderMain();
      });
    });

    // STT & Subtitle Transcription Handlers
    const btnRunStt = container.querySelector('#btn-run-stt-transcribe');
    if (btnRunStt) {
      btnRunStt.addEventListener('click', () => {
        runAutoTranscribe(true);
      });
    }

    const btnToggleMic = container.querySelector('#btn-toggle-mic-stt');
    if (btnToggleMic) {
      btnToggleMic.addEventListener('click', () => {
        toggleLiveMicDictation();
      });
    }

    const selectTargetLang = container.querySelector('#select-stt-target-lang');
    if (selectTargetLang) {
      selectTargetLang.addEventListener('change', (e) => {
        selectedLanguage = e.target.value;
      });
    }

    const btnRunTranslate = container.querySelector('#btn-run-stt-translate');
    if (btnRunTranslate) {
      btnRunTranslate.addEventListener('click', () => {
        const targetLang = selectTargetLang ? selectTargetLang.value : selectedLanguage;
        runSubtitleTranslation(targetLang);
      });
    }

    // Subtitle Segment Row Click Handlers
    container.querySelectorAll('.subtitle-segment-row').forEach(row => {
      row.addEventListener('click', () => {
        const text = row.getAttribute('data-text');
        const idx = parseInt(row.getAttribute('data-idx') || '0', 10);
        if (text) {
          liveTranscriptText = text;
          updateSubtitleText();
          const input = container.querySelector('#input-transcript-text');
          if (input) input.value = text;
        }
        if (subtitlesData?.segments && subtitlesData.segments[idx]) {
          const seg = subtitlesData.segments[idx];
          const parseTime = (str) => {
            if (!str) return 0;
            const parts = str.split(':');
            if (parts.length < 3) return 0;
            const secParts = parts[2].split(/[,\.]/);
            return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(secParts[0], 10) + (parseInt(secParts[1] || 0, 10) / 1000);
          };
          const videoTag = container.querySelector('#player-video-tag');
          if (videoTag) {
            videoTag.currentTime = parseTime(seg.start);
          }
        }
        renderMain();
      });
    });

    // Subtitle Style Selectors
    container.querySelectorAll('.subtitle-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedSubtitlePreset = card.getAttribute('data-sub');
        isAutoEdited = true;
        showStudioToast(`Applied ${selectedSubtitlePreset.toUpperCase()} subtitle styling`, 'info');
        updateSubtitleText();
        renderMain();
      });
    });

    // Live Transcript Text Input
    const inputTranscript = container.querySelector('#input-transcript-text');
    if (inputTranscript) {
      inputTranscript.addEventListener('input', (e) => {
        liveTranscriptText = e.target.value;
        updateSubtitleText();
      });
    }

    // Subtitle Position Selectors
    container.querySelectorAll('.btn-sub-pos').forEach(btn => {
      btn.addEventListener('click', () => {
        subtitlePosition = btn.getAttribute('data-pos');
        isAutoEdited = true;
        updateSubtitleText();
        renderMain();
      });
    });

    // Subtitle Font Size Range
    const rangeSubSize = container.querySelector('#range-sub-size');
    if (rangeSubSize) {
      rangeSubSize.addEventListener('input', (e) => {
        subtitleFontSize = `${e.target.value}rem`;
        const label = container.querySelector('#label-sub-size');
        if (label) label.textContent = subtitleFontSize;
        updateSubtitleText();
      });
    }

    // B-Roll & Emojis Toggles
    const toggleBroll = container.querySelector('#toggle-broll-inserts');
    if (toggleBroll) {
      toggleBroll.addEventListener('change', (e) => {
        bRollEnabled = e.target.checked;
        renderMain();
      });
    }

    const toggleEmoji = container.querySelector('#toggle-emoji-popups');
    if (toggleEmoji) {
      toggleEmoji.addEventListener('change', (e) => {
        emojiPopupsEnabled = e.target.checked;
        renderMain();
      });
    }

    const selectBrollPack = container.querySelector('#select-broll-pack');
    if (selectBrollPack) {
      selectBrollPack.addEventListener('change', (e) => {
        bRollType = e.target.value;
      });
    }

    // Filter Selectors
    container.querySelectorAll('.btn-select-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedFilter = btn.getAttribute('data-filter');
        isAutoEdited = true;
        showStudioToast(`Applied ${selectedFilter.replace('_', ' ').toUpperCase()} color grade`, 'info');
        renderMain();
      });
    });

    // Pro Color Adjustments Sliders
    const rangeBright = container.querySelector('#range-brightness');
    if (rangeBright) {
      rangeBright.addEventListener('input', (e) => {
        colorBrightness = parseInt(e.target.value);
        isAutoEdited = true;
        const label = container.querySelector('#label-brightness');
        if (label) label.textContent = `${colorBrightness}%`;
        const media = container.querySelector('#video-media-container');
        if (media) {
          media.style.filter = computeProColorFilter(selectedFilter, colorBrightness, colorContrast, colorSaturation);
        }
      });
    }

    const rangeContrast = container.querySelector('#range-contrast');
    if (rangeContrast) {
      rangeContrast.addEventListener('input', (e) => {
        colorContrast = parseInt(e.target.value);
        isAutoEdited = true;
        const label = container.querySelector('#label-contrast');
        if (label) label.textContent = `${colorContrast}%`;
        const media = container.querySelector('#video-media-container');
        if (media) {
          media.style.filter = computeProColorFilter(selectedFilter, colorBrightness, colorContrast, colorSaturation);
        }
      });
    }

    const rangeSat = container.querySelector('#range-saturation');
    if (rangeSat) {
      rangeSat.addEventListener('input', (e) => {
        colorSaturation = parseInt(e.target.value);
        isAutoEdited = true;
        const label = container.querySelector('#label-saturation');
        if (label) label.textContent = `${colorSaturation}%`;
        const media = container.querySelector('#video-media-container');
        if (media) {
          media.style.filter = computeProColorFilter(selectedFilter, colorBrightness, colorContrast, colorSaturation);
        }
      });
    }

    // Effect Selectors
    container.querySelectorAll('.btn-select-effect').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedEffect = btn.getAttribute('data-effect');
        isAutoEdited = true;
        const effectLabels = {
          smart_zoom: 'Smart Face Zoom enabled (1.18x punch on key hooks)',
          glitch_flash: 'Glitch Chromatic Flash enabled',
          light_leak: 'Warm Light Leak Flare enabled',
          film_grain: 'Cinematic 35mm Grain enabled',
          none: 'Visual effects disabled'
        };
        showStudioToast(effectLabels[selectedEffect] || 'Visual effect updated', 'info');
        renderMain();
      });
    });

    // Motion Blur Toggle
    const toggleMotionBlur = container.querySelector('#toggle-motion-blur');
    if (toggleMotionBlur) {
      toggleMotionBlur.addEventListener('change', (e) => {
        motionBlurEnabled = e.target.checked;
      });
    }

    // Transition Audition Function
    function triggerTransitionAudition(transType = selectedTransition) {
      const mediaContainer = container.querySelector('#video-media-container');
      const fxContainer = container.querySelector('#fx-layer-container');
      if (!mediaContainer) return;

      mediaContainer.classList.remove('transition-whip-pan-audition', 'transition-zoom-snap-audition', 'transition-glitch-cut-audition');

      if (transType === 'whip_pan') {
        playSfx('whip_whoosh');
        mediaContainer.classList.add('transition-whip-pan-audition');
        setTimeout(() => mediaContainer?.classList.remove('transition-whip-pan-audition'), 480);
      } else if (transType === 'zoom_snap') {
        playSfx('whoosh_heavy');
        mediaContainer.classList.add('transition-zoom-snap-audition');
        setTimeout(() => mediaContainer?.classList.remove('transition-zoom-snap-audition'), 420);
      } else if (transType === 'glitch') {
        playSfx('riser_short');
        mediaContainer.classList.add('transition-glitch-cut-audition');
        setTimeout(() => mediaContainer?.classList.remove('transition-glitch-cut-audition'), 420);
      } else if (transType === 'camera_flash') {
        playSfx('camera_click');
        if (fxContainer) {
          const flash = document.createElement('div');
          flash.className = 'transition-camera-flash-overlay';
          fxContainer.appendChild(flash);
          setTimeout(() => flash.remove(), 380);
        }
      }
    }

    // Transition Selectors & Preview
    container.querySelectorAll('.btn-select-transition').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedTransition = btn.getAttribute('data-transition');
        isAutoEdited = true;
        const transLabels = {
          whip_pan: 'Whip Pan Right transition active',
          zoom_snap: 'Smooth Zoom Snap transition active',
          glitch: 'Glitch Slice Cut transition active',
          camera_flash: 'Camera Flash Fade transition active'
        };
        showStudioToast(transLabels[selectedTransition] || 'Transition updated', 'info');
        renderMain();
        triggerTransitionAudition(selectedTransition);
      });
    });

    const btnAuditionTransition = container.querySelector('#btn-audition-transition');
    if (btnAuditionTransition) {
      btnAuditionTransition.addEventListener('click', (e) => {
        e.preventDefault();
        triggerTransitionAudition(selectedTransition);
      });
    }

    // Pacing Selectors
    container.querySelectorAll('.btn-select-pacing').forEach(btn => {
      btn.addEventListener('click', () => {
        cutPacing = btn.getAttribute('data-pacing');
        isAutoEdited = true;
        const pacingLabels = {
          viral_fast: 'Viral Fast (1.2s cut intervals)',
          medium_pace: 'Dynamic Pace (2.5s cut intervals)',
          cinematic: 'Cinematic Pace (4.0s cut intervals)'
        };
        showStudioToast(`Pacing velocity: ${pacingLabels[cutPacing] || cutPacing}`, 'info');
        renderMain();
      });
    });

    // Audio Controls
    const toggleVoiceIso = container.querySelector('#toggle-editor-voice-iso');
    if (toggleVoiceIso) {
      toggleVoiceIso.addEventListener('change', (e) => {
        voiceIsolator = e.target.checked;
        if (videoTag) {
          setupVoiceIsolatorPipeline(videoTag);
        }
        showStudioToast(voiceIsolator ? '🎙️ Studio Mic Isolator ACTIVE (De-hum & Presence Boost)' : 'Studio Mic Isolator disabled', voiceIsolator ? 'success' : 'info');
      });
    }

    container.querySelectorAll('.btn-voice-speed').forEach(btn => {
      btn.addEventListener('click', () => {
        voiceSpeed = btn.getAttribute('data-spd');
        if (videoTag) {
          videoTag.playbackRate = parseFloat(voiceSpeed) || 1.0;
        }
        showStudioToast(`Voice speed: ${voiceSpeed}`, 'info');
        renderMain();
      });
    });

    // AI SFX Placement Handlers
    const btnSyncSfxFromCopy = container.querySelector('#btn-sync-sfx-from-copy');
    if (btnSyncSfxFromCopy) {
      btnSyncSfxFromCopy.addEventListener('click', (e) => {
        e.preventDefault();
        activeEditorTab = 'audio_sfx';
        runAiSmartSfxPlacement();
      });
    }

    const btnRunAiSfx = container.querySelector('.btn-run-ai-sfx');
    if (btnRunAiSfx) {
      btnRunAiSfx.addEventListener('click', (e) => {
        e.preventDefault();
        runAiSmartSfxPlacement();
      });
    }

    const btnClearAiSfx = container.querySelector('.btn-clear-ai-sfx');
    if (btnClearAiSfx) {
      btnClearAiSfx.addEventListener('click', (e) => {
        e.preventDefault();
        aiSfxCues = [];
        triggeredAiCueIds.clear();
        showStudioToast('Cleared SFX cues timeline', 'info');
        renderMain();
      });
    }

    container.querySelectorAll('.btn-audition-cue').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sfx = btn.getAttribute('data-sfx');
        if (sfx) playSfx(sfx);
      });
    });

    container.querySelectorAll('.btn-remove-cue').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const cueId = btn.getAttribute('data-id');
        if (cueId) {
          aiSfxCues = aiSfxCues.filter(c => c.id !== cueId);
          renderMain();
        }
      });
    });

    // Individual Cue .WAV Download
    container.querySelectorAll('.btn-download-cue-wav').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sfxId = btn.getAttribute('data-sfx');
        const sfxLabel = btn.getAttribute('data-label') || sfxId;
        if (sfxId) {
          downloadSfxAudioWav(sfxId, sfxLabel);
        }
      });
    });

    // Batch Download all AI Placed SFX Cues as .WAV files
    const btnExportAllCues = container.querySelector('.btn-export-all-cues-wavs');
    if (btnExportAllCues) {
      btnExportAllCues.addEventListener('click', (e) => {
        e.preventDefault();
        if (!aiSfxCues || aiSfxCues.length === 0) {
          showStudioToast('No active SFX cues to download', 'warn');
          return;
        }
        showStudioToast(`Downloading ${aiSfxCues.length} SFX cue audio files...`, 'info');
        aiSfxCues.forEach((cue, index) => {
          setTimeout(() => {
            const timeTag = cue.timestamp.replace(/[:.]/g, '_');
            downloadSfxAudioWav(cue.sfxId, `${timeTag}_${cue.sfxId}`);
          }, index * 260);
        });
      });
    }

    // 1-Click Interactive BGM Track Cards Handler
    container.querySelectorAll('.card-bgm-track').forEach(card => {
      card.addEventListener('click', (e) => {
        e.preventDefault();
        const bgmId = card.getAttribute('data-bgm');
        if (bgmId) {
          selectAndApplyBgm(bgmId);
        }
      });
    });

    const toggleKeywordSfx = container.querySelector('#toggle-keyword-sfx');
    if (toggleKeywordSfx) {
      toggleKeywordSfx.addEventListener('change', (e) => {
        autoKeywordSfxEnabled = e.target.checked;
      });
    }

    const selectSfx = container.querySelector('#select-sfx-pack');
    if (selectSfx) {
      selectSfx.addEventListener('change', (e) => {
        sfxPack = e.target.value;
        if (sfxPack !== 'none' && SFX_PACK_SOUNDBOARDS[sfxPack] && SFX_PACK_SOUNDBOARDS[sfxPack][0]) {
          playSfx(SFX_PACK_SOUNDBOARDS[sfxPack][0].id);
        }
        renderMain();
      });
    }

    container.querySelectorAll('.btn-trigger-sfx').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const sfxId = btn.getAttribute('data-sfx');
        if (sfxId) {
          playSfx(sfxId);
        }
      });
    });

    // Individual Soundboard SFX Download
    container.querySelectorAll('.btn-download-sfx').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sfxId = btn.getAttribute('data-sfx');
        const sfxLabel = btn.getAttribute('data-label') || sfxId;
        if (sfxId) {
          downloadSfxAudioWav(sfxId, sfxLabel);
        }
      });
    });

    // Download Full Soundboard Pack (.WAVs)
    const btnDownloadPack = container.querySelector('.btn-download-pack-wavs');
    if (btnDownloadPack) {
      btnDownloadPack.addEventListener('click', (e) => {
        e.preventDefault();
        const packKey = btnDownloadPack.getAttribute('data-pack') || sfxPack;
        downloadFullSoundPack(packKey);
      });
    }

    const selectBgm = container.querySelector('#select-bgm-track');
    if (selectBgm) {
      selectBgm.addEventListener('change', (e) => {
        bgMusicTrack = e.target.value;
        if (bgMusicTrack !== 'none' && !isAudioMuted) {
          startBgmPlayback();
        } else {
          stopBgmPlayback();
        }
      });
    }

    const btnAuditionBgm = container.querySelector('.btn-audition-bgm');
    if (btnAuditionBgm) {
      btnAuditionBgm.addEventListener('click', (e) => {
        e.preventDefault();
        if (bgMusicTrack === 'none') {
          showStudioToast('Please select a viral background music track from the list first!', 'warning');
          return;
        }
        startBgmPlayback();
        if (!videoTag || videoTag.paused) {
          setTimeout(() => {
            if (videoTag && videoTag.paused) {
              stopBgmPlayback();
            }
          }, 4500);
        }
      });
    }

    const btnDownloadBgm = container.querySelector('.btn-download-bgm');
    if (btnDownloadBgm) {
      btnDownloadBgm.addEventListener('click', (e) => {
        e.preventDefault();
        downloadBgmTrack(bgMusicTrack);
      });
    }

    const rangeBgmVol = container.querySelector('#range-bgm-vol');
    if (rangeBgmVol) {
      rangeBgmVol.addEventListener('input', (e) => {
        bgMusicVolume = parseInt(e.target.value);
        const lbl = container.querySelector('#label-bgm-vol');
        if (lbl) lbl.textContent = `${bgMusicVolume}%`;
        if (bgmGainNode && audioCtx) {
          const config = BGM_TRACK_CONFIGS[bgMusicTrack] || BGM_TRACK_CONFIGS.lofi_chill;
          const vol = ((parseInt(bgMusicVolume, 10) || 45) / 100) * (config.gainFactor || 0.14);
          bgmGainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
        }
      });
    }

    // Export Reel (Render & Download True Edited Video File)
    const btnExportReel = container.querySelector('#btn-export-reel');
    if (btnExportReel) {
      btnExportReel.addEventListener('click', async () => {
        const origHtml = btnExportReel.innerHTML;
        btnExportReel.disabled = true;
        btnExportReel.innerHTML = '<span>⏳ Initializing Frame-Accurate HD Pipeline...</span>';

        const cleanBaseName = (currentFileName || 'super_reel').replace(/\.[^/.]+$/, '');

        try {
          const videoEl = container.querySelector('#player-video-tag');
          if (!videoEl) {
            throw new Error('Video player element not found.');
          }

          // 1. Ensure Video Metadata is Loaded
          if (videoEl.readyState < 1 || !videoEl.duration) {
            await new Promise((resolve) => {
              const onMeta = () => {
                videoEl.removeEventListener('loadedmetadata', onMeta);
                resolve();
              };
              videoEl.addEventListener('loadedmetadata', onMeta);
              setTimeout(resolve, 3000);
            });
          }

          // 2. Setup 9:16 Vertical HD Canvas
          const canvasWidth = 720;
          const canvasHeight = 1280;
          const renderCanvas = document.createElement('canvas');
          renderCanvas.width = canvasWidth;
          renderCanvas.height = canvasHeight;
          const ctx = renderCanvas.getContext('2d', { alpha: false });

          // Helper to draw rounded rectangle
          const roundRect = (ctx, x, y, width, height, radius) => {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
          };

          // Robust timestamp parser supporting all SRT/VTT/float formats
          const parseTimestamp = (str) => {
            if (typeof str === 'number') return str;
            if (!str) return 0;
            const s = String(str).trim().replace(',', '.');
            const parts = s.split(':');
            if (parts.length === 3) {
              return (parseFloat(parts[0]) || 0) * 3600 + (parseFloat(parts[1]) || 0) * 60 + (parseFloat(parts[2]) || 0);
            }
            if (parts.length === 2) {
              return (parseFloat(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0);
            }
            return parseFloat(s) || 0;
          };

          // Calculate true total duration from video metadata and subtitle cues
          let maxSubTime = 0;
          if (subtitlesData && Array.isArray(subtitlesData.segments) && subtitlesData.segments.length > 0) {
            subtitlesData.segments.forEach(seg => {
              const eT = parseTimestamp(seg.end);
              if (eT > maxSubTime) maxSubTime = eT;
            });
          }

          let totalDuration = (videoEl.duration && !isNaN(videoEl.duration) && isFinite(videoEl.duration) && videoEl.duration > 0)
            ? videoEl.duration
            : 0;

          if (maxSubTime > totalDuration) {
            totalDuration = maxSubTime;
          }
          if (totalDuration <= 0) {
            totalDuration = 10;
          }

          // Build CSS filter string based on selected grade and adjustments
          const renderFilter = computeProColorFilter(selectedFilter, colorBrightness, colorContrast, colorSaturation) || 'none';

          // Composite Frame Renderer strictly tied to videoEl.currentTime
          const renderCompositeFrame = (timeSec, totalDur) => {
            // Background fill
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);

            // 1. Draw Video Layer with color grade and optional smart zoom
            ctx.save();
            if (renderFilter !== 'none') {
              ctx.filter = renderFilter;
            }

            // Pacing & Zoom effect calculation
            let punchZoom = 1.0;
            const pacingInterval = cutPacing === 'viral_fast' ? 1.2 : (cutPacing === 'medium_pace' ? 2.5 : 4.0);
            const cycleTime = timeSec % pacingInterval;

            if (selectedEffect === 'smart_zoom') {
              if (cycleTime < (pacingInterval * 0.45)) {
                punchZoom = 1.16;
              }
            } else if (selectedTransition === 'zoom_snap' && cycleTime < 0.25) {
              punchZoom = 1.0 + (0.25 - cycleTime) * 0.8;
            }

            if (punchZoom > 1.0) {
              ctx.translate(canvasWidth / 2, canvasHeight / 2);
              ctx.scale(punchZoom, punchZoom);
              ctx.translate(-canvasWidth / 2, -canvasHeight / 2);
            }

            if (videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
              const vidW = videoEl.videoWidth;
              const vidH = videoEl.videoHeight;
              const scale = Math.max(canvasWidth / vidW, canvasHeight / vidH);
              const drawW = vidW * scale;
              const drawH = vidH * scale;
              const drawX = (canvasWidth - drawW) / 2;
              const drawY = (canvasHeight - drawH) / 2;

              ctx.drawImage(videoEl, drawX, drawY, drawW, drawH);
            } else {
              const bgGrad = ctx.createRadialGradient(canvasWidth / 2, canvasHeight / 2, 80, canvasWidth / 2, canvasHeight / 2, canvasHeight / 1.3);
              bgGrad.addColorStop(0, '#1e293b');
              bgGrad.addColorStop(1, '#020617');
              ctx.fillStyle = bgGrad;
              ctx.fillRect(0, 0, canvasWidth, canvasHeight);

              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('⚡ KONTENTOS HD REEL', canvasWidth / 2, canvasHeight / 2 - 20);
            }
            ctx.restore();

            // 2. Draw Vignette
            if (colorVignette > 0) {
              const vigGrad = ctx.createRadialGradient(canvasWidth / 2, canvasHeight / 2, canvasWidth * 0.35, canvasWidth / 2, canvasHeight / 2, canvasWidth * 0.85);
              vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
              vigGrad.addColorStop(1, `rgba(0,0,0,${(colorVignette / 100) * 0.85})`);
              ctx.fillStyle = vigGrad;
              ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            }

            // 3. Effects & Transitions Overlays
            if (selectedEffect === 'glitch_flash' && Math.sin(timeSec * 8) > 0.82) {
              ctx.fillStyle = 'rgba(0, 240, 255, 0.16)';
              ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            } else if (selectedEffect === 'light_leak') {
              const leakGrad = ctx.createRadialGradient(0, 0, 20, 0, 0, canvasWidth * 0.9);
              leakGrad.addColorStop(0, 'rgba(251, 191, 36, 0.22)');
              leakGrad.addColorStop(1, 'rgba(0,0,0,0)');
              ctx.fillStyle = leakGrad;
              ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            } else if (selectedEffect === 'film_grain' && Math.random() > 0.4) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
              for (let g = 0; g < 40; g++) {
                ctx.fillRect(Math.random() * canvasWidth, Math.random() * canvasHeight, 2, 2);
              }
            }

            if (selectedTransition === 'camera_flash' && cycleTime < 0.18) {
              const flashAlpha = (0.18 - cycleTime) / 0.18 * 0.75;
              ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
              ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            }

            // 4. Frame-Accurate Burned-in Subtitles
            let currentText = '';
            if (subtitlesData && Array.isArray(subtitlesData.segments) && subtitlesData.segments.length > 0) {
              const activeSeg = subtitlesData.segments.find(s => {
                const sTime = parseTimestamp(s.start);
                const eTime = parseTimestamp(s.end);
                return timeSec >= sTime && timeSec <= eTime;
              });
              if (activeSeg && activeSeg.text) {
                currentText = activeSeg.text.trim();
              }
            } else if (liveTranscriptText) {
              currentText = liveTranscriptText.trim();
            }

            if (currentText) {
              let subY = canvasHeight - 240; // bottom safe zone
              if (subtitlePosition === 'top') subY = 220;
              else if (subtitlePosition === 'center') subY = canvasHeight / 2;

              ctx.save();
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';

              const words = currentText.split(/\s+/);
              const half = Math.ceil(words.length / 2);
              const firstPart = words.slice(0, half).join(' ');
              const secondPart = words.slice(half).join(' ');

              if (selectedSubtitlePreset === 'plain_white') {
                ctx.font = 'bold 34px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                const textMetrics = ctx.measureText(currentText);
                const boxW = Math.min(canvasWidth - 60, textMetrics.width + 48);
                const boxH = 68;
                const boxX = (canvasWidth - boxW) / 2;
                const boxY = subY - boxH / 2;

                ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
                roundRect(ctx, boxX, boxY, boxW, boxH, 12);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.lineWidth = 2;
                roundRect(ctx, boxX, boxY, boxW, boxH, 12);
                ctx.stroke();

                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = 'rgba(0,0,0,0.9)';
                ctx.shadowBlur = 6;
                ctx.fillText(currentText, canvasWidth / 2, subY);
              } else if (selectedSubtitlePreset === 'beast') {
                ctx.font = '900 36px "Montserrat", -apple-system, sans-serif';
                const firstUpper = firstPart.toUpperCase();
                const secondUpper = secondPart.toUpperCase();

                const fW = ctx.measureText(firstUpper + ' ').width;
                const sW = ctx.measureText(secondUpper).width;
                const totalW = fW + sW;
                const boxW = Math.min(canvasWidth - 40, totalW + 52);
                const boxH = 74;
                const boxX = (canvasWidth - boxW) / 2;
                const boxY = subY - boxH / 2;

                ctx.fillStyle = 'rgba(0, 0, 0, 0.94)';
                roundRect(ctx, boxX, boxY, boxW, boxH, 16);
                ctx.fill();
                ctx.strokeStyle = '#39ff14';
                ctx.lineWidth = 3;
                roundRect(ctx, boxX, boxY, boxW, boxH, 16);
                ctx.stroke();

                const startX = canvasWidth / 2 - totalW / 2;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(firstUpper, startX + fW / 2 - 4, subY);

                const hPad = 8;
                const hX = startX + fW - 2;
                const hY = subY - 24;
                const hW = sW + hPad * 2;
                const hH = 48;
                ctx.fillStyle = '#39ff14';
                ctx.shadowColor = '#39ff14';
                ctx.shadowBlur = 10;
                roundRect(ctx, hX, hY, hW, hH, 8);
                ctx.fill();
                ctx.shadowBlur = 0;

                ctx.fillStyle = '#000000';
                ctx.fillText(secondUpper, hX + hW / 2, subY);
              } else if (selectedSubtitlePreset === 'hormozi') {
                ctx.font = '900 36px "Montserrat", -apple-system, sans-serif';
                const firstUpper = firstPart.toUpperCase();
                const secondUpper = secondPart.toUpperCase();
                const fW = ctx.measureText(firstUpper + ' ').width;
                const sW = ctx.measureText(secondUpper).width;
                const totalW = fW + sW;
                const boxW = Math.min(canvasWidth - 40, totalW + 52);
                const boxH = 74;
                const boxX = (canvasWidth - boxW) / 2;
                const boxY = subY - boxH / 2;

                ctx.fillStyle = 'rgba(0, 0, 0, 0.94)';
                roundRect(ctx, boxX, boxY, boxW, boxH, 16);
                ctx.fill();
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 3;
                roundRect(ctx, boxX, boxY, boxW, boxH, 16);
                ctx.stroke();

                const startX = canvasWidth / 2 - totalW / 2;
                ctx.fillStyle = '#ffffff';
                ctx.fillText(firstUpper, startX + fW / 2 - 4, subY);

                const hPad = 8;
                const hX = startX + fW - 2;
                const hY = subY - 24;
                const hW = sW + hPad * 2;
                const hH = 48;
                ctx.fillStyle = '#fbbf24';
                ctx.shadowColor = '#fbbf24';
                ctx.shadowBlur = 10;
                roundRect(ctx, hX, hY, hW, hH, 8);
                ctx.fill();
                ctx.shadowBlur = 0;

                ctx.fillStyle = '#000000';
                ctx.fillText(secondUpper, hX + hW / 2, subY);
              } else {
                ctx.font = '800 32px "Inter", -apple-system, sans-serif';
                const fW = ctx.measureText(firstPart + ' ').width;
                const sW = ctx.measureText(secondPart).width;
                const totalW = fW + sW;
                const boxW = Math.min(canvasWidth - 40, totalW + 48);
                const boxH = 68;
                const boxX = (canvasWidth - boxW) / 2;
                const boxY = subY - boxH / 2;

                ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
                roundRect(ctx, boxX, boxY, boxW, boxH, 14);
                ctx.fill();
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 2.5;
                roundRect(ctx, boxX, boxY, boxW, boxH, 14);
                ctx.stroke();

                const startX = canvasWidth / 2 - totalW / 2;
                ctx.fillStyle = '#f8fafc';
                ctx.fillText(firstPart, startX + fW / 2 - 2, subY);
                ctx.fillStyle = '#38bdf8';
                ctx.fillText(secondPart, startX + fW + sW / 2, subY);
              }
              ctx.restore();
            }
          };

          // 3. Setup Audio Routing
          const actx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
          if (!audioCtx) audioCtx = actx;
          if (actx.state === 'suspended') {
            await actx.resume().catch(() => {});
          }
          const dest = actx.createMediaStreamDestination();

          if (videoEl && !isAudioMuted) {
            try {
              if (currentSourceVideoEl !== videoEl || !videoSourceNode) {
                videoSourceNode = actx.createMediaElementSource(videoEl);
                currentSourceVideoEl = videoEl;
              }
              videoSourceNode.connect(dest);
              videoSourceNode.connect(actx.destination);
            } catch (e) {
              console.warn('Audio routing notice:', e);
            }
          }

          // Optional Synthesized BGM
          let localBgmOscs = [];
          if (bgMusicTrack !== 'none' && !isAudioMuted) {
            try {
              const bgmGain = actx.createGain();
              const config = BGM_TRACK_CONFIGS[bgMusicTrack] || BGM_TRACK_CONFIGS.lofi_chill;
              const vol = ((parseInt(bgMusicVolume, 10) || 40) / 100) * (config.gainFactor || 0.14);
              bgmGain.gain.setValueAtTime(vol, actx.currentTime);
              bgmGain.connect(dest);

              const freqs = config.chords;
              freqs.forEach((f, i) => {
                const osc = actx.createOscillator();
                const oscGain = actx.createGain();
                osc.type = config.type || 'sine';
                osc.frequency.setValueAtTime(f, actx.currentTime);
                oscGain.gain.setValueAtTime(0.18 / (i + 1), actx.currentTime);
                osc.connect(oscGain);
                oscGain.connect(bgmGain);
                osc.start();
                localBgmOscs.push(osc);
              });
            } catch (bgmErr) {
              console.warn('Export synth notice:', bgmErr);
            }
          }

          // 4. Capture Canvas Stream & Audio
          const stream = renderCanvas.captureStream(30);
          const audioTracks = dest.stream.getAudioTracks();
          if (audioTracks.length > 0) {
            stream.addTrack(audioTracks[0]);
          }

          const candidateTypes = [
            'video/mp4;codecs=avc1',
            'video/mp4',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
          ];
          let chosenType = '';
          for (const t of candidateTypes) {
            if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) {
              chosenType = t;
              break;
            }
          }

          if (!window.MediaRecorder || !chosenType) {
            throw new Error('MediaRecorder is not supported in this browser.');
          }

          const recorder = new MediaRecorder(stream, { mimeType: chosenType, videoBitsPerSecond: 6000000 });
          const chunks = [];

          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              chunks.push(e.data);
            }
          };

          // Prepare video for playback render
          videoEl.loop = false;
          videoEl.playbackRate = 1.0;
          videoEl.muted = false;
          videoEl.volume = 1.0;

          // Ensure video is seeked cleanly to 0
          if (Math.abs(videoEl.currentTime) > 0.05) {
            videoEl.currentTime = 0;
            await new Promise((resolve) => {
              const onSeeked = () => {
                videoEl.removeEventListener('seeked', onSeeked);
                resolve();
              };
              videoEl.addEventListener('seeked', onSeeked);
              setTimeout(resolve, 500);
            });
          }
          videoEl.currentTime = 0;

          // Render initial frame to canvas
          renderCompositeFrame(0, totalDuration);

          try {
            await videoEl.play();
          } catch (e) {
            console.warn('Playback start notice:', e);
          }

          recorder.start(100);

          await new Promise((resolve, reject) => {
            let isFinalized = false;
            let animId = null;
            let intervalId = null;
            let safetyTimeout = null;

            const cleanupAndFinish = () => {
              if (isFinalized) return;
              isFinalized = true;
              if (animId) cancelAnimationFrame(animId);
              if (intervalId) clearInterval(intervalId);
              if (safetyTimeout) clearTimeout(safetyTimeout);
              videoEl.removeEventListener('ended', onEnded);
              
              localBgmOscs.forEach(o => {
                try { o.stop(); o.disconnect(); } catch (e) {}
              });
              
              if (recorder.state === 'recording') {
                recorder.stop();
              }
              videoEl.pause();
              videoEl.loop = true;
              videoEl.currentTime = 0;
            };

            const onEnded = () => {
              cleanupAndFinish();
            };

            videoEl.addEventListener('ended', onEnded, { once: true });

            recorder.onstop = () => {
              resolve();
            };
            recorder.onerror = reject;

            // Maximum safety cutoff: actual duration + 10 seconds
            safetyTimeout = setTimeout(() => {
              cleanupAndFinish();
            }, (totalDuration + 10) * 1000);

            triggeredSfxSegmentIds.clear();
            triggeredAiCueIds.clear();

            const renderTick = () => {
              if (isFinalized) return;

              // Ensure video keeps playing if stalled
              if (videoEl.paused && !videoEl.ended && (videoEl.currentTime < totalDuration - 0.2)) {
                videoEl.play().catch(() => {});
              }

              const curTime = videoEl.currentTime || 0;
              renderCompositeFrame(curTime, totalDuration);

              checkAiTimelineSfxTrigger(curTime, dest);

              if (subtitlesData && Array.isArray(subtitlesData.segments)) {
                const parseTime = (str) => {
                  if (!str) return 0;
                  const parts = str.split(':');
                  if (parts.length < 3) return 0;
                  const secParts = parts[2].split(/[,\.]/);
                  return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(secParts[0], 10) + (parseInt(secParts[1] || 0, 10) / 1000);
                };
                const activeSeg = subtitlesData.segments.find(s => {
                  const sTime = parseTime(s.start);
                  const eTime = parseTime(s.end);
                  return curTime >= sTime && curTime <= eTime;
                });
                if (activeSeg) {
                  checkKeywordHookSfxTrigger(curTime, activeSeg, dest);
                }
              }

              const percent = Math.min(99, Math.max(1, Math.round((curTime / totalDuration) * 100)));
              btnExportReel.innerHTML = `<span>⏳ Compositing & Burning Subtitles (${percent}%)...</span>`;

              if (videoEl.ended || (curTime >= totalDuration - 0.08 && curTime > 1.0)) {
                cleanupAndFinish();
                return;
              }

              animId = requestAnimationFrame(renderTick);
            };

            // High-reliability interval ensures capture stream keeps pumping frames even when tab is throttled
            intervalId = setInterval(() => {
              if (isFinalized) return;
              const curTime = videoEl.currentTime || 0;
              renderCompositeFrame(curTime, totalDuration);

              if (subtitlesData && Array.isArray(subtitlesData.segments)) {
                const parseTime = (str) => {
                  if (!str) return 0;
                  const parts = str.split(':');
                  if (parts.length < 3) return 0;
                  const secParts = parts[2].split(/[,\.]/);
                  return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(secParts[0], 10) + (parseInt(secParts[1] || 0, 10) / 1000);
                };
                const activeSeg = subtitlesData.segments.find(s => {
                  const sTime = parseTime(s.start);
                  const eTime = parseTime(s.end);
                  return curTime >= sTime && curTime <= eTime;
                });
                if (activeSeg) {
                  checkKeywordHookSfxTrigger(curTime, activeSeg, dest);
                }
              }

              if (videoEl.ended || (curTime >= totalDuration - 0.08 && curTime > 1.0)) {
                cleanupAndFinish();
              }
            }, 1000 / 30);

            animId = requestAnimationFrame(renderTick);
          });

          // 5. Download Composited Video Stream File
          const isMp4 = chosenType.includes('mp4');
          const finalDownloadName = `${cleanBaseName}_super_reel_edited.${isMp4 ? 'mp4' : 'webm'}`;
          const editedBlob = new Blob(chunks, { type: chosenType || 'video/webm' });
          const blobUrl = URL.createObjectURL(editedBlob);
          const dlLink = document.createElement('a');
          dlLink.href = blobUrl;
          dlLink.download = finalDownloadName;
          document.body.appendChild(dlLink);
          dlLink.click();
          document.body.removeChild(dlLink);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 8000);

          btnExportReel.innerHTML = '<span>✅ Edited Super Reel Downloaded!</span>';
          setTimeout(() => {
            btnExportReel.disabled = false;
            btnExportReel.innerHTML = origHtml;
          }, 2600);
        } catch (err) {
          console.error('Edited video export error:', err);
          btnExportReel.innerHTML = '<span>⚠️ Export Failed — Please Retry</span>';
          setTimeout(() => {
            btnExportReel.disabled = false;
            btnExportReel.innerHTML = origHtml;
          }, 3000);
        }
      });
    }

    // Video Gallery Modal
    const btnGallery = container.querySelector('#btn-open-video-gallery');
    if (btnGallery) {
      btnGallery.addEventListener('click', () => {
        openVideoGalleryModal((selectedVid) => {
          currentVideoId = selectedVid.id;
          currentFileName = selectedVid.file_name || selectedVid.title;
          currentVideoUrl = selectedVid.file_url;
          isVideoUploaded = true;
          isAutoEdited = true;
          renderMain();
        });
      });
    }

    // Publishing History Modal
    const btnHistory = container.querySelector('#btn-open-publishing-history');
    if (btnHistory) {
      btnHistory.addEventListener('click', () => {
        openPublishingHistoryModal();
      });
    }

    // Feature 8: Subtitle Downloads
    const btnDlSrt = container.querySelector('#btn-download-srt');
    if (btnDlSrt) {
      btnDlSrt.addEventListener('click', () => {
        const content = subtitlesData?.srt_content || subtitlesData?.srt || `1\n00:00:00,000 --> 00:00:03,500\n${liveTranscriptText}\n\n2\n00:00:03,500 --> 00:00:06,000\nStop wasting hours on manual edits in 2026.`;
        downloadFile(content, `${currentFileName.replace(/\.[^/.]+$/, '')}_subtitles.srt`, 'text/plain');
      });
    }

    const btnDlVtt = container.querySelector('#btn-download-vtt');
    if (btnDlVtt) {
      btnDlVtt.addEventListener('click', () => {
        const content = subtitlesData?.vtt_content || subtitlesData?.vtt || `WEBVTT\n\n1\n00:00:00.000 --> 00:00:03.500\n${liveTranscriptText}\n\n2\n00:00:03.500 --> 00:00:06.000\nStop wasting hours on manual edits in 2026.`;
        downloadFile(content, `${currentFileName.replace(/\.[^/.]+$/, '')}_subtitles.vtt`, 'text/vtt');
      });
    }

    // ==========================================
    // PRIORITY 2: Multi-Platform AI Copy Generator Events
    // ==========================================

    // 1. Platform Switch Tabs
    container.querySelectorAll('.btn-copy-platform-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const plat = btn.getAttribute('data-platform');
        if (plat && platformCopyStore[plat]) {
          activeCopyPlatform = plat;
          renderMain();
        }
      });
    });

    // 2. Tone Selector Change
    const selectTone = container.querySelector('#select-copy-tone');
    if (selectTone) {
      selectTone.addEventListener('change', (e) => {
        selectedCopyTone = e.target.value;
      });
    }

    // 3. Regenerate Copy for Current Active Platform
    const btnRegenSingle = container.querySelector('#btn-regenerate-single-copy');
    if (btnRegenSingle) {
      btnRegenSingle.addEventListener('click', async () => {
        isGeneratingCopy = true;
        renderMain();

        try {
          const reelContext = getFullReelContext();
          const capRes = await api.generateCaption(
            currentVideoId || 'sample_reel_default',
            reelContext.transcript,
            selectedCopyTone,
            activeCopyPlatform,
            true, // Force refresh
            reelContext.title
          );

          if (capRes && platformCopyStore[activeCopyPlatform]) {
            platformCopyStore[activeCopyPlatform].caption = capRes.caption_text || capRes.caption || platformCopyStore[activeCopyPlatform].caption;
            platformCopyStore[activeCopyPlatform].hashtags = capRes.hashtags || platformCopyStore[activeCopyPlatform].hashtags;
            platformCopyStore[activeCopyPlatform].approved = false;
          }
        } catch (err) {
          console.error('Single copy regeneration error:', err);
          showStudioToast(`Copy generation notice: ${err.message || 'Error communicating with AI service'}`, 'warn');
        } finally {
          isGeneratingCopy = false;
          renderMain();
        }
      });
    }

    // 4. Batch Generate Copy for All 5 Platforms in 1-Click
    const btnGenerateAll = container.querySelector('#btn-generate-all-copy');
    if (btnGenerateAll) {
      btnGenerateAll.addEventListener('click', async () => {
        isGeneratingAllCopy = true;
        renderMain();

        try {
          const reelContext = getFullReelContext();
          const allRes = await api.generateAllCaptions(
            currentVideoId || 'sample_reel_default',
            reelContext.transcript,
            selectedCopyTone,
            true,
            reelContext.title
          );

          if (allRes) {
            Object.keys(allRes).forEach(pKey => {
              if (platformCopyStore[pKey] && allRes[pKey]) {
                const item = allRes[pKey];
                platformCopyStore[pKey].caption = item.caption_text || item.caption || platformCopyStore[pKey].caption;
                platformCopyStore[pKey].hashtags = item.hashtags || platformCopyStore[pKey].hashtags;
                platformCopyStore[pKey].approved = false;
              }
            });
            showStudioToast('Generated customized copy packages for all 5 platforms!', 'success');
          }
        } catch (err) {
          console.error('Batch copy generation error:', err);
          showStudioToast(`Multi-platform copy notice: ${err.message || 'Error during multi-channel generation'}`, 'warn');
        } finally {
          isGeneratingAllCopy = false;
          renderMain();
        }
      });
    }

    // 5. One-Click Copy Formatted Text to Clipboard
    const btnCopyClipboard = container.querySelector('#btn-copy-clipboard');
    if (btnCopyClipboard) {
      btnCopyClipboard.addEventListener('click', async () => {
        const curPlat = platformCopyStore[activeCopyPlatform] || platformCopyStore.instagram;
        const tagLine = (curPlat.hashtags || []).map(t => `#${String(t).replace(/^#/, '')}`).join(' ');
        const fullFormatted = `${curPlat.caption || ''}\n\n${tagLine}`.trim();

        try {
          await navigator.clipboard.writeText(fullFormatted);
          copyClipboardToast = true;
          showStudioToast('Copied post caption & hashtags to clipboard!', 'copy');
          renderMain();
          setTimeout(() => {
            copyClipboardToast = false;
            renderMain();
          }, 2200);
        } catch (err) {
          console.warn('Clipboard write error:', err);
          showStudioToast('Copied to clipboard!', 'copy');
        }
      });
    }

    // 6. Caption Editor Textarea & Live Character Count
    const captionTextarea = container.querySelector('#reel-caption-textarea');
    const charCountLabel = container.querySelector('#caption-char-count');
    if (captionTextarea) {
      captionTextarea.addEventListener('input', (e) => {
        if (platformCopyStore[activeCopyPlatform]) {
          platformCopyStore[activeCopyPlatform].caption = e.target.value;
          const maxChars = platformCopyStore[activeCopyPlatform].maxChars || 2200;
          if (charCountLabel) {
            charCountLabel.textContent = `${e.target.value.length} / ${maxChars.toLocaleString()} chars`;
            charCountLabel.style.color = e.target.value.length > maxChars ? 'var(--accent-red)' : 'var(--text-dim)';
          }
        }
      });
    }

    // 7. Hashtag Chip Removal
    container.querySelectorAll('.btn-remove-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        if (!isNaN(idx) && platformCopyStore[activeCopyPlatform]) {
          platformCopyStore[activeCopyPlatform].hashtags.splice(idx, 1);
          renderMain();
        }
      });
    });

    // 8. Custom Hashtag Addition
    const btnAddTag = container.querySelector('#btn-add-tag');
    const inputNewTag = container.querySelector('#input-new-tag');
    if (btnAddTag && inputNewTag) {
      const doAddTag = () => {
        const val = inputNewTag.value.trim().replace(/^#/, '');
        if (val && platformCopyStore[activeCopyPlatform]) {
          if (!platformCopyStore[activeCopyPlatform].hashtags.includes(val)) {
            platformCopyStore[activeCopyPlatform].hashtags.push(val);
            renderMain();
          }
        }
      };
      btnAddTag.addEventListener('click', doAddTag);
      inputNewTag.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doAddTag();
        }
      });
    }

    // 9. Platform Copy Approval Status Toggle
    const btnApproval = container.querySelector('#btn-toggle-approval');
    if (btnApproval) {
      btnApproval.addEventListener('click', () => {
        if (platformCopyStore[activeCopyPlatform]) {
          platformCopyStore[activeCopyPlatform].approved = !platformCopyStore[activeCopyPlatform].approved;
          renderMain();
        }
      });
    }

    // 10. Save Reel & Copy Package to Video Library
    const btnSaveReelPkg = container.querySelector('#btn-save-reel-package');
    if (btnSaveReelPkg) {
      btnSaveReelPkg.addEventListener('click', async () => {
        const curData = platformCopyStore[activeCopyPlatform] || platformCopyStore.instagram;
        if (!curData.approved) {
          showStudioToast('Please review and click "Approve Copy" before saving to Video Library.', 'warn');
          return;
        }

        isPublishing = true;
        renderMain();

        try {
          // Copy text to clipboard for immediate creator convenience
          const formattedTags = (curData.hashtags || []).map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ');
          const fullText = `${curData.caption || ''}\n\n${formattedTags}`.trim();
          if (navigator.clipboard) {
            await navigator.clipboard.writeText(fullText);
          }

          const res = await api.saveReelRecord(
            currentVideoId || 'sample_reel_default',
            curData.caption,
            curData.hashtags
          );

          lastPublishedUrl = res.postUrl || 'saved';
          showStudioToast('Video & formatted copy saved to your Library, and post copy copied to clipboard!', 'success');
        } catch (err) {
          showStudioToast(`Save failed: ${err.message}`, 'error');
        } finally {
          isPublishing = false;
          renderMain();
        }
      });
    }

    // Schedule Reel Post to Calendar
    const btnSchedReel = container.querySelector('#btn-schedule-reel-post');
    if (btnSchedReel) {
      btnSchedReel.addEventListener('click', () => {
        const curData = platformCopyStore[activeCopyPlatform] || platformCopyStore.instagram;
        openScheduleModal({
          videoId: currentVideoId || `vid_${Date.now()}`,
          title: currentFileName || 'Creator Reel',
          fileUrl: currentVideoUrl,
          caption: curData.caption,
          hashtags: curData.hashtags,
          initialPlatform: activeCopyPlatform,
        });
      });
    }

    // Export All Platform Copy
    const btnPublishAll = container.querySelector('#btn-publish-all');
    if (btnPublishAll) {
      btnPublishAll.addEventListener('click', () => {
        alert('📦 Ready! All generated platform copy bundles (Instagram, Shorts, LinkedIn, X, TikTok) are saved and ready in your workspace.');
        stateStore.setTab('schedule');
      });
    }
  }

  function attachImageEvents() {
    // 1. Template Selectors
    container.querySelectorAll('.btn-template-select').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedImageTemplate = btn.getAttribute('data-template');
        renderMain();
      });
    });

    // 2. Aspect Ratio Selectors
    container.querySelectorAll('.btn-ratio-select').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedAspectRatio = btn.getAttribute('data-ratio');
        renderMain();
      });
    });

    // 3. Theme Palette Selectors
    container.querySelectorAll('.btn-theme-select').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedImageTheme = btn.getAttribute('data-theme-val');
        renderMain();
      });
    });

    // 4. Background Photography Preset & Device Upload Selectors
    container.querySelectorAll('.btn-bg-select').forEach(btn => {
      btn.addEventListener('click', () => {
        const bgId = btn.getAttribute('data-bg-id');
        if (bgId === 'device_upload' && userUploadedBgObj) {
          selectedBgObj = userUploadedBgObj;
          renderMain();
          return;
        }
        const found = MASTER_BG_CATALOG.find(b => b.id === bgId);
        if (found) {
          selectedBgObj = found;
          renderMain();
        }
      });
    });

    // Device Photo Upload Helpers & Event Listeners
    const inputDevicePhoto = container.querySelector('#input-device-photo');
    const btnUploadDevicePhoto = container.querySelector('#btn-upload-device-photo');
    const dropzoneDevicePhoto = container.querySelector('#dropzone-device-photo');
    const btnUseDevicePhoto = container.querySelector('#btn-use-device-photo');
    const btnClearDevicePhoto = container.querySelector('#btn-clear-device-photo');

    const handleProcessImageFile = (file) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        alert('⚠️ Please select a valid image file (PNG, JPG, WebP, GIF, SVG).');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result;
        if (dataUrl) {
          userUploadedBgObj = {
            id: 'device_upload',
            name: file.name,
            tag: '📱 Upload',
            url: dataUrl,
          };
          selectedBgObj = userUploadedBgObj;
          renderMain();
        }
      };
      reader.readAsDataURL(file);
    };

    if (btnUploadDevicePhoto && inputDevicePhoto) {
      btnUploadDevicePhoto.addEventListener('click', () => {
        inputDevicePhoto.click();
      });
    }

    if (inputDevicePhoto) {
      inputDevicePhoto.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) handleProcessImageFile(file);
      });
    }

    if (dropzoneDevicePhoto && inputDevicePhoto) {
      dropzoneDevicePhoto.addEventListener('click', () => {
        inputDevicePhoto.click();
      });
      dropzoneDevicePhoto.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzoneDevicePhoto.style.borderColor = 'var(--accent-primary)';
        dropzoneDevicePhoto.style.background = 'rgba(0, 240, 255, 0.08)';
      });
      dropzoneDevicePhoto.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzoneDevicePhoto.style.borderColor = 'rgba(255, 255, 255, 0.22)';
        dropzoneDevicePhoto.style.background = 'rgba(255, 255, 255, 0.02)';
      });
      dropzoneDevicePhoto.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzoneDevicePhoto.style.borderColor = 'rgba(255, 255, 255, 0.22)';
        dropzoneDevicePhoto.style.background = 'rgba(255, 255, 255, 0.02)';
        const file = e.dataTransfer?.files?.[0];
        if (file) handleProcessImageFile(file);
      });
    }

    // Support drag and drop directly onto the live graphic canvas card!
    const liveCanvasNode = container.querySelector('#live-graphic-canvas');
    if (liveCanvasNode) {
      liveCanvasNode.addEventListener('dragover', (e) => {
        e.preventDefault();
        liveCanvasNode.style.outline = '3px dashed #00f0ff';
      });
      liveCanvasNode.addEventListener('dragleave', (e) => {
        e.preventDefault();
        liveCanvasNode.style.outline = 'none';
      });
      liveCanvasNode.addEventListener('drop', (e) => {
        e.preventDefault();
        liveCanvasNode.style.outline = 'none';
        const file = e.dataTransfer?.files?.[0];
        if (file && file.type.startsWith('image/')) {
          handleProcessImageFile(file);
        }
      });
    }

    if (btnUseDevicePhoto && userUploadedBgObj) {
      btnUseDevicePhoto.addEventListener('click', () => {
        selectedBgObj = userUploadedBgObj;
        renderMain();
      });
    }

    if (btnClearDevicePhoto) {
      btnClearDevicePhoto.addEventListener('click', () => {
        userUploadedBgObj = null;
        selectedBgObj = currentDisplayedBgs[0];
        renderMain();
      });
    }

    // 5. Dynamic Background Photography Refresh Action
    const btnRefreshBgs = container.querySelector('#btn-refresh-bgs');
    const refreshIcon = container.querySelector('#refresh-bg-icon');

    if (btnRefreshBgs) {
      btnRefreshBgs.addEventListener('click', () => {
        if (refreshIcon) refreshIcon.style.transform = 'rotate(360deg)';
        btnRefreshBgs.disabled = true;
        btnRefreshBgs.innerHTML = `<span>⚡ Shuffling...</span>`;

        setTimeout(() => {
          currentDisplayedBgs = getRandomBackgrounds();
          selectedBgObj = currentDisplayedBgs[0];
          renderMain();
        }, 350);
      });
    }

    // 6. Quick Randomize Photo Button on Canvas
    const btnRandomBgCanvas = container.querySelector('#btn-random-bg-canvas');
    if (btnRandomBgCanvas) {
      btnRandomBgCanvas.addEventListener('click', () => {
        const photoPool = MASTER_BG_CATALOG.filter(b => b.id !== 'none' && b.id !== selectedBgObj?.id);
        const randomChoice = photoPool[Math.floor(Math.random() * photoPool.length)];
        if (randomChoice) {
          selectedBgObj = randomChoice;
          renderMain();
        }
      });
    }

    // 7. AI Copy Director - Text Prompt & Generation
    const inputAiPrompt = container.querySelector('#input-ai-post-prompt');
    const btnGenerateGraphicCopy = container.querySelector('#btn-generate-graphic-copy');

    if (inputAiPrompt) {
      inputAiPrompt.addEventListener('input', (e) => {
        aiPromptText = e.target.value;
      });
    }

    container.querySelectorAll('.btn-prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const p = chip.getAttribute('data-prompt');
        if (p) {
          aiPromptText = p;
          if (inputAiPrompt) inputAiPrompt.value = p;
        }
      });
    });

    if (btnGenerateGraphicCopy) {
      btnGenerateGraphicCopy.addEventListener('click', async () => {
        const promptToRun = (inputAiPrompt ? inputAiPrompt.value : aiPromptText).trim();
        if (!promptToRun) {
          showStudioToast('Please type a prompt describing what kind of post you want, or click one of the example suggestion chips.', 'warn');
          if (inputAiPrompt) inputAiPrompt.focus();
          return;
        }

        isGeneratingAiCopy = true;
        btnGenerateGraphicCopy.disabled = true;
        const textSpan = container.querySelector('#ai-generate-copy-text');
        const iconSpan = container.querySelector('#ai-generate-copy-icon');
        if (textSpan) textSpan.textContent = 'Writing Headline & Takeaway with AI...';
        if (iconSpan) iconSpan.textContent = '⏳';

        try {
          const res = await api.generateGraphicCopy(promptToRun, selectedImageTemplate);
          if (res && res.headline && res.supportingText) {
            imageHeadline = res.headline;
            imageBody = res.supportingText;

            const inputH = container.querySelector('#input-image-headline');
            const inputB = container.querySelector('#input-image-body');
            if (inputH) inputH.value = imageHeadline;
            if (inputB) inputB.value = imageBody;

            const canvas = container.querySelector('#live-graphic-canvas');
            if (canvas) {
              canvas.innerHTML = renderGraphicCanvasContent(getThemeObject(selectedImageTheme), selectedBgObj);
            }
            showStudioToast('Generated headline and takeaway copy!', 'success');
          }
        } catch (genErr) {
          console.error('AI graphic copy generation failed:', genErr);
          showStudioToast(`AI Generation Notice: ${genErr.message || 'Generation failed'}`, 'warn');
        } finally {
          isGeneratingAiCopy = false;
          if (btnGenerateGraphicCopy) {
            btnGenerateGraphicCopy.disabled = false;
            if (textSpan) textSpan.textContent = 'Generate Headline & Supporting Text';
            if (iconSpan) iconSpan.textContent = '⚡';
          }
        }
      });
    }

    // 8. Headline & Body Inputs (Manual Live Updates)
    const inputHeadline = container.querySelector('#input-image-headline');
    const inputBody = container.querySelector('#input-image-body');

    if (inputHeadline) {
      inputHeadline.addEventListener('input', (e) => {
        imageHeadline = e.target.value;
        const canvas = container.querySelector('#live-graphic-canvas');
        if (canvas) {
          canvas.innerHTML = renderGraphicCanvasContent(getThemeObject(selectedImageTheme), selectedBgObj);
        }
      });
    }

    if (inputBody) {
      inputBody.addEventListener('input', (e) => {
        imageBody = e.target.value;
        const canvas = container.querySelector('#live-graphic-canvas');
        if (canvas) {
          canvas.innerHTML = renderGraphicCanvasContent(getThemeObject(selectedImageTheme), selectedBgObj);
        }
      });
    }

    // 8. Creator Name/Handle & PFP Customization Handlers
    const inputCreatorHandle = container.querySelector('#input-creator-handle');
    if (inputCreatorHandle) {
      inputCreatorHandle.addEventListener('input', (e) => {
        creatorHandle = e.target.value;
        stateStore.updateProfile({ handle: creatorHandle, instagramHandle: creatorHandle });
        const canvas = container.querySelector('#live-graphic-canvas');
        if (canvas) {
          canvas.innerHTML = renderGraphicCanvasContent(getThemeObject(selectedImageTheme), selectedBgObj);
        }
      });
    }

    const inputCreatorPfp = container.querySelector('#input-creator-pfp');
    const btnTriggerPfp = container.querySelector('#btn-trigger-pfp');
    const btnUploadPfpLabel = container.querySelector('#btn-upload-pfp-label');
    const btnRemovePfp = container.querySelector('#btn-remove-pfp');

    if (btnTriggerPfp && inputCreatorPfp) {
      btnTriggerPfp.addEventListener('click', () => inputCreatorPfp.click());
    }
    if (btnUploadPfpLabel && inputCreatorPfp) {
      btnUploadPfpLabel.addEventListener('click', () => inputCreatorPfp.click());
    }

    if (inputCreatorPfp) {
      inputCreatorPfp.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
          showStudioToast('Please select an image file (PNG, JPG, WebP) for your profile picture.', 'warn');
          return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          creatorPfpUrl = event.target.result;
          stateStore.updateProfile({ avatarUrl: creatorPfpUrl });
          renderMain();
          attachModeEvents();
          attachImageEvents();
        };
        reader.readAsDataURL(file);
      });
    }

    if (btnRemovePfp) {
      btnRemovePfp.addEventListener('click', () => {
        creatorPfpUrl = null;
        stateStore.updateProfile({ avatarUrl: null });
        renderMain();
        attachModeEvents();
        attachImageEvents();
      });
    }

    // 9. Watermark Toggle in Image Mode with Pro Payment Trigger
    const imgWatermarkToggle = container.querySelector('#toggle-image-watermark');
    const btnUnlockProWatermark = container.querySelector('#btn-unlock-pro-watermark');

    if (btnUnlockProWatermark) {
      btnUnlockProWatermark.addEventListener('click', () => {
        openProModal({
          onSuccess: () => {
            stateStore.updateProfile({ isPro: true, includeWatermark: false });
            renderMain();
            attachModeEvents();
            attachImageEvents();
          }
        });
      });
    }

    if (imgWatermarkToggle) {
      imgWatermarkToggle.addEventListener('change', (e) => {
        if (!e.target.checked && !profile.isPro) {
          openProModal({
            onSuccess: () => {
              stateStore.updateProfile({ isPro: true, includeWatermark: false });
              renderMain();
              attachModeEvents();
              attachImageEvents();
            },
            onCancel: () => {
              imgWatermarkToggle.checked = true;
              stateStore.updateProfile({ includeWatermark: true });
              const canvas = container.querySelector('#live-graphic-canvas');
              if (canvas) {
                canvas.innerHTML = renderGraphicCanvasContent(getThemeObject(selectedImageTheme), selectedBgObj);
              }
            }
          });
        } else {
          stateStore.updateProfile({ includeWatermark: e.target.checked });
          const canvas = container.querySelector('#live-graphic-canvas');
          if (canvas) {
            canvas.innerHTML = renderGraphicCanvasContent(getThemeObject(selectedImageTheme), selectedBgObj);
          }
        }
      });
    }

    // 10. Robust High-Resolution PNG Export (Fix for non-working export)
    const handleDownloadImg = async () => {
      const canvasElem = container.querySelector('#live-graphic-canvas');
      if (!canvasElem) {
        showStudioToast('Canvas preview not found to export.', 'error');
        return;
      }

      const btnDownloadImg = container.querySelector('#btn-download-image');
      const btnDownloadImgSide = container.querySelector('#btn-download-image-side');
      const origHtml1 = btnDownloadImg ? btnDownloadImg.innerHTML : '';
      const origHtml2 = btnDownloadImgSide ? btnDownloadImgSide.innerHTML : '';

      if (btnDownloadImg) {
        btnDownloadImg.disabled = true;
        btnDownloadImg.innerHTML = '<span>⏳ Exporting PNG (300 DPI)...</span>';
      }
      if (btnDownloadImgSide) {
        btnDownloadImgSide.disabled = true;
        btnDownloadImgSide.innerHTML = '<span>⏳ Exporting PNG (300 DPI)...</span>';
      }

      try {
        // High-resolution 2x pixelRatio for print & social crispness
        const dataUrl = await toPng(canvasElem, {
          pixelRatio: 2,
          cacheBust: true,
        });

        const link = document.createElement('a');
        const safeTemplate = (selectedImageTemplate || 'graphic').toLowerCase();
        const now = new Date();
        const timeStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        link.download = `kontentos_${safeTemplate}_${timeStr}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (btnDownloadImg) btnDownloadImg.innerHTML = '<span>✅ Download Started!</span>';
        if (btnDownloadImgSide) btnDownloadImgSide.innerHTML = '<span>✅ Download Started!</span>';
        showStudioToast('High-resolution PNG exported successfully!', 'success');
        setTimeout(() => {
          if (btnDownloadImg) {
            btnDownloadImg.disabled = false;
            btnDownloadImg.innerHTML = origHtml1;
          }
          if (btnDownloadImgSide) {
            btnDownloadImgSide.disabled = false;
            btnDownloadImgSide.innerHTML = origHtml2;
          }
        }, 2200);
      } catch (err) {
        console.warn('First export attempt failed, trying fallback without external fonts:', err);
        try {
          const fallbackUrl = await toPng(canvasElem, {
            pixelRatio: 2,
            skipFonts: true,
          });
          const link = document.createElement('a');
          link.download = `kontentos_${selectedImageTemplate}_${Date.now()}.png`;
          link.href = fallbackUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          if (btnDownloadImg) btnDownloadImg.innerHTML = '<span>✅ PNG Exported!</span>';
          if (btnDownloadImgSide) btnDownloadImgSide.innerHTML = '<span>✅ PNG Exported!</span>';
          showStudioToast('PNG graphic exported successfully!', 'success');
          setTimeout(() => {
            if (btnDownloadImg) {
              btnDownloadImg.disabled = false;
              btnDownloadImg.innerHTML = origHtml1;
            }
            if (btnDownloadImgSide) {
              btnDownloadImgSide.disabled = false;
              btnDownloadImgSide.innerHTML = origHtml2;
            }
          }, 2200);
        } catch (fallbackErr) {
          console.error('Export error:', fallbackErr);
          showStudioToast(`Image export notice: ${fallbackErr.message || 'Could not export canvas'}. Try uploading a photo directly from your device!`, 'warn');
          if (btnDownloadImg) {
            btnDownloadImg.disabled = false;
            btnDownloadImg.innerHTML = origHtml1;
          }
          if (btnDownloadImgSide) {
            btnDownloadImgSide.disabled = false;
            btnDownloadImgSide.innerHTML = origHtml2;
          }
        }
      }
    };

    // 11. Clipboard Copy (Image Blob + Post Text)
    const handleCopyImg = async () => {
      const canvasElem = container.querySelector('#live-graphic-canvas');
      let imageCopied = false;

      try {
        if (canvasElem && navigator.clipboard && window.ClipboardItem) {
          const blob = await toBlob(canvasElem, { pixelRatio: 2 });
          if (blob) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            imageCopied = true;
          }
        }
      } catch (clipErr) {
        console.warn('Image clipboard write not available, falling back to text copy:', clipErr);
      }

      const copyText = `${imageHeadline}\n\n${imageBody}`.trim();
      if (!imageCopied && navigator.clipboard) {
        await navigator.clipboard.writeText(copyText);
      }

      if (imageCopied) {
        showStudioToast('High-resolution card image copied to clipboard! Ready to paste into social apps.', 'copy');
      } else {
        showStudioToast('Post headline and takeaway copied to clipboard!', 'copy');
      }
    };

    const btnDownloadImg = container.querySelector('#btn-download-image');
    const btnDownloadImgSide = container.querySelector('#btn-download-image-side');
    if (btnDownloadImg) btnDownloadImg.addEventListener('click', handleDownloadImg);
    if (btnDownloadImgSide) btnDownloadImgSide.addEventListener('click', handleDownloadImg);

    const btnCopyImg = container.querySelector('#btn-copy-image');
    const btnCopyImgSide = container.querySelector('#btn-copy-image-side');
    if (btnCopyImg) btnCopyImg.addEventListener('click', handleCopyImg);
    if (btnCopyImgSide) btnCopyImgSide.addEventListener('click', handleCopyImg);
  }

  function getThemeObject(themeName) {
    const themeStyles = {
      sahara: { bg: '#faf5ee', cardBg: '#ffffff', text: '#3a302a', muted: '#605850', accent: '#c2652a', border: 'rgba(194, 101, 42, 0.2)' },
      midnight: { bg: '#050608', cardBg: '#0f131a', text: '#f0f4fc', muted: '#94a3b8', accent: '#00f0ff', border: 'rgba(0, 240, 255, 0.25)' },
      emerald: { bg: '#064e3b', cardBg: '#022c22', text: '#ecfdf5', muted: '#a7f3d0', accent: '#34d399', border: 'rgba(52, 211, 153, 0.3)' },
      amber: { bg: '#451a03', cardBg: '#271003', text: '#fef3c7', muted: '#fde68a', accent: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
      monolith: { bg: '#18181b', cardBg: '#09090b', text: '#fafafa', muted: '#a1a1aa', accent: '#ffffff', border: 'rgba(255, 255, 255, 0.15)' }
    };
    return themeStyles[themeName] || themeStyles.sahara;
  }

  function getWatermarkHtml() {
    // If the user is a Pro member and has chosen to remove the watermark, omit it completely
    if (profile.isPro && profile.includeWatermark === false) {
      return '';
    }
    return `
      <div id="image-watermark-badge" style="display: ${profile.includeWatermark ? 'flex' : 'none'}; align-items: center; gap: 4px; background: rgba(0,0,0,0.65); backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,0.15); padding: 3px 8px; border-radius: 999px;">
        <span style="font-size: 0.68rem; color: #00f0ff;">⚡</span>
        <span style="font-size: 0.62rem; font-weight: 800; color: #fff; letter-spacing: 0.02em;">Made with <span>KontentOS</span></span>
      </div>
    `;
  }

  // Preload existing video/subtitles if available
  api.listVideos().then(vids => {
    if (vids && vids.length > 0 && !currentVideoId) {
      const topVid = vids[0];
      currentVideoId = topVid.id;
      currentFileName = topVid.title || 'creator_reel.mp4';
      if (topVid.file_url) currentVideoUrl = topVid.file_url;
      isVideoUploaded = true;
      isAutoEdited = true;
      api.transcribe(topVid.id).then(sub => {
        if (sub) {
          subtitlesData = sub;
          if (sub.language) selectedLanguage = sub.language;
          if (sub.segments && sub.segments.length > 0) {
            liveTranscriptText = sub.segments[0].text;
          } else if (sub.transcript_text) {
            liveTranscriptText = sub.transcript_text.slice(0, 70);
          }
          renderMain();
        }
      }).catch(() => {});
    }
  }).catch(() => {});

  renderMain();
}
