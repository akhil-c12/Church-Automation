import { Router } from 'express';
import type { N8nClient } from '../n8n/client.js';
import { asyncHandler, callCtx, compact, forward, parse } from '../lib/http.js';
import { messagesQuery } from '../lib/schemas.js';

export function messagesRouter(n8n: N8nClient): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const query = parse(messagesQuery, req.query);
      forward(res, await n8n.callApi('message_log', compact(query), callCtx(req)));
    }),
  );

  return router;
}
