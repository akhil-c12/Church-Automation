import { delay, HttpResponse } from 'msw';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { API_URL, SEND_URL, echo, login, makeApp, mockN8n, n8nReply, useMsw } from './helpers.js';

useMsw();

let app: ReturnType<typeof makeApp>['app'];
let cookie: string;

beforeEach(async () => {
  ({ app } = makeApp());
  cookie = await login(app);
});

const get = (path: string) => request(app).get(path).set('Cookie', cookie);

describe('n8n client: retries, timeouts, error mapping', () => {
  it('read timeout: retried twice (3 attempts) then 502 N8N_UNAVAILABLE', async () => {
    const calls = mockN8n(API_URL, async () => {
      await delay('infinite');
      return n8nReply({});
    });
    const res = await get('/members');
    expect(calls).toHaveLength(3);
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ success: false, error: { code: 'N8N_UNAVAILABLE' } });
  });

  it('read network error: retried then 502', async () => {
    const calls = mockN8n(API_URL, () => Response.error());
    const res = await get('/messages');
    expect(calls).toHaveLength(3);
    expect(res.status).toBe(502);
  });

  it('read 503 then success: retried and succeeds', async () => {
    const calls = mockN8n(API_URL, (b, n) =>
      n === 1 ? n8nReply({ success: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Sheets down' } }, 503) : echo(b, n),
    );
    const res = await get('/members');
    expect(calls).toHaveLength(2);
    expect(res.status).toBe(200);
  });

  it('persistent 503 is passed through after retries', async () => {
    const calls = mockN8n(API_URL, () => n8nReply({ success: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Sheets down' } }, 503));
    const res = await get('/members');
    expect(calls).toHaveLength(3);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
  });

  it('does not retry 4xx', async () => {
    const calls = mockN8n(API_URL, () => n8nReply({ success: false, error: { code: 'VALIDATION_ERROR', message: 'x' } }, 400));
    await get('/members');
    expect(calls).toHaveLength(1);
  });

  it('upsert_members is retried at most once', async () => {
    const calls = mockN8n(API_URL, () => Response.error());
    const res = await request(app).post('/members').set('Cookie', cookie).send({ member_id: 'C1' });
    expect(calls).toHaveLength(2);
    expect(res.status).toBe(502);
  });

  it('/send timeout: NOT retried, 502 SEND_STATUS_UNKNOWN', async () => {
    const calls = mockN8n(SEND_URL, async () => {
      await delay('infinite');
      return n8nReply({});
    });
    const res = await request(app).post('/birthdays/send').set('Cookie', cookie).send({});
    expect(calls).toHaveLength(1);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('SEND_STATUS_UNKNOWN');
    expect(res.body.error.message).toMatch(/\/runs\?date=/);
  });

  it('/send gateway 504 without a contract body: NOT retried, SEND_STATUS_UNKNOWN', async () => {
    const calls = mockN8n(SEND_URL, () => new HttpResponse('Gateway Timeout', { status: 504 }));
    const res = await request(app).post('/birthdays/send').set('Cookie', cookie).send({});
    expect(calls).toHaveLength(1);
    expect(res.body.error.code).toBe('SEND_STATUS_UNKNOWN');
  });

  it('n8n 403 -> 500 GATEWAY_MISCONFIGURED, never retried, nothing leaked', async () => {
    const calls = mockN8n(API_URL, () => HttpResponse.text('Authorization data is wrong!', { status: 403 }));
    const res = await get('/members');
    expect(calls).toHaveLength(1);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'GATEWAY_MISCONFIGURED', message: expect.any(String) },
      request_id: expect.any(String),
    });
  });

  it('n8n 404 "webhook not registered" -> 500 GATEWAY_MISCONFIGURED', async () => {
    mockN8n(API_URL, () => HttpResponse.json({ code: 404, message: 'The requested webhook "POST church-birthday/v1/api" is not registered.' }, { status: 404 }));
    const res = await get('/members');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('GATEWAY_MISCONFIGURED');
  });

  it('non-JSON or non-contract body -> 502 N8N_BAD_RESPONSE', async () => {
    mockN8n(API_URL, () => HttpResponse.text('<html>oops</html>', { status: 200 }));
    expect((await get('/members')).body.error.code).toBe('N8N_BAD_RESPONSE');
    mockN8n(API_URL, () => HttpResponse.json([1, 2, 3]));
    expect((await get('/members')).body.error.code).toBe('N8N_BAD_RESPONSE');
  });

  it('refuses to follow redirects (would forward X-API-Key)', async () => {
    const calls = mockN8n(API_URL, () => new HttpResponse(null, { status: 302, headers: { Location: 'https://evil.example/steal' } }));
    const res = await get('/members');
    expect(res.status).toBe(502);
    expect(calls.length).toBeGreaterThan(0);
  });

  it('drops a malformed X-Execution-Id header', async () => {
    mockN8n(API_URL, (b) => n8nReply({ success: true, action: b.action, data: {} }, 200, 'bad\r\nheader: injected'.replace(/[\r\n]/g, ' ')));
    const res = await get('/members');
    expect(res.status).toBe(200);
    expect(res.headers['x-execution-id']).toBeUndefined();
  });
});
