import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence on top of SameSite=Lax + CORS. CORS alone only stops a foreign
 * page from *reading* responses; a "simple" cross-site POST still executes.
 * Browsers always send Origin on state-changing requests, so a mismatching
 * Origin means a cross-site attempt. Requests without Origin come from
 * non-browser clients (curl, server-to-server), which can't ride the admin's
 * cookie, so they are allowed through to normal auth.
 */
export function originGuard(allowedOrigin: string): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (origin !== undefined && origin !== allowedOrigin) {
      return next(new AppError(403, 'FORBIDDEN_ORIGIN', 'Cross-origin request rejected'));
    }
    next();
  };
}
