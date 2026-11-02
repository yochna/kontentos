import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';
import { Button, useDismiss } from '@/components/ui';
import { platformSpec } from '@/lib/platforms';
import type { ScheduledPost } from '@/lib/types';

/**
 * The publishing ledger has exactly one write path. KontentOS cannot post — no OAuth app, no
 * worker, no public media URL — so the only truthful record is "the creator posted this and here
 * is the link the platform gave back". The link is stored verbatim and shown in Analytics.
 */
export function MarkPostedDialog({
  post,
  onClose,
  onConfirm,
}: {
  post: ScheduledPost | null;
  onClose: () => void;
  onConfirm: (id: string, postUrl: string) => Promise<void> | void;
}) {
  useDismiss(post ? onClose : undefined);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const spec = platformSpec(post?.platform);

  useEffect(() => {
    if (post) {
      setUrl(post.post_url || '');
      setError('');
      inputRef.current?.focus();
    }
  }, [post]);

  if (!post) return null;

  const trimmed = url.trim();

  const confirm = async (link: string) => {
    setBusy(true);
    setError('');
    try {
      await onConfirm(post.id, link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record that. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--scrim)] backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={`Mark ${post.video_title || 'this post'} as posted`}
    >
      <div className="w-full max-w-[440px] bg-surface rounded-card border border-line shadow-xl overflow-hidden animate-scale-up">
        <div className="flex items-start justify-between gap-3 border-b border-line bg-surface-2/40 px-5 py-4">
          <div className="min-w-0">
            <span className="kt-eyebrow block">Out · Ledger</span>
            <h3 className="mt-1 truncate font-semibold text-ink text-[15px]">
              {post.video_title || 'Untitled post'}
            </h3>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              {spec.label} ·{' '}
              {new Date(post.scheduled_at).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 text-ink-dim hover:text-ink kt-focus" aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            KontentOS does not post anywhere. When the clip is live on {spec.label}, paste the link from
            your browser so the history and Analytics point at a real page.
          </p>

          <label className="kt-eyebrow block" htmlFor="kt-live-url">
            Live post link
          </label>
          <input
            id="kt-live-url"
            ref={inputRef}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && trimmed && !busy) void confirm(trimmed);
            }}
            placeholder={`https://${spec.liveUrlHost}/…`}
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-btn border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 font-mono"
          />

          <a
            href={spec.composerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline kt-focus"
          >
            <Icon name="open_in_new" size={14} />
            Open the {spec.label} composer to post it
          </a>

          {error && (
            <p role="alert" className="rounded-btn border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-ink">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/30 px-5 py-4">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void confirm('')} disabled={busy}>
            {busy ? 'Saving…' : 'Mark posted, no link'}
          </Button>
          <Button size="sm" icon="check_circle" onClick={() => void confirm(trimmed)} disabled={busy || !trimmed}>
            Save link and mark posted
          </Button>
        </div>
      </div>
    </div>
  );
}
