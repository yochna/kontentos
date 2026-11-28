/**
 * Accounts: sign up, sign in, sessions.
 *
 * Replaces the single shared ACCESS_CODE passcode, which could only ever mean "everyone who
 * knows the secret is the owner". Each creator now gets their own row in `users`, their own
 * workspace, and a random session token in an HttpOnly cookie; the password itself is never
 * stored or logged, only a scrypt hash.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import * as db from './db.js';
import { safeMessage } from './errorText.js';
import {
  passwordResetBaseUrl,
  passwordResetDeliveryConfigured,
  smtpPasswordResetMailer,
  type PasswordResetMailer,
} from './passwordResetMailer.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireUser. Empty until a session has been verified. */
      userId: string;
      sessionToken?: string;
    }
  }
}

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * On the https deployment the cookie carries the `__Host-` prefix, which the browser refuses to set
 * unless it is Secure, sent to the root path and given no Domain — so no other origin, including
 * anything on a subdomain of the workspace, can plant or read a session. On http://localhost the
 * prefix would be rejected outright, so the plain name stays there.
 *
 * The name changed, which means every session on a live instance ends at the next deploy and each
 * creator signs in once more. That is the point: a session no other origin can re-set is the one
 * worth having.
 */
export const SESSION_COOKIE = IS_PROD ? '__Host-kt_session' : 'kt_session';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const OPAQUE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;
export const PASSWORD_RESET_MAX_AGE_SECONDS = 30 * 60;

export interface AuthRouterOptions {
  mailer?: PasswordResetMailer;
  appBaseUrl?: string;
  now?: () => Date;
}

function stringField(body: unknown, key: string): string {
  if (!body || typeof body !== 'object') return '';
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function validEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  if (password.length > MAX_PASSWORD_LENGTH) return 'That password is too long.';
  return null;
}

/** A well-formed hash of nothing, used when no account matches so the work factor stays equal. */
const DUMMY_HASH = `scrypt$16384$8$1$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(32).toString('base64')}`;

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      const value = decodeURIComponent(part.slice(eq + 1).trim());
      return OPAQUE_TOKEN_RE.test(value) ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

