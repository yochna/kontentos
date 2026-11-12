/**
 * Saving a caption file the way the browser saves anything else. The cue arithmetic the Studio's
 * export and the server's Press share lives in src/lib/captionFiles; this is the part that only
 * makes sense with a DOM around it.
 */

export function downloadTextFile(text: string, fileName: string, mimeType = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // The anchor is dropped straight after, or the object URL outlives the click in some engines and
  // the file never appears.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
