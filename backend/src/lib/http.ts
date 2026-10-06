import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import type { CallContext, N8nResult } from '../n8n/client.js';
import { currentUser } from '../middleware/auth.js';
import { validationError } from './errors.js';
import { zodDetails } from '../middleware/error.js';

/** Express 4 doesn't catch rejected promises; route them to the error handler. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw validationError(zodDetails(r.error));
  return r.data;
}

/** requested_by always comes from the verified session, never from the client. */
export function callCtx(req: Request): CallContext {
  return { requestId: req.id, requestedBy: currentUser(req).username, log: req.log };
}

/** Pass n8n's status and body through unchanged. */
export function forward(res: Response, result: N8nResult): void {
  if (result.executionId) res.setHeader('X-Execution-Id', result.executionId);
  res.status(result.status).json(result.body);
}

/** Drops undefined keys so n8n only sees fields the client actually sent. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
