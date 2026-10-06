import { Router } from 'express';
import { AppError } from '../lib/errors.js';
import { currentUser } from '../middleware/auth.js';
import type { RunEvent, RunEvents } from '../services/runEvents.js';
import type { SessionService } from '../services/session.js';

export interface EventsOptions {
  heartbeatMs?: number;
  maxConnections?: number;
}

/** GET /events — Server-Sent Events: `run.completed` and `workflow.failed`. */
export function eventsRouter(events: RunEvents, sessions: SessionService, opts: EventsOptions = {}) {
  const router = Router();
  const heartbeatMs = opts.heartbeatMs ?? 25_000;
  const maxConnections = opts.maxConnections ?? 20;
  const open = new Set<() => void>();

  router.get('/', (req, res, next) => {
    const user = currentUser(req);
    if (open.size >= maxConnections) {
      return next(new AppError(503, 'TOO_MANY_STREAMS', 'Too many open event streams'));
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);

    const write = (e: RunEvent) => res.write(`id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify({ ...e.data, received_at: e.receivedAt })}\n\n`);

    res.write('retry: 5000\n\n');
    const lastId = req.get('last-event-id');
    if (lastId && lastId.length <= 64) events.since(lastId).forEach(write);

    const unsubscribe = events.subscribe(write);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), heartbeatMs);
    // End the stream when the session expires or is revoked; EventSource will
    // reconnect, get 401, and the UI can send the user to login.
    const expiry = setTimeout(() => close(), Math.max(0, user.exp * 1000 - Date.now()));
    const onRevoked = (jti: string) => jti === user.jti && close();
    sessions.on('revoked', onRevoked);

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      clearTimeout(expiry);
      unsubscribe();
      sessions.off('revoked', onRevoked);
      open.delete(close);
      res.end();
    }
    open.add(close);
    req.on('close', close);
  });

  return {
    router,
    /** Ends every open stream (graceful shutdown). */
    closeAll: () => [...open].forEach((c) => c()),
  };
}
