import { useState } from 'react';
import { Icon } from '@/lib/icons';

/**
 * A clip record can outlive its file: Render's free disk is wiped on every redeploy while MongoDB
 * keeps the row. Every player in the bench uses these so the creator reads "the file is gone"
 * instead of watching a black rectangle load forever.
 */
export function OfflinePlate({
  title = 'File not on this server',
  body = 'The record survived the last redeploy; the upload did not. Re-upload the clip to cut it again.',
}: {
  title?: string;
  body?: string;
}) {
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
