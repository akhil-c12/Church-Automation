import bcrypt from 'bcryptjs';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import request from 'supertest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { createApp, type AppOptions } from '../src/app.js';
import { loadConfig } from '../src/config.js';

export const N8N_BASE = 'https://n8n.test/webhook';
export const API_URL = `${N8N_BASE}/church-birthday/v1/api`;
export const SEND_URL = `${N8N_BASE}/church-birthday/v1/send`;
export const ORIGIN = 'http://localhost:5173';
export const USERNAME = 'admin';
export const PASSWORD = 'correct horse battery staple';
export const API_KEY = 'test-n8n-api-key-0123456789abcdef';
export const CALLBACK_KEY = 'test-callback-key-0123456789abcdef0123456789';

const HASH = bcrypt.hashSync(PASSWORD, 4);

export function testConfig(overrides: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    FRONTEND_ORIGIN: ORIGIN,
    ADMIN_USERNAME: USERNAME,
    ADMIN_PASSWORD_HASH: HASH,
    JWT_SECRET: 'test-jwt-secret-that-is-long-enough-0123456789',
    N8N_WEBHOOK_BASE: N8N_BASE,
    N8N_API_KEY: API_KEY,
    N8N_TIMEOUT_MS: '150',
    N8N_CALLBACK_KEY: CALLBACK_KEY,
    ...overrides,
  });
}

export function makeApp(overrides: Record<string, string> = {}, opts: AppOptions = {}) {
  return createApp(testConfig(overrides), { n8nRetryBaseMs: 1, sseHeartbeatMs: 50, healthCacheMs: 0, ...opts });
}

export const msw = setupServer();

/** Installs MSW for the file. Unhandled outbound requests fail; supertest's loopback calls pass. */
export function useMsw() {
  beforeAll(() =>
    msw.listen({
      onUnhandledRequest: (req) => {
        const { hostname } = new URL(req.url);
        if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]') return;
        throw new Error(`Unhandled outbound request: ${req.method} ${req.url}`);
      },
    }),
  );
  afterEach(() => msw.resetHandlers());
  afterAll(() => msw.close());
}

export interface RecordedCall {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

type Responder = (body: Record<string, unknown>, n: number) => Response | Promise<Response>;

/** Mocks an n8n endpoint and records every request it receives. */
export function mockN8n(url: string, responder: Responder): RecordedCall[] {
  const calls: RecordedCall[] = [];
  msw.use(
    http.post(url, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      calls.push({ url: request.url, headers: request.headers, body });
      return responder(body, calls.length);
    }),
  );
  return calls;
}

/** The standard n8n envelope reply. */
export function n8nReply(body: JsonBodyType, status = 200, executionId = '4812') {
  return HttpResponse.json(body, { status, headers: { 'X-Execution-Id': executionId } });
}

/** Echo responder: success with the action and data it received. */
export const echo: Responder = (body) =>
  n8nReply({ success: true, action: body.action, data: { echoed: body.data }, request_id: body.request_id, execution_id: '4812' });

export async function login(app: Parameters<typeof request>[0]): Promise<string> {
  const res = await request(app).post('/auth/login').send({ username: USERNAME, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0];
  if (!cookie) throw new Error('no cookie');
  return cookie.split(';')[0]!;
}
