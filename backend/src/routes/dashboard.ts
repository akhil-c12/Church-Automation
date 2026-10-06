import { Router } from 'express';
import type { N8nClient, N8nResult } from '../n8n/client.js';
import { AppError } from '../lib/errors.js';
import { asyncHandler, callCtx } from '../lib/http.js';

interface SourceError {
  source: string;
  status: number;
  code: string;
  message: string;
}

export function dashboardRouter(n8n: N8nClient): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const ctx = callCtx(req);
      const sources = ['members', 'data_issues', 'preview', 'messages', 'last_run'] as const;
      const settled = await Promise.allSettled([
        n8n.callApi('list_members', { page_size: 1 }, ctx),
        n8n.callApi('list_members', { issues_only: true, page_size: 1 }, ctx),
        n8n.callApi('preview_send', {}, ctx),
        n8n.callApi('message_log', {}, ctx),
        n8n.callApi('run_history', { limit: 1 }, ctx),
      ]);

      const errors: SourceError[] = [];
      /** Returns `data` from a successful call, else records the error and returns undefined. */
      const take = <T>(i: number): T | undefined => {
        const s = settled[i] as PromiseSettledResult<N8nResult<T>>;
        const source = sources[i] as string;
        if (s.status === 'rejected') {
          const e = s.reason instanceof AppError ? s.reason : new AppError(500, 'INTERNAL_ERROR', 'Internal server error');
          if (!(s.reason instanceof AppError)) req.log.error({ err: s.reason, source }, 'dashboard source failed');
          errors.push({ source, status: e.status, code: e.code, message: e.message });
          return undefined;
        }
        const { status, body } = s.value;
        if (!body.success || status >= 400) {
          errors.push({
            source,
            status,
            code: body.error?.code ?? 'N8N_ERROR',
            message: body.error?.message ?? 'Request failed',
          });
          return undefined;
        }
        return body.data;
      };

      const members = take<{ totals?: unknown }>(0);
      const issues = take<{ pagination?: { total?: number } }>(1);
      const preview = take<{ target_date?: string; birthdays?: number; would_send?: number; counts?: unknown; members?: unknown[] }>(2);
      const messages = take<{ date?: string; counts?: unknown }>(3);
      const runs = take<{ runs?: unknown[] }>(4);

      if (errors.length === sources.length) {
        // Nothing worked: surface the first underlying error instead of an empty 200.
        const first = errors[0]!;
        throw new AppError(first.status >= 500 ? first.status : 502, first.code, first.message);
      }

      res.json({
        success: true,
        data: {
          totals: members?.totals ?? null,
          data_issues: issues?.pagination?.total ?? null,
          today: preview
            ? {
                date: preview.target_date ?? null,
                birthdays: preview.birthdays ?? null,
                would_send: preview.would_send ?? null,
                counts: preview.counts ?? null,
                // Who has a birthday today and what n8n will do for each (Decision[]).
                members: preview.members ?? [],
              }
            : null,
          messages_today: messages?.counts ?? null,
          last_run: runs?.runs?.[0] ?? null,
        },
        errors,
        request_id: req.id,
      });
    }),
  );

  return router;
}
