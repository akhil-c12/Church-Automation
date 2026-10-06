import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { N8nClient } from '../n8n/client.js';
import { AppError } from '../lib/errors.js';
import { asyncHandler, callCtx, compact, forward, parse } from '../lib/http.js';
import { previewQuery, sendBody } from '../lib/schemas.js';
import { rateLimitHandler } from '../middleware/rateLimit.js';

export function birthdaysRouter(n8n: N8nClient): Router {
  const router = Router();
  // Single process, single admin: one send in flight at a time stops double-clicks
  // from starting two runs. n8n's per-message idempotency is the real guarantee.
  let sendInFlight = false;

  const sendLimiter = rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: rateLimitHandler('Too many send requests. Wait a minute and check /runs first.'),
  });

  router.get(
    '/preview',
    asyncHandler(async (req, res) => {
      const query = parse(previewQuery, req.query);
      forward(res, await n8n.callApi('preview_send', compact(query), callCtx(req)));
    }),
  );

  router.post(
    '/send',
    sendLimiter,
    asyncHandler(async (req, res) => {
      const body = parse(sendBody, req.body);
      if (sendInFlight) {
        throw new AppError(409, 'SEND_IN_PROGRESS', 'A send request is already being submitted. Check /runs before retrying.');
      }
      sendInFlight = true;
      try {
        const result = await n8n.callSend(compact(body), callCtx(req));
        req.log.info({ event: 'send_requested', status: result.status, execution_id: result.executionId }, 'send requested');
        forward(res, result);
      } finally {
        sendInFlight = false;
      }
    }),
  );

  return router;
}
