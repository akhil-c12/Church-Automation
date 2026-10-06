import { Router } from 'express';
import type { Logger } from 'pino';
import { AppError } from '../lib/errors.js';
import type { N8nClient } from '../n8n/client.js';

type N8nHealth = 'ok' | 'error' | 'unreachable' | 'misconfigured';

/**
 * GET /health is public, so it:
 *  - returns only a status word for n8n (no workflow id or other internals), and
 *  - caches the n8n probe, so anonymous traffic can't burn n8n executions.
 * GET /health/live never calls n8n; use it for container/LB health checks.
 */
export function healthRouter(n8n: N8nClient, log: Logger, cacheMs = 30_000): Router {
  const router = Router();
  let cached: { value: N8nHealth; at: number } | undefined;
  let inflight: Promise<N8nHealth> | undefined;

  const probe = async (requestId: string): Promise<N8nHealth> => {
    try {
      const r = await n8n.callApi('health', {}, { requestId, requestedBy: 'system:health', log });
      return r.status === 200 && r.body.success && r.body.data?.status === 'ok' ? 'ok' : 'error';
    } catch (err) {
      if (err instanceof AppError && err.code === 'GATEWAY_MISCONFIGURED') return 'misconfigured';
      return 'unreachable';
    }
  };

  router.get('/live', (_req, res) => {
    res.json({ backend: 'ok' });
  });

  router.get('/', async (req, res) => {
    if (!cached || Date.now() - cached.at > cacheMs) {
      inflight ??= probe(req.id).finally(() => (inflight = undefined));
      cached = { value: await inflight, at: Date.now() };
    }
    res.json({ backend: 'ok', n8n: cached.value });
  });

  return router;
}
