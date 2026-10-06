import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { asyncHandler, parse } from '../lib/http.js';
import { requireAuth, currentUser } from '../middleware/auth.js';
import type { SessionService } from '../services/session.js';
import { rateLimitHandler } from '../middleware/rateLimit.js';

const loginBody = z
  .object({
    username: z.string().min(1).max(100),
    // bcrypt only reads 72 bytes; the cap stops absurd payloads.
    password: z.string().min(1).max(256),
  })
  .strict();

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest();

export function authRouter(config: Config, sessions: SessionService): Router {
  const router = Router();
  const expectedUser = sha256(config.ADMIN_USERNAME);

  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 5,
    // Only failures count, so the admin isn't locked out by their own logins.
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: rateLimitHandler('Too many login attempts. Try again in 15 minutes.'),
  });

  router.post(
    '/login',
    loginLimiter,
    asyncHandler(async (req, res) => {
      const { username, password } = parse(loginBody, req.body);
      // Always run bcrypt, and compare usernames in constant time, so response
      // timing doesn't reveal whether the username was right.
      const userOk = timingSafeEqual(sha256(username), expectedUser);
      const passOk = await bcrypt.compare(password, config.ADMIN_PASSWORD_HASH);
      if (!userOk || !passOk) {
        req.log.warn({ event: 'login_failed' }, 'login failed');
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
      }
      res.cookie(sessions.cookieName, sessions.issue(config.ADMIN_USERNAME), sessions.cookieOptions());
      req.log.info({ event: 'login_succeeded' }, 'login succeeded');
      res.json({ success: true, data: { username: config.ADMIN_USERNAME } });
    }),
  );

  router.post('/logout', (req, res) => {
    // Revoke the token server-side too, so a copied cookie stops working now.
    const user = sessions.verify(req.cookies?.[sessions.cookieName]);
    if (user) sessions.revoke(user);
    res.clearCookie(sessions.cookieName, sessions.clearCookieOptions());
    res.status(204).end();
  });

  router.get('/me', requireAuth(sessions), (req, res) => {
    res.json({ success: true, data: { username: currentUser(req).username } });
  });

  return router;
}
