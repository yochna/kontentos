export interface BgmTrack {
  id: string;
  name: string;
  artist: string;
  genre: string;
  mood: string;
  icon: string;
  url: string;
  duration: string;
  tags: string[];
}

export const BGM_TRACKS: BgmTrack[] = [
  {
    id: 'lofi_chill',
    name: 'Apple Juice',
    artist: 'Chillhop Music',
    genre: 'Lo-Fi Chill',
    mood: 'Relaxed & Smooth · Cozy Beats',
    icon: 'headphones',
    url: '/audio/bgm/lofi_chill.mp3',
    duration: '2:11',
    tags: ['Lo-Fi', 'Chill', 'Vlog', 'Study'],
  },
  {
    id: 'chill_tozen',
    name: 'Tôzen',
    artist: 'Chillhop Music',
    genre: 'Melodic Beats',
    mood: 'Melodic & Calming · Atmospheric Chill',
    icon: 'spa',
    url: '/audio/bgm/chill_tozen.mp3',
    duration: '2:32',
    tags: ['Mellow', 'Aesthetic', 'Relax', 'Ambient'],
  },
  {
    id: 'upbeat_creator',
    name: '80s Synth Vibe',
    artist: 'Howler Studio',
    genre: 'Synthwave / Tech',
    mood: 'Energetic & Inspiring · Modern Tech',
    icon: 'bolt',
    url: '/audio/bgm/upbeat_creator.mp3',
    duration: '0:41',
    tags: ['Tech', 'Dynamic', 'Story', 'Inspiring'],
  },
  {
    id: 'cinematic_ambient',
    name: 'Running Out',
    artist: 'Howler Studio',
    genre: 'Cinematic Ambient',
    mood: 'Emotional & Deep · Atmospheric Film',
    icon: 'landscape',
    url: '/audio/bgm/cinematic_ambient.mp3',
    duration: '0:46',
    tags: ['Cinematic', 'Emotional', 'Deep', 'Drama'],
  },
  {
    id: 'viral_pulse',
    name: 'Rave Digger',
    artist: 'Howler Studio',
    genre: 'Electronic Pulse',
    mood: 'Rhythmic & Driving · Viral Reel Energy',
    icon: 'trending_up',
    url: '/audio/bgm/viral_pulse.mp3',
    duration: '0:53',
    tags: ['Trending', 'High Energy', 'Reels', 'Fast'],
  },
];

export function getBgmTrack(id?: string): BgmTrack | undefined {
  if (!id) return undefined;
  return BGM_TRACKS.find((t) => t.id === id);
}

export function resolveBgmUrl(assetId?: string, explicitUrl?: string): string | undefined {
  if (explicitUrl) return explicitUrl;
  if (!assetId) return undefined;
  return getBgmTrack(assetId)?.url;
}
