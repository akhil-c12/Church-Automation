import { createHash, timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { parse } from '../lib/http.js';
import type { RunEvents } from '../services/runEvents.js';

const id = z.union([z.string().trim().min(1).max(128), z.number().int().nonnegative()]).transform(String);
const scalar = z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]);

const runCompleted = z.object({
  event: z.literal('birthday_run.completed'),
  run: z.object({ Run_ID: id }).catchall(scalar),
});

const workflowFailed = z.object({
  event: z.literal('birthday_workflow.failed'),
  execution_id: id,
  execution_url: z.string().max(2000).optional(),
  failed_node: z.string().max(500).optional(),
  error_message: z.string().max(4000).optional(),
  occurred_at: z.string().max(100).optional(),
});

const callbackBody = z.discriminatedUnion('event', [runCompleted, workflowFailed]);

/** n8n's PascalCase sheet columns -> the snake_case `Run` type used by /runs. */
const RUN_KEY_OVERRIDES: Record<string, string> = { Workflow_Execution_ID: 'execution_id' };
function toRun(run: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(run).map(([k, v]) => [Object.hasOwn(RUN_KEY_OVERRIDES, k) ? RUN_KEY_OVERRIDES[k]! : k.toLowerCase(), v]),
  );
}

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/**
 * POST /hooks/n8n — called by n8n, not the browser. Exempt from cookie auth and
 * CORS; authenticated by X-Callback-Key. Callbacks are at-least-once, so they are
 * de-duplicated by Run_ID / execution_id before being published to SSE.
 */
export function hooksRouter(callbackKey: string, events: RunEvents): Router {
  const router = Router();
  const expected = digest(callbackKey);

  router.post('/n8n', express.json({ limit: '64kb', strict: true }), (req, res, next) => {
    try {
      const provided = req.get('x-callback-key');
      // Hash both sides so lengths match and timingSafeEqual leaks nothing about the key.
      if (!provided || !timingSafeEqual(digest(provided), expected)) {
        req.log.warn({ event: 'callback_rejected' }, 'n8n callback with invalid key');
        throw new AppError(401, 'UNAUTHENTICATED', 'Invalid callback key');
      }

      const body = parse(callbackBody, req.body);
      let published: boolean;
      if (body.event === 'birthday_run.completed') {
        const run = toRun(body.run);
        published = events.publish('run.completed', { run }, `run:${body.run.Run_ID}`);
        req.log.info({ event: 'callback', type: body.event, run_id: body.run.Run_ID, result: run.result, duplicate: !published }, 'n8n callback');
      } else {
        const { event: _e, ...failure } = body;
        published = events.publish('workflow.failed', failure, `failed:${body.execution_id}`);
        req.log.error(
          { event: 'callback', type: body.event, execution_id: body.execution_id, failed_node: body.failed_node, duplicate: !published },
          'n8n workflow failed',
        );
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
