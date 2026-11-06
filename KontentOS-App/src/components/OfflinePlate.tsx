import { useRef, useState } from 'react';
import { Icon } from '@/lib/icons';

/**
 * A clip record can outlive its file: Render's free disk is wiped on every redeploy while MongoDB
 * keeps the row. Every player in the bench uses these so the creator reads "the file is gone"
 * instead of watching a black rectangle load forever.
 *
 * `onRelink` offers the way out — pick the same file again and it re-attaches to this record, so the
 * cues, captions and queue rows already pointing at this cut survive with it.
 */
export function OfflinePlate({
  title = 'File not on this server',
  body = 'The record survived the last redeploy; the upload did not. Re-upload the clip to cut it again.',
  onRelink,
}: {
  title?: string;
  body?: string;
  onRelink?: (file: File) => Promise<boolean | void> | boolean | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div
      className="absolute inset-0 grid place-items-center bg-app px-4 text-center"
      style={{
        backgroundImage:
          'repeating-linear-gradient(135deg, transparent 0 10px, rgba(255,255,255,0.035) 10px 11px)',
      }}
    >
      <div className="max-w-[34ch]">
        <Icon name="no_photography" size={22} className="mx-auto text-danger" />
        <div className="mt-1.5 text-[12px] font-semibold text-ink">{title}</div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">{body}</p>

        {onRelink && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="kt-focus mt-2 inline-flex items-center gap-1.5 rounded-[4px] border border-line-strong px-2 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-muted transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
            >
              <Icon name={busy ? 'hourglass_top' : 'link'} size={13} className={busy ? 'kt-spin' : ''} />
              {busy ? 're-linking' : 're-link the file'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setBusy(true);
                setFailed(false);
                try {
                  const ok = await onRelink(file);
                  setFailed(ok === false);
                } catch {
                  setFailed(true);
                } finally {
                  setBusy(false);
                }
              }}
            />
            {failed && (
              <p className="mt-1.5 text-[11px] text-danger">
                That file did not land back on the server. Try again, or intake it as a new clip.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Swap a player for the plate once the browser itself fails to load the source. */
export function useMediaSource(src: string | undefined, declaredAvailable?: boolean) {
  const [seen, setSeen] = useState<{ src?: string; failed: boolean }>({ src, failed: false });
  // Comparing the source here instead of in an effect keeps a new clip from inheriting the last
  // one's failure.
  const failed = seen.src === src ? seen.failed : false;
  return {
    offline: declaredAvailable === false || failed,
    onError: () => setSeen({ src, failed: true }),
    onLoadedData: () => setSeen({ src, failed: false }),
  };
}
