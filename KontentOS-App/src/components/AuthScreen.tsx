import { useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/lib/icons';
import { Button } from '@/components/ui';
import { Field, Input } from '@/components/ui/field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-app px-5 font-body text-ink">
      {/* The same lamp that lights the bench: light from above, so the door is not a flat panel. */}
      <span aria-hidden className="kt-graph absolute inset-0" />

      <div className="kt-dialog kt-stagger relative w-full max-w-[400px] rounded-card border border-line bg-surface p-6 shadow-[var(--shadow-2)]">
        <div className="group mb-5 flex items-center gap-2.5">
          <span className="kt-grow flex h-9 w-9 items-center justify-center rounded-btn bg-primary text-on-primary">
            <Icon name="movie_filter" size={18} />
          </span>
          <div>
            <h1 className="font-display text-[19px] font-bold leading-tight">KontentOS</h1>
            <p className="text-[12px] text-ink-dim">One bench. Raw in, scheduled out.</p>
          </div>
        </div>

        <Tabs value={mode} onValueChange={(v) => switchMode(v as Mode)} className="contents">
          <TabsList
            variant="pill"
            aria-label="Account access"
            className="mb-5 grid grid-cols-2 gap-1 rounded-btn bg-surface-2/60 p-1"
          >
            <TabsTrigger variant="pill" value="signin" className="px-3 py-1.5 duration-200 ease-out">
              Sign in
            </TabsTrigger>
            <TabsTrigger variant="pill" value="signup" className="px-3 py-1.5 duration-200 ease-out">
              Create account
            </TabsTrigger>
          </TabsList>

          {/* One panel whose fields change with the tab, so the content is keyed on the mode rather
              than split into two near-identical blocks. */}
          <TabsContent value={mode} className="mt-0">
            {/* key={mode} remounts the field group, so switching tabs replays the entrance. */}
            <form key={mode} onSubmit={handleSubmit} className="kt-stagger--fade space-y-3">
              <Field label="Email">
                {({ id }) => (
                  <Input
                    id={id}
                    type="email"
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="py-2.5 text-[14px]"
                  />
                )}
              </Field>
              {isSignup && (
                <Field label="What should the studio call you?">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="text"
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="py-2.5 text-[14px]"
                    />
                  )}
                </Field>
              )}
              <Field label="Password">
                {({ id }) => (
                  <Input
                    id={id}
                    type="password"
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="py-2.5 text-[14px]"
                  />
                )}
              </Field>
              {error && (
                <p key={error} className="kt-shake flex items-start gap-1.5 text-[12.5px] font-semibold text-danger">
                  <Icon name="error_outline" size={15} className="mt-px shrink-0" />
                  {error}
                </p>
              )}
              <Button
                type="submit"
                icon={isSignup ? 'person_add' : 'login'}
                iconSpin={busy}
                disabled={!canSubmit}
                className="w-full justify-center"
              >
                {busy ? 'Please wait…' : isSignup ? 'Create my studio' : 'Sign in'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <p className="mt-4 text-[12px] leading-relaxed text-pretty text-ink-dim">
          {isSignup
            ? 'Passwords are stored only as a salted hash. A new account gets an empty workspace — nothing is shared with anyone else.'
            : 'Sessions last 30 days on this browser. Signing out ends it immediately.'}
        </p>
      </div>
    </div>
  );
}
