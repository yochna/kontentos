import { useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/lib/icons';
import { Button } from '@/components/ui';
import type { User } from '@/lib/types';

type Mode = 'signin' | 'signup';

/**
 * The studio belongs to one creator account, so nothing renders until they sign in.
 * The password goes to the server once and comes back as an HttpOnly session cookie; the
 * browser never keeps a credential the page's scripts could read.
 */
export function AuthScreen({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';
  const canSubmit = email.trim() && password && (!isSignup || fullName.trim()) && !busy;

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      const user = isSignup
        ? await api.signUp({ email: email.trim(), full_name: fullName.trim(), password })
        : await api.signIn(email.trim(), password);
      onSignedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the studio. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-5 font-body text-ink">
      <div className="w-full max-w-[400px] rounded-card border border-line bg-surface p-6 shadow-xs">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-primary text-white">
            <Icon name="movie_filter" size={18} />
          </span>
          <div>
            <h1 className="font-display text-[19px] font-bold leading-tight">KontentOS Studio</h1>
            <p className="text-[12px] text-ink-dim">Your clips, your calendar, your account</p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-1 rounded-btn bg-surface-2/60 p-1">
          {(['signin', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`rounded-btn px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                mode === m ? 'bg-surface text-ink shadow-xs' : 'text-ink-dim hover:text-ink'
              }`}
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field
            id="account-email"
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            autoFocus
          />
          {isSignup && (
            <Field
              id="account-name"
              label="What should the studio call you?"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={setFullName}
            />
          )}
          <Field
            id="account-password"
            label="Password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            value={password}
            onChange={setPassword}
          />
          {error && (
            <p className="flex items-start gap-1.5 text-[12.5px] font-semibold text-danger">
              <Icon name="error_outline" size={15} className="mt-px shrink-0" />
              {error}
            </p>
          )}
          <Button type="submit" icon={isSignup ? 'person_add' : 'login'} disabled={!canSubmit} className="w-full justify-center">
            {busy ? 'Please wait…' : isSignup ? 'Create my studio' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-4 text-[11.5px] leading-relaxed text-ink-dim">
          {isSignup
            ? 'Passwords are stored only as a salted hash. A new account gets an empty workspace — nothing is shared with anyone else.'
            : 'Sessions last 30 days on this browser. Signing out ends it immediately.'}
        </p>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  autoFocus,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-ink-dim" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-btn border border-line bg-surface-2/40 px-3 py-2.5 text-[14px] text-ink outline-none focus:border-primary"
      />
    </div>
  );
}
