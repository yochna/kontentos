import { useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/lib/icons';
import { Button } from '@/components/ui';

/**
 * Shown instead of the studio when the deployment has ACCESS_CODE set and this browser has
 * no valid session. The code is sent once and the server answers with an HttpOnly cookie, so
 * the passcode never sits in localStorage where the page's scripts could read it.
 */
export function AccessLock({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = code.trim();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.unlockAccess(value);
      onUnlock();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock this studio.');
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-5 font-body text-ink">
      <div className="w-full max-w-[380px] rounded-card border border-line bg-surface p-6 shadow-xs">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-primary text-white">
            <Icon name="lock" size={18} />
          </span>
          <div>
            <h1 className="font-display text-[19px] font-bold leading-tight">KontentOS Studio</h1>
            <p className="text-[12px] text-ink-dim">This workspace is private</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-dim" htmlFor="access-code">
            Access code
          </label>
          <input
            id="access-code"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-btn border border-line bg-surface-2/40 px-3 py-2.5 text-[14px] text-ink outline-none focus:border-primary"
          />
          {error && (
            <p className="flex items-start gap-1.5 text-[12.5px] font-semibold text-danger">
              <Icon name="error_outline" size={15} className="mt-px shrink-0" />
              {error}
            </p>
          )}
          <Button type="submit" icon="vpn_key" disabled={!code.trim() || busy} className="w-full justify-center">
            {busy ? 'Checking…' : 'Unlock studio'}
          </Button>
        </form>

        <p className="mt-4 text-[11.5px] leading-relaxed text-ink-dim">
          The owner sets this code in the server environment. Nothing loads until it is entered.
        </p>
      </div>
    </div>
  );
}
