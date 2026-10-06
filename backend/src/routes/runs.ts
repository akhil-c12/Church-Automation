import { Router } from 'express';
import type { N8nClient } from '../n8n/client.js';
import { asyncHandler, callCtx, compact, forward, parse } from '../lib/http.js';
import { executionId, runsQuery } from '../lib/schemas.js';

export function runsRouter(n8n: N8nClient): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const query = parse(runsQuery, req.query);
      forward(res, await n8n.callApi('run_history', compact(query), callCtx(req)));
    }),
  );

  // Poll until data.status !== 'IN_PROGRESS_OR_NOT_FOUND'.
  router.get(
    '/:executionId',
    asyncHandler(async (req, res) => {
      const id = parse(executionId, req.params.executionId);
      forward(res, await n8n.callApi('run_history', { execution_id: id }, callCtx(req)));
    }),
  );

  return router;
}
