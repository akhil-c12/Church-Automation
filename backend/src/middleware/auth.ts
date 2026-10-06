import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import type { SessionService, SessionUser } from '../services/session.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}

export function requireAuth(sessions: SessionService): RequestHandler {
  return (req, _res, next) => {
    const user = sessions.verify(req.cookies?.[sessions.cookieName]);
    if (!user) return next(new AppError(401, 'UNAUTHENTICATED', 'Login required'));
    req.user = user;
    next();
  };
}

/** Narrowing helper for handlers mounted behind requireAuth. */
export function currentUser(req: { user?: SessionUser }): SessionUser {
  if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Login required');
  return req.user;
}
