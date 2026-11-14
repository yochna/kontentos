import { useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/lib/icons';
import { Button } from '@/components/ui';
import { Field, Input } from '@/components/ui/field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { User } from '@/lib/types';

type Mode = 'signin' | 'signup';

const STEPS = [
  { n: 1, title: 'Upload a clip', body: 'Any take, straight from your phone.' },
  { n: 2, title: 'Pick a style', body: 'Hook, explainer or story arc.' },
  { n: 3, title: 'Press once', body: 'Everything comes back together.' },
];

/**
 * What one press hands back, drawn in CSS so the first screen shows the product instead of
 * describing it: the vertical reel with its captions in the frame, a carousel card, and the
 * caption file. Nothing here is a screenshot, so it never goes stale or loads slowly.
 */
function PressPreview() {
  return (
    <div aria-hidden className="relative mt-8 hidden items-end gap-4 sm:flex">
      {/* The reel: 9:16, with the caption burned into the lower third. */}
      <div className="relative aspect-[9/16] w-[148px] shrink-0 overflow-hidden rounded-[18px] border border-line bg-surface-2 shadow-[var(--shadow-2)]">
        <span className="kt-graph absolute inset-0" />
        <span className="absolute left-2.5 top-2.5 rounded-btn border border-line bg-surface/80 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-ink-dim">
          REEL · 9:16
        </span>
        <p
          className="absolute inset-x-3 bottom-[22%] text-center font-display text-[15px] font-bold leading-[1.15] text-white"
          style={{ textShadow: '0 0 3px #000, 0 0 3px #000, 0 1px 6px rgba(0,0,0,.8)' }}
        >
          Film once.
          <br />
          Publish everywhere.
        </p>
      </div>

      {/* A carousel card, with the lit word the real cards use. */}
      <div className="relative aspect-[4/5] w-[170px] shrink-0 -rotate-2 rounded-card border border-line bg-surface p-3.5 shadow-[var(--shadow-2)]">
        <p className="font-mono text-[8.5px] tracking-[0.18em] text-primary">CAROUSEL</p>
        <div className="mt-2.5 border-t border-line pt-4">
          <p className="font-display text-[19px] font-bold leading-[1.1] text-ink">
            One clip, <span className="text-primary">four</span> cards.
          </p>
          <p className="mt-2 text-[10.5px] leading-snug text-ink-dim">Your own words, laid out to swipe.</p>
        </div>
        <p className="absolute bottom-3 left-3.5 font-mono text-[8.5px] text-ink-dim">01 / 04</p>
      </div>

      {/* The caption file that goes with the reel. */}
      <div className="hidden w-[190px] shrink-0 rounded-card border border-line bg-surface-2/70 p-3 font-mono text-[10px] leading-relaxed text-ink-dim md:block">
        <p className="mb-1.5 tracking-[0.18em] text-ink-muted">CAPTIONS</p>
        <p className="text-ink">1</p>
        <p>00:00:00,000 → 00:00:02,500</p>
        <p className="mb-1.5 text-ink">Most creators film one clip</p>
        <p className="text-ink">2</p>
        <p>00:00:02,500 → 00:00:05,000</p>
        <p className="mb-2 text-ink">and post it once.</p>
        <p className="tracking-wider text-primary">.SRT · .VTT</p>
      </div>
    </div>
  );
}

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-app px-5 py-10 font-body text-ink">
      {/* The same lamp that lights the bench: light from above, so the door is not a flat panel. */}
      <span aria-hidden className="kt-graph absolute inset-0" />

      <div className="relative grid w-full max-w-[1080px] items-center gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
        <section aria-label="What KontentOS does" className="order-2 lg:order-1">
          <p className="font-mono text-[11px] tracking-[0.2em] text-primary">KONTENTOS · CUTTING ROOM</p>
          <h2 className="mt-3 max-w-[560px] font-display text-[30px] font-bold leading-[1.08] text-balance sm:text-[40px]">
            One clip in. A reel, a carousel and captions out.
          </h2>
          <p className="mt-4 max-w-[520px] text-[15px] leading-relaxed text-pretty text-ink-muted">
            Upload a take, pick a style and press one button. KontentOS cuts the vertical reel, writes the cards and the
            caption files, and hands them all back together.
          </p>

          <ol className="mt-6 grid max-w-[560px] gap-3 sm:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n} className="rounded-card border border-line bg-surface/70 p-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink font-mono text-[11px] font-bold text-app">
                  {step.n}
                </span>
                <p className="mt-2 text-[13px] font-semibold text-ink">{step.title}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-ink-dim">{step.body}</p>
              </li>
            ))}
          </ol>

          <PressPreview />

          <p className="mt-6 text-[12.5px] text-ink-dim">
            No footage handy? Sign in and press the built-in sample clip to watch a full run.
          </p>
        </section>

        <div className="kt-dialog kt-stagger relative order-1 w-full max-w-[400px] justify-self-center rounded-card border border-line bg-surface p-6 shadow-[var(--shadow-2)] lg:order-2">
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
    </div>
  );
}
