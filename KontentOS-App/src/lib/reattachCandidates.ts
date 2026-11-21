/**
 * A vanished source often has a perfectly good re-upload under the same filename. Rank that
 * current copy first so the repair is obvious, without ever swapping footage silently.
 */
export interface ReattachCandidate {
  id: string;
  title: string;
  file_url?: string;
  media_available?: boolean;
}

export function isSameTakeName(
  title: string | undefined,
  missingClipName: string | null | undefined,
): boolean {
  if (!title || !missingClipName) return false;
  return title.trim().toLocaleLowerCase() === missingClipName.trim().toLocaleLowerCase();
}

export function rankReattachCandidates<T extends ReattachCandidate>(
  videos: T[],
  missingSourceUrl: string | null,
  missingClipName?: string | null,
): T[] {
  if (!missingSourceUrl) return [];

  return videos
    .filter(
      (video) =>
        Boolean(video.file_url) &&
        video.file_url !== missingSourceUrl &&
        video.media_available !== false &&
        !video.title?.startsWith('kontentos_finished_reel_'),
    )
    .sort(
      (a, b) =>
        Number(isSameTakeName(b.title, missingClipName)) -
        Number(isSameTakeName(a.title, missingClipName)),
    );
}
