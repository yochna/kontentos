/** Turn FFmpeg's generic exit code 1 into the one action that actually fixes that failure. */
export function explainFfmpegFailure(logs: string[]): string | null {
  const text = logs.join('\n');

  if (/cannot allocate memory|out of memory|failed to allocate|memory allocation/i.test(text)) {
    return 'This source is too large for the browser renderer. Try a shorter cut or a lower export resolution.';
  }

  if (
    /could not find codec|codec not found|unsupported codec|invalid data found|error while decoding|decoder[^\n]*not found|unrecognized codec/i.test(
      text,
    )
  ) {
    return 'This clip uses a codec the browser renderer cannot decode. Re-upload it as H.264 MP4 with AAC audio.';
  }

  if (
    /error initializing complex filters|no such filter|error while filtering|invalid argument|undefined constant/i.test(
      text,
    )
  ) {
    return 'The timeline filter could not be built. Remove the last caption style or effect you added and render again.';
  }

  if (/drawtext|fontfile|cannot open font|unsupported font/i.test(text)) {
    return 'A caption could not be drawn with the bundled font. Check the caption text and try again.';
  }

  if (/no such file or directory/i.test(text)) {
    return 'A render asset is missing. Close and reopen the editor, then try again.';
  }

  return null;
}
