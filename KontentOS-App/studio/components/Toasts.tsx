import { useEffect, useState } from 'react';
import { subscribeNotes, type Note } from '../lib/notify';

const KEEP_MS = 4500;
const KEEP_BAD_MS = 9000;

/**
 * Fixed to the bottom-right so it never covers the transcript field or a clip's own footer, and out of
 * the flow entirely so it cannot push layout on a phone.
 */
export function Toasts() {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    let alive = true;
    const timers: number[] = [];
    const off = subscribeNotes((note) => {
      if (!alive) return;
      setNotes((prev) => [...prev.slice(-3), note]);
      timers.push(
        window.setTimeout(
          () => setNotes((prev) => prev.filter((n) => n.id !== note.id)),
          note.tone === 'bad' ? KEEP_BAD_MS : KEEP_MS
        )
      );
    });
    return () => {
      alive = false;
      off();
      timers.forEach(clearTimeout);
    };
  }, []);

  if (!notes.length) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-[min(88vw,22rem)] flex-col gap-2"
    >
      {notes.map((n) => (
        <div
          key={n.id}
          role={n.tone === 'bad' ? 'alert' : 'status'}
          className={`rise-in pointer-events-auto rounded-[10px] border px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-lift ${
            n.tone === 'bad'
              ? 'border-clay/30 bg-clay-wash text-clay'
              : n.tone === 'ok'
                ? 'border-moss/25 bg-moss-wash text-moss-deep'
                : 'border-rule bg-white text-ink-soft'
          }`}
        >
          {n.text}
        </div>
      ))}
    </div>
  );
}
