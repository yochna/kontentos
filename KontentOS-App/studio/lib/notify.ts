/**
 * A 40-line notification bus. The Studio had no way to say "that failed": save() swallowed a rejected
 * PATCH and the clipboard rejected silently, so a creator believed the work was kept when it was not.
 * Any module can raise one; App renders them.
 */

export type NoteTone = 'ok' | 'bad' | 'info';

export interface Note {
  id: number;
  text: string;
  tone: NoteTone;
}

type Listener = (note: Note) => void;

const listeners = new Set<Listener>();
let seq = 0;

export function notify(text: string, tone: NoteTone = 'info'): Note {
  const note = { id: ++seq, text, tone };
  for (const listen of listeners) listen(note);
  return note;
}

export function subscribeNotes(listen: Listener): () => void {
  listeners.add(listen);
  return () => listeners.delete(listen);
}