function sessionCookie(value: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${IS_PROD ? '; Secure' : ''}`;
}

/** Reads the cookie without verifying it; verification happens in requireUser. */
export function attachSession(req: Request, _res: Response, next: NextFunction) {
  req.sessionToken = readCookie(req.headers.cookie, SESSION_COOKIE) || undefined;
  req.userId = '';
  next();
}

// Resolve every request so a revocation on another server instance takes effect immediately.
async function resolveToken(tokenHash: string): Promise<string | null> {
  const session = await db.resolveSessionRecord(tokenHash);
  return session?.userId ?? null;
}

/**
 * Every /api route except health and the auth endpoints runs through this. An unreachable
 * database answers 503 rather than 401, so the studio does not tell a signed-in creator to
 * sign in again when the real problem is the server.
 */
export function requireUser(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    if (!req.sessionToken) {
      return res.status(401).json({ error: 'Please sign in to continue.', authRequired: true });
    }
    try {
      const userId = await resolveToken(db.hashSessionToken(req.sessionToken));
      if (!userId) {
        return res.status(401).json({ error: 'Your session has expired. Please sign in again.', authRequired: true });
      }
      req.userId = userId;
      next();
    } catch (err: any) {
      return res.status(503).json({ error: safeMessage(err, 'Storage is unavailable.') });
    }
  })();
}

async function issueSession(res: Response, userId: string): Promise<void> {
  const token = db.newSessionToken();
  await db.createSession(db.hashSessionToken(token), userId, SESSION_MAX_AGE_SECONDS);
  res.setHeader('Set-Cookie', sessionCookie(token, SESSION_MAX_AGE_SECONDS));
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

/**
 * Changing the password verifies the old one with the same scrypt work a sign-in does, and it now
 * revokes every session, so it is both the most expensive and the most damaging endpoint to hit in
 * a loop. Six attempts a quarter of an hour is more than a real creator needs.
 */
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

/** Signing out is not a race; the cap only stops the session table from being churned. */
const logoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a moment.' },
});

const resetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many reset requests. Please wait a few minutes and try again.' },
});

const resetAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many reset attempts. Please wait a few minutes and try again.' },
});

function requireSameOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    const url = new URL(origin);
    if (url.protocol !== `${req.protocol}:` || url.host !== req.get('host')) {
      return res.status(403).json({ error: 'This request must come from the KontentOS site.' });
    }
    next();
  } catch {
    res.status(403).json({ error: 'This request must come from the KontentOS site.' });
  }
}

export function createAuthRouter(options: AuthRouterOptions = {}): express.Router {
  const router = express.Router();
  const now = options.now || (() => new Date());
  const mailer = options.mailer || smtpPasswordResetMailer;
  const baseUrl = (options.appBaseUrl?.trim() || passwordResetBaseUrl() || '').replace(/\/$/, '');
  const resetDeliveryReady = Boolean(baseUrl && (options.mailer || passwordResetDeliveryConfigured()));
  const genericResetRequest = { success: true, message: 'If an account matches that email, a password reset link has been requested.' };
  const invalidResetLink = 'This reset link is invalid, expired, or already used.';

  router.use((req, res, next) => req.method === 'GET' ? next() : requireSameOrigin(req, res, next));

  router.get('/me', async (req, res) => {
    try {
      const userId = req.sessionToken ? await resolveToken(db.hashSessionToken(req.sessionToken)) : null;
      const user = userId ? db.publicUser(await db.getAccountById(userId)) : null;
      res.json({ success: true, data: user });
    } catch (err: any) {
      res.status(503).json({ error: safeMessage(err, 'Storage is unavailable.') });
    }
  });

  router.post('/signup', authLimiter, async (req, res) => {
    try {
      const email = stringField(req.body, 'email').trim().toLowerCase();
      const fullName = stringField(req.body, 'full_name').trim();
      const password = stringField(req.body, 'password');

      if (!validEmail(email)) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
      }
      if (!fullName || fullName.length > 80) {
        return res.status(400).json({ error: 'Tell us what to call you (up to 80 characters).' });
      }
      const problem = passwordProblem(password);
      if (problem) return res.status(400).json({ error: problem });

      const password_hash = await db.hashPassword(password);
      // The very first account inherits whatever the passcode-era workspace already held, so a
      // creator moving a live deployment to accounts keeps their existing clips.
      const isFirstAccount = (await db.countAccounts()) === 0;
      const account = await db.createAccount({ email, full_name: fullName, password_hash });
      if (isFirstAccount) await db.adoptLegacyData(account.id);
      await issueSession(res, account.id);
      res.json({ success: true, data: db.publicUser(account) });
    } catch (err: any) {
      if (err instanceof db.EmailAlreadyRegistered) {
        return res.status(409).json({ error: 'That email already has an account. Try signing in.' });
      }
      res.status(500).json({ error: safeMessage(err, 'Could not create the account.') });
    }
  });

  router.post('/login', authLimiter, async (req, res) => {
    try {
      const email = stringField(req.body, 'email').trim().toLowerCase();
      const password = stringField(req.body, 'password');
      if (!validEmail(email) || !password || password.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ error: 'Enter a valid email address and password.' });
      }
      const account = await db.getAccountByEmail(email);
      // A wrong email still pays the full scrypt cost: replying instantly would let anyone time
      // the endpoint into a list of registered addresses.
      const ok = await db.verifyPassword(password, account?.password_hash ?? DUMMY_HASH);
      if (!account || !ok) {
        // One message for both "no such account" and "wrong password", so the endpoint cannot
        // be used to list who has registered.
        return res.status(401).json({ error: 'Email or password is wrong.' });
      }
      await issueSession(res, account.id);
      res.json({ success: true, data: db.publicUser(account) });
    } catch (err: any) {
      res.status(503).json({ error: safeMessage(err, 'Could not sign in right now.') });
    }
  });

  router.post('/logout', logoutLimiter, async (req, res) => {
    res.setHeader('Set-Cookie', sessionCookie('', 0));
    try {
      if (req.sessionToken) {
        const hash = db.hashSessionToken(req.sessionToken);
        await db.deleteSession(hash);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(503).json({ error: safeMessage(err, 'This browser is signed out, but the server could not revoke the session.') });
    }
  });

  /**
   * Signing out of the account everywhere. A password change means the old one was compromised or
   * merely shared, so every other session dies with it — not just this browser's.
   */
  router.post('/change-password', changePasswordLimiter, requireUser, async (req, res) => {
    try {
      const current = stringField(req.body, 'current');
      const next = stringField(req.body, 'next');
      if (!current || current.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ error: 'Enter your current password.' });
      }
      const account = await db.getAccountById(req.userId);
      if (!account || !(await db.verifyPassword(current, account.password_hash))) {
        // 403, not 401: this creator IS signed in and their session is still good. A 401 reads as
        // "session over" to the studio, which would wipe the bench and bounce them to the sign-in
        // screen for typing one wrong character in the current-password box.
        return res.status(403).json({ error: 'Your current password is wrong.' });
      }
      const problem = passwordProblem(next);
      if (problem) return res.status(400).json({ error: `New password: ${problem}` });
      if (next === current) return res.status(400).json({ error: 'Choose a password different from your current one.' });
      const changed = await db.changePasswordAndRevokeSessions(account.id, await db.hashPassword(next));
      if (!changed) return res.status(404).json({ error: 'This account could not be found.' });
      res.setHeader('Set-Cookie', sessionCookie('', 0));
      res.json({ success: true, message: 'Password changed. Every device is signed out; please sign in again.' });
    } catch (err: any) {
      res.status(503).json({ error: safeMessage(err, 'Could not change the password.') });
    }
  });

  router.post('/forgot-password', resetRequestLimiter, async (req, res) => {
    const email = stringField(req.body, 'email').trim().toLowerCase();
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!resetDeliveryReady) {
      return res.status(503).json({ error: 'Password reset email is not configured on this server. Contact support.' });
    }

    try {
      const account = await db.getAccountByEmail(email);
      if (account) {
        const token = db.newPasswordResetToken();
        const created = await db.createPasswordReset(
          db.hashPasswordResetToken(token),
          account.id,
          PASSWORD_RESET_MAX_AGE_SECONDS,
          now(),
        );
        if (created) {
          const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
          res.json(genericResetRequest);
          setImmediate(() => {
            void mailer({ to: account.email, resetUrl }).catch((err) => {
              console.error('Password reset email delivery failed:', err instanceof Error ? err.message : 'Unknown mail error');
            });
          });
          return;
        }
      }
      res.json(genericResetRequest);
    } catch (err: any) {
      res.status(503).json({ error: safeMessage(err, 'Could not request a password reset right now.') });
    }
  });

  router.post('/reset-password', resetAttemptLimiter, async (req, res) => {
    const token = stringField(req.body, 'token').trim();
    const next = stringField(req.body, 'password');
    if (!OPAQUE_TOKEN_RE.test(token)) return res.status(400).json({ error: invalidResetLink });
    const problem = passwordProblem(next);
    if (problem) return res.status(400).json({ error: problem });

    try {
      const reset = await db.resetPasswordWithToken(
        db.hashPasswordResetToken(token),
        await db.hashPassword(next),
        now(),
      );
      if (!reset) return res.status(400).json({ error: invalidResetLink });
      res.setHeader('Set-Cookie', sessionCookie('', 0));
      res.json({ success: true, message: 'Password updated. Sign in with your new password.' });
    } catch (err: any) {
      res.status(503).json({ error: safeMessage(err, 'Could not reset the password right now.') });
    }
  });

  return router;
}
