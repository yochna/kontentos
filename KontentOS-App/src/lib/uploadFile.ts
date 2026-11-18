/**
 * One intake contract for every door into the bench. The server is still the final gate, but a
 * clear answer before a single byte moves is what makes a drop feel reliable rather than silent.
 */
export const UPLOAD_EXTENSIONS = ['.mp4', '.mov', '.webm', '.m4v', '.mkv'] as const;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
/** The server allows three live sessions per creator; never start a fourth that must be refused. */
export const MAX_PARALLEL_UPLOADS = 3;
export const VIDEO_ACCEPT = UPLOAD_EXTENSIONS.join(',');

type UploadCandidate = Pick<File, 'name' | 'size'> & Partial<Pick<File, 'type'>>;

const allowed = new Set<string>(UPLOAD_EXTENSIONS);

/** A human-readable reason to refuse the file, or null when it can be intaked. */
export function uploadFileError(file: UploadCandidate): string | null {
  if (!file?.name) return 'That file has no name KontentOS can use.';
  if (file.size === 0) return `“${file.name}” is empty. Export the clip again and drop it here.`;
  if (file.size > MAX_UPLOAD_BYTES) {
    return `“${file.name}” is over the 2 GB limit. Export a shorter clip or compress it first.`;
  }
  if (file.type?.startsWith('audio/')) {
    return `“${file.name}” is audio only. The bench needs a video file.`;
  }
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (!allowed.has(ext)) {
    return `“${file.name}” is not a video KontentOS can read. Use MP4, MOV, WEBM, M4V or MKV.`;
  }
  return null;
}

export function isUploadableFile(file: UploadCandidate): boolean {
  return uploadFileError(file) === null;
}

/** Throws the same message the UI shows, so every upload path fails loudly and early. */
export function assertUploadableFile(file: UploadCandidate): void {
  const error = uploadFileError(file);
  if (error) throw new Error(error);
}
