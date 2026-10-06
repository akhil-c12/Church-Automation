import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
  }
}

/**
 * Accepts an incoming X-Request-Id only if it is a well-formed UUID (so clients
 * can't inject arbitrary strings into logs or n8n); otherwise generates one.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.id = incoming && UUID.test(incoming) ? incoming.toLowerCase() : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
