import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { Config } from './config.js';
import { createLogger, maskPhones } from './logger.js';
import { requestId } from './middleware/requestId.js';
import { requireAuth } from './middleware/auth.js';
import { originGuard } from './middleware/originGuard.js';
import { errorHandler, notFound } from './middleware/error.js';
import { rateLimitHandler } from './middleware/rateLimit.js';
import { N8nClient } from './n8n/client.js';
import { RunEvents } from './services/runEvents.js';
import { SessionService } from './services/session.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { membersRouter } from './routes/members.js';
import { birthdaysRouter } from './routes/birthdays.js';
import { messagesRouter } from './routes/messages.js';
import { runsRouter } from './routes/runs.js';
import { dashboardRouter } from './routes/dashboard.js';
import { hooksRouter } from './routes/hooks.js';
import { eventsRouter } from './routes/events.js';

export interface AppOptions {
  logger?: Logger;
  fetchImpl?: typeof fetch;
  n8nRetryBaseMs?: number;
  sseHeartbeatMs?: number;
  healthCacheMs?: number;
}

/** Strips identity fields a client might try to smuggle in; they come from the session. */
const stripClientIdentity: RequestHandler = (req, _res, next) => {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    delete req.body.requested_by;
    delete req.body.request_id;
  }
  next();
};

const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

export function createApp(config: Config, opts: AppOptions = {}) {
  const logger = opts.logger ?? createLogger(config);
  const sessions = new SessionService(config);
  const runEvents = new RunEvents();
  const n8n = new N8nClient({
    webhookBase: config.N8N_WEBHOOK_BASE,
    apiKey: config.N8N_API_KEY,
    timeoutMs: config.N8N_TIMEOUT_MS,
    retryBaseMs: opts.n8nRetryBaseMs,
    fetchImpl: opts.fetchImpl,
  });
  const events = eventsRouter(runEvents, sessions, { heartbeatMs: opts.sseHeartbeatMs });
  const auth = requireAuth(sessions);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  // No nested objects/arrays from qs: ?a[b]=1 stays a plain string key.
  app.set('query parser', 'simple');
  app.set('etag', false);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      // Log only what's needed; never headers (cookies) or bodies (phone numbers).
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: maskPhones(String(req.url)) }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      customProps: (req) => ({ ip: (req as express.Request).ip }),
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      // pino-http fabricates an Error (with a useless stack) for 5xx; real errors are logged by the error handler.
      customErrorObject: (_req, _res, _err, val) => ({ ...val, err: undefined }),
      autoLogging: { ignore: (req) => req.url === '/health/live' },
    }),
  );
  app.use(
    helmet({
      // Pure JSON API: nothing should ever be framed or render as a page.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      strictTransportSecurity: config.NODE_ENV === 'production',
    }),
  );
  app.use(noStore);
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (req) => req.path === '/health/live',
      handler: rateLimitHandler('Too many requests. Slow down.'),
    }),
  );

  // n8n → backend: no CORS, no cookies, own small body parser, X-Callback-Key auth.
  app.use('/hooks', hooksRouter(config.N8N_CALLBACK_KEY, runEvents));

  app.use(
    cors({
      origin: (origin, cb) => cb(null, origin === config.FRONTEND_ORIGIN),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Request-Id', 'Last-Event-ID'],
      exposedHeaders: ['X-Request-Id', 'X-Execution-Id'],
      maxAge: 600,
    }),
  );
  app.use(originGuard(config.FRONTEND_ORIGIN));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb', strict: true }));
  app.use(stripClientIdentity);

  app.use('/health', healthRouter(n8n, logger, opts.healthCacheMs));
  app.use('/auth', authRouter(config, sessions));
  app.use('/members', auth, membersRouter(n8n));
  app.use('/birthdays', auth, birthdaysRouter(n8n));
  app.use('/messages', auth, messagesRouter(n8n));
  app.use('/runs', auth, runsRouter(n8n));
  app.use('/dashboard', auth, dashboardRouter(n8n));
  app.use('/events', auth, events.router);

  app.use(notFound);
  app.use(errorHandler);

  return {
    app,
    logger,
    runEvents,
    sessions,
    shutdown: () => {
      events.closeAll();
      sessions.close();
    },
  };
}
