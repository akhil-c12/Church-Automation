import type { Logger } from 'pino';
import { AppError } from '../lib/errors.js';
import type { ActionDataMap, ApiAction, N8nEnvelope, SendAcceptedData, SendRequest } from './types.js';

export interface CallContext {
  requestId: string;
  requestedBy: string;
  log: Logger;
}

export interface N8nResult<T = unknown> {
  status: number;
  body: N8nEnvelope<T>;
  executionId?: string;
}

export interface N8nClientOptions {
  webhookBase: string;
  apiKey: string;
  timeoutMs: number;
  /** First backoff delay; doubles per retry. Tests shrink it. */
  retryBaseMs?: number;
  fetchImpl?: typeof fetch;
}

const API_PATH = '/church-birthday/v1/api';
const SEND_PATH = '/church-birthday/v1/send';

/** Retries allowed per action. /send is not here: it is never retried. */
const API_RETRIES: Record<ApiAction, number> = {
  health: 2,
  list_members: 2,
  get_member: 2,
  preview_send: 2,
  message_log: 2,
  run_history: 2,
  verify_members: 2,
  upsert_members: 1,
};

const RETRYABLE_STATUS = new Set([502, 503, 504]);
const EXECUTION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

type Attempt =
  | { kind: 'response'; status: number; text: string; executionId?: string }
  | { kind: 'network'; timedOut: boolean };

export class N8nClient {
  private readonly apiUrl: string;
  private readonly sendUrl: string;
  private readonly retryBaseMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: N8nClientOptions) {
    this.apiUrl = `${opts.webhookBase}${API_PATH}`;
    this.sendUrl = `${opts.webhookBase}${SEND_PATH}`;
    this.retryBaseMs = opts.retryBaseMs ?? 500;
    // Resolve the global lazily so instrumentation (and test interceptors) installed later still apply.
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  async callApi<A extends ApiAction>(
    action: A,
    data: Record<string, unknown>,
    ctx: CallContext,
  ): Promise<N8nResult<ActionDataMap[A]>> {
    const payload = { action, data, requested_by: ctx.requestedBy, request_id: ctx.requestId };
    const maxRetries = API_RETRIES[action];

    for (let attempt = 0; ; attempt++) {
      const result = await this.post(this.apiUrl, payload, action, attempt, ctx);
      const canRetry = attempt < maxRetries;

      if (result.kind === 'network') {
        if (canRetry) {
          await this.backoff(attempt);
          continue;
        }
        throw new AppError(
          502,
          'N8N_UNAVAILABLE',
          result.timedOut ? 'The automation service timed out' : 'The automation service is unreachable',
        );
      }
      if (RETRYABLE_STATUS.has(result.status) && canRetry) {
        await this.backoff(attempt);
        continue;
      }
      return this.interpret<ActionDataMap[A]>(result, action, ctx);
    }
  }

  /** Starts a send run. Never retried: a timeout means we can't know if a run started. */
  async callSend(body: Omit<SendRequest, 'request_id' | 'requested_by'>, ctx: CallContext): Promise<N8nResult<SendAcceptedData>> {
    const payload: SendRequest = { request_id: ctx.requestId, requested_by: ctx.requestedBy, ...body };
    const result = await this.post(this.sendUrl, payload, 'send', 0, ctx);

    const unknown = () =>
      new AppError(
        502,
        'SEND_STATUS_UNKNOWN',
        'The send request may or may not have started. Check GET /runs?date=<date> before sending again.',
      );

    if (result.kind === 'network') throw unknown();
    // A gateway error from n8n Cloud's edge (no contract body) leaves the outcome unknown too.
    if (RETRYABLE_STATUS.has(result.status) && !looksLikeEnvelope(safeParse(result.text))) throw unknown();

    const interpreted = this.interpret<SendAcceptedData>(result, 'send', ctx);
    if (interpreted.executionId && !interpreted.body.execution_id) {
      interpreted.body.execution_id = interpreted.executionId;
    }
    return interpreted;
  }

  private async post(url: string, payload: unknown, action: string, attempt: number, ctx: CallContext): Promise<Attempt> {
    const started = performance.now();
    const logFields = { n8n_action: action, attempt, request_id: ctx.requestId };
    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-API-Key': this.opts.apiKey,
          'X-Request-Id': ctx.requestId,
        },
        body: JSON.stringify(payload),
        // The timeout covers headers *and* body download.
        signal: AbortSignal.timeout(this.opts.timeoutMs),
        // Never follow redirects: fetch would forward X-API-Key to the new host.
        redirect: 'error',
      });
      const text = await readCapped(res, MAX_RESPONSE_BYTES);
      const rawExec = res.headers.get('x-execution-id') ?? undefined;
      const executionId = rawExec && EXECUTION_ID.test(rawExec) ? rawExec : undefined;
      ctx.log.info(
        { ...logFields, status: res.status, duration_ms: Math.round(performance.now() - started), execution_id: executionId },
        'n8n call',
      );
      return { kind: 'response', status: res.status, text, executionId };
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      ctx.log.warn(
        { ...logFields, duration_ms: Math.round(performance.now() - started), timed_out: timedOut, error: errorName(err) },
        'n8n call failed',
      );
      return { kind: 'network', timedOut };
    }
  }

  private interpret<T>(result: Extract<Attempt, { kind: 'response' }>, action: string, ctx: CallContext): N8nResult<T> {
    if (result.status === 401 || result.status === 403) {
      ctx.log.error(
        { n8n_action: action, status: result.status, request_id: ctx.requestId },
        'GATEWAY MISCONFIGURED: n8n rejected the API key. Check N8N_API_KEY matches the "Church Backend API Key" credential.',
      );
      throw new AppError(500, 'GATEWAY_MISCONFIGURED', 'The backend is misconfigured. Contact the administrator.');
    }

    const parsed = safeParse(result.text);
    if (!looksLikeEnvelope(parsed)) {
      if (result.status === 404) {
        ctx.log.error(
          { n8n_action: action, request_id: ctx.requestId },
          'GATEWAY MISCONFIGURED: n8n webhook not registered. Is the workflow published (or the test URL listening)? Check N8N_WEBHOOK_BASE.',
        );
        throw new AppError(500, 'GATEWAY_MISCONFIGURED', 'The backend is misconfigured. Contact the administrator.');
      }
      ctx.log.error({ n8n_action: action, status: result.status, request_id: ctx.requestId }, 'n8n returned a non-contract response');
      throw new AppError(502, 'N8N_BAD_RESPONSE', 'The automation service returned an invalid response');
    }

    return { status: result.status, body: parsed as N8nEnvelope<T>, executionId: result.executionId };
  }

  private backoff(attempt: number): Promise<void> {
    const base = this.retryBaseMs * 2 ** attempt;
    const jitter = Math.random() * base * 0.25;
    return new Promise((resolve) => setTimeout(resolve, base + jitter));
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function looksLikeEnvelope(v: unknown): v is N8nEnvelope {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && typeof (v as { success?: unknown }).success === 'boolean';
}

function errorName(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: { code?: unknown } }).cause;
    return typeof cause?.code === 'string' ? `${err.name}:${cause.code}` : err.name;
  }
  return 'unknown';
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
    return '';
  }
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return '';
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
