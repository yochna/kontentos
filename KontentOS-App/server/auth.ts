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

declare global {
  namespace Express {
    interface Request {
      /** Set by requireUser. Empty until a session has been verified. */
      userId: string;
      sessionToken?: string;
    }
  }
}

export const SESSION_COOKIE = 'kt_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const IS_PROD = process.env.NODE_ENV === 'production';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD_LENGTH = 8;

/** A well-formed hash of nothing, used when no account matches so the work factor stays equal. */
const DUMMY_HASH = `scrypt$16384$8$1$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(32).toString('base64')}`;

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
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

/**
 * Sessions are resolved at most once a minute per token. A scrubbing <video> element fires many
 * range requests at /uploads and each one is authenticated; without this they would each pay for
 * a storage read, which the local JSON engine answers by re-parsing the whole database.
 * Revocation (sign-out, password change) clears the entry directly.
 */
const SESSION_CACHE_MS = 60 * 1000;
const sessionCache = new Map<string, { userId: string; expiresAt: number }>();

function cacheSession(tokenHash: string, userId: string) {
  if (sessionCache.size > 500) sessionCache.clear();
  sessionCache.set(tokenHash, { userId, expiresAt: Date.now() + SESSION_CACHE_MS });
}

function forgetSession(tokenHash: string) {
  sessionCache.delete(tokenHash);
}

async function resolveToken(tokenHash: string): Promise<string | null> {
  const hit = sessionCache.get(tokenHash);
  if (hit && hit.expiresAt > Date.now()) return hit.userId;
  if (hit) sessionCache.delete(tokenHash);
  const userId = await db.resolveSession(tokenHash);
  if (userId) cacheSession(tokenHash, userId);
  return userId;
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
      return res.status(503).json({ error: err?.message || 'Storage is unavailable.' });
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

export function createAuthRouter(): express.Router {
  const router = express.Router();

  router.get('/me', async (req, res) => {
    try {
      const userId = req.sessionToken ? await resolveToken(db.hashSessionToken(req.sessionToken)) : null;
      const user = userId ? db.publicUser(await db.getAccountById(userId)) : null;
      res.json({ success: true, data: user });
    } catch (err: any) {
      res.status(503).json({ error: err?.message || 'Storage is unavailable.' });
    }
  });

  router.post('/signup', authLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const fullName = String(req.body?.full_name ?? '').trim();
      const password = String(req.body?.password ?? '');

      if (!EMAIL_RE.test(email) || email.length > 254) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
      }
      if (!fullName || fullName.length > 80) {
        return res.status(400).json({ error: 'Tell us what to call you (up to 80 characters).' });
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.` });
      }
      if (password.length > 200) {
        return res.status(400).json({ error: 'That password is too long.' });
      }

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
      res.status(500).json({ error: err?.message || 'Could not create the account.' });
    }
  });

  router.post('/login', authLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');
      const account = email ? await db.getAccountByEmail(email) : null;
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
      res.status(503).json({ error: err?.message || 'Could not sign in right now.' });
    }
  });

  router.post('/logout', async (req, res) => {
    try {
      if (req.sessionToken) {
        const hash = db.hashSessionToken(req.sessionToken);
        forgetSession(hash);
        await db.deleteSession(hash);
      }
    } finally {
      res.setHeader('Set-Cookie', sessionCookie('', 0));
      res.json({ success: true });
    }
  });

  /** Signing out of the account everywhere, e.g. before deleting it. */
  router.post('/change-password', requireUser, async (req, res) => {
    try {
      const current = String(req.body?.current ?? '');
      const next = String(req.body?.next ?? '');
      const account = await db.getAccountById(req.userId);
      if (!account || !(await db.verifyPassword(current, account.password_hash))) {
        return res.status(401).json({ error: 'Your current password is wrong.' });
      }
      if (next.length < MIN_PASSWORD_LENGTH || next.length > 200) {
        return res.status(400).json({ error: `New password needs at least ${MIN_PASSWORD_LENGTH} characters.` });
      }
      await db.changePassword(account.id, await db.hashPassword(next));
      if (req.sessionToken) {
        const hash = db.hashSessionToken(req.sessionToken);
        forgetSession(hash);
        await db.deleteSession(hash);
      }
      res.setHeader('Set-Cookie', sessionCookie('', 0));
      res.json({ success: true, message: 'Password changed. Please sign in again.' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Could not change the password.' });
    }
  });

  return router;
}
