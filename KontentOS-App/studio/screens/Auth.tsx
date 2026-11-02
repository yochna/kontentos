import { useState } from 'react';
import { studioApi, type SessionUser } from '../lib/api';
import { Button, Field, Label } from '../components/atoms';

export function AuthScreen({
  mode: initialMode,
  onDone,
}: {
  mode: 'signin' | 'signup';
  onDone: (user: SessionUser) => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user =
        mode === 'signup'
          ? await studioApi.signUp(fullName.trim(), email.trim(), password)
          : await studioApi.signIn(email.trim(), password);
      onDone(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign you in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden flex-col justify-between border-r border-rule bg-paper-2 px-12 py-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="h-[7px] w-[7px] rounded-[2px] bg-moss" />
          <span className="font-display text-[17px] font-semibold text-ink">KontentOS Studio</span>
        </div>
        <div>
          <h1 className="max-w-[18ch] font-display text-[46px] font-normal leading-[1.06] tracking-[-0.02em] text-ink">
            One recording in.
            <br />
            <span className="italic text-moss">A week of posts</span> out.
          </h1>
          <p className="mt-5 max-w-[48ch] text-[15px] leading-relaxed text-ink-soft">
            The Studio reads your transcript, finds the moments that stand on their own, and writes the hook,
            the three beats and the caption for each — stamped with the timecode where the moment actually
            happens.
          </p>
        </div>
        <p className="meta-label">Nothing is scored against live audience data.</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-12">
        <form onSubmit={submit} className="flex w-full max-w-[360px] flex-col gap-4">
          <h2 className="font-display text-[26px] tracking-[-0.01em] text-ink">
            {mode === 'signup' ? 'Create your studio' : 'Welcome back'}
          </h2>
          <p className="-mt-2 text-[14px] text-ink-soft">
            {mode === 'signup'
              ? 'Your email and a password of at least 8 characters. That is all it asks for.'
              : 'Same account as the bench — your Kit voice and Room engine carry over.'}
          </p>

          {mode === 'signup' && (
            <div>
              <Label htmlFor="st-name">Name</Label>
              <Field id="st-name" value={fullName} onChange={setFullName} placeholder="Your name" />
            </div>
          )}

          <div>
            <Label htmlFor="st-email">Email</Label>
            <Field
              id="st-email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@studio.com"
            />
          </div>

          <div>
            <Label htmlFor="st-password">Password</Label>
            <Field
              id="st-password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p role="alert" className="rise-in rounded-[8px] bg-clay-wash px-3 py-2 text-[13px] text-clay">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy || !email || !password}>
            {busy
              ? 'One moment…'
              : mode === 'signup'
                ? 'Create account'
                : 'Sign in'}
          </Button>

          <button
            type="button"
            className="meta-label text-ink-soft underline-offset-4 hover:text-moss hover:underline"
            onClick={() => {
              setMode(mode === 'signup' ? 'signin' : 'signup');
              setError('');
            }}
          >
            {mode === 'signup' ? 'Already have an account — sign in' : 'No account yet — create one'}
          </button>
        </form>
      </section>
    </div>
  );
}
