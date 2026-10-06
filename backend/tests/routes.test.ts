import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { API_KEY, API_URL, SEND_URL, USERNAME, echo, login, makeApp, mockN8n, n8nReply, useMsw } from './helpers.js';

useMsw();

let app: ReturnType<typeof makeApp>['app'];
let cookie: string;

beforeEach(async () => {
  ({ app } = makeApp());
  cookie = await login(app);
});

const get = (path: string) => request(app).get(path).set('Cookie', cookie);
const post = (path: string, body?: object) => request(app).post(path).set('Cookie', cookie).send(body);
const patch = (path: string, body: object) => request(app).patch(path).set('Cookie', cookie).send(body);

describe('route -> n8n action mapping', () => {
  it('GET /members -> list_members with coerced query types', async () => {
    const calls = mockN8n(API_URL, echo);
    const res = await get('/members?q=mary&status=Active&whatsapp_enabled=Yes&issues_only=true&birthday_month=10&page=2&page_size=50');
    expect(res.status).toBe(200);
    expect(calls[0]!.body.action).toBe('list_members');
    expect(calls[0]!.body.data).toEqual({
      q: 'mary',
      status: 'Active',
      whatsapp_enabled: 'Yes',
      issues_only: true,
      birthday_month: 10,
      page: 2,
      page_size: 50,
    });
  });

  it('sends X-API-Key, X-Request-Id and a backend-generated request_id', async () => {
    const calls = mockN8n(API_URL, echo);
    const res = await get('/members');
    const call = calls[0]!;
    expect(call.headers.get('x-api-key')).toBe(API_KEY);
    expect(call.headers.get('content-type')).toBe('application/json');
    expect(call.body.request_id).toBe(res.headers['x-request-id']);
    expect(call.headers.get('x-request-id')).toBe(res.headers['x-request-id']);
    expect(call.body.requested_by).toBe(USERNAME);
  });

  it('rejects bad query values before calling n8n', async () => {
    const calls = mockN8n(API_URL, echo);
    for (const q of ['issues_only=yes', 'page=0', 'page_size=201', 'birthday_month=13', 'status=active', 'page=1.5', 'foo=bar']) {
      const res = await get(`/members?${q}`);
      expect(res.status, q).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(calls).toHaveLength(0);
  });

  it('GET /members/:id -> get_member and passes 404 through', async () => {
    const calls = mockN8n(API_URL, (b) =>
      n8nReply({ success: false, action: b.action, error: { code: 'MEMBER_NOT_FOUND', message: 'Not found' } }, 404),
    );
    const res = await get('/members/CH0012');
    expect(calls[0]!.body).toMatchObject({ action: 'get_member', data: { member_id: 'CH0012' } });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('MEMBER_NOT_FOUND');
  });

  it('POST /members -> upsert_members with one record; ignores body requested_by', async () => {
    const calls = mockN8n(API_URL, echo);
    const member = { member_id: 'CH1', full_name: 'Mary', mobile_number: '9876543210', date_of_birth: '1990-01-05', whatsapp_enabled: 'Yes', status: 'Active' };
    const res = await post('/members', { ...member, requested_by: 'attacker@evil', request_id: 'spoofed' });
    expect(res.status).toBe(200);
    expect(calls[0]!.body.action).toBe('upsert_members');
    expect(calls[0]!.body.data).toEqual({ records: [member] });
    expect(calls[0]!.body.requested_by).toBe(USERNAME);
    expect(calls[0]!.body.request_id).not.toBe('spoofed');
  });

  it('PATCH /members/:id checks existence, then upserts with member_id from the URL', async () => {
    const calls = mockN8n(API_URL, (b) =>
      b.action === 'get_member' ? n8nReply({ success: true, action: 'get_member', data: { member: {} } }) : echo(b, 0),
    );
    const res = await patch('/members/CH1', { remarks: 'moved', requested_by: 'x' });
    expect(res.status).toBe(200);
    expect(calls.map((c) => c.body.action)).toEqual(['get_member', 'upsert_members']);
    expect(calls[1]!.body.data).toEqual({ records: [{ member_id: 'CH1', remarks: 'moved' }] });
    expect(calls[1]!.body.requested_by).toBe(USERNAME);
  });

  it('PATCH /members/:id does not create a missing member', async () => {
    const calls = mockN8n(API_URL, (b) =>
      n8nReply({ success: false, action: b.action, error: { code: 'MEMBER_NOT_FOUND', message: 'Not found' } }, 404),
    );
    const res = await patch('/members/NOPE', { remarks: 'x' });
    expect(res.status).toBe(404);
    expect(calls.map((c) => c.body.action)).toEqual(['get_member']);
  });

  it('PATCH /members/:id rejects changing member_id and empty patches', async () => {
    const calls = mockN8n(API_URL, echo);
    expect((await patch('/members/CH1', { member_id: 'CH2', remarks: 'x' })).status).toBe(400);
    expect((await patch('/members/CH1', {})).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('POST /members/:id/deactivate -> upsert status Inactive', async () => {
    const calls = mockN8n(API_URL, (b) =>
      b.action === 'get_member' ? n8nReply({ success: true, action: 'get_member', data: { member: {} } }) : echo(b, 0),
    );
    const res = await post('/members/CH1/deactivate');
    expect(res.status).toBe(200);
    expect(calls[1]!.body).toMatchObject({ action: 'upsert_members', data: { records: [{ member_id: 'CH1', status: 'Inactive' }] } });
  });

  it('POST /members/verify -> verify_members', async () => {
    const calls = mockN8n(API_URL, echo);
    const records = [{ member_id: 'A' }, { member_id: 'B', full_name: 'Bee' }];
    const res = await post('/members/verify', { records });
    expect(res.status).toBe(200);
    expect(calls[0]!.body).toMatchObject({ action: 'verify_members', data: { records } });
  });

  it('POST /members/import passes n8n 422 row errors through unchanged', async () => {
    const n8nBody = {
      success: false,
      action: 'upsert_members',
      error: { code: 'VALIDATION_ERROR', message: '1 invalid row', details: [] },
      data: {
        committed: false,
        summary: { valid: 1, invalid: 1 },
        rows: [{ row: 2, member_id: 'B', operation: 'ADD', validation_status: 'INVALID', errors: ['mobile_number is required'], warnings: [] }],
      },
      request_id: 'r',
      execution_id: '4812',
    };
    const calls = mockN8n(API_URL, () => n8nReply(n8nBody, 422));
    const res = await post('/members/import', { records: [{ member_id: 'A' }, { member_id: 'B' }] });
    expect(calls[0]!.body.action).toBe('upsert_members');
    expect(res.status).toBe(422);
    expect(res.body).toEqual(n8nBody);
    expect(res.headers['x-execution-id']).toBe('4812');
  });

  it('rejects 0 or >500 records before calling n8n', async () => {
    const calls = mockN8n(API_URL, echo);
    expect((await post('/members/import', { records: [] })).status).toBe(400);
    const many = Array.from({ length: 501 }, (_, i) => ({ member_id: `M${i}` }));
    expect((await post('/members/import', { records: many })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('GET /birthdays/preview -> preview_send with member_ids split', async () => {
    const calls = mockN8n(API_URL, echo);
    await get('/birthdays/preview?date=2026-10-03&member_ids=CH1,%20CH2');
    expect(calls[0]!.body).toMatchObject({ action: 'preview_send', data: { date: '2026-10-03', member_ids: ['CH1', 'CH2'] } });
  });

  it('GET /messages -> message_log', async () => {
    const calls = mockN8n(API_URL, echo);
    await get('/messages?date=2026-10-03&status=FAILED&member_id=CH1&limit=10');
    expect(calls[0]!.body).toMatchObject({
      action: 'message_log',
      data: { date: '2026-10-03', status: 'FAILED', member_id: 'CH1', limit: 10 },
    });
  });

  it('GET /runs and /runs/:executionId -> run_history', async () => {
    const calls = mockN8n(API_URL, echo);
    await get('/runs?date=2026-10-03&limit=5');
    await get('/runs/4812');
    expect(calls[0]!.body).toMatchObject({ action: 'run_history', data: { date: '2026-10-03', limit: 5 } });
    expect(calls[1]!.body).toMatchObject({ action: 'run_history', data: { execution_id: '4812' } });
    expect((await get('/runs/..%2Fetc')).status).toBe(400);
  });
});

describe('POST /birthdays/send', () => {
  it('maps to /send with requested_by from the JWT and returns 202 with execution_id', async () => {
    const calls = mockN8n(SEND_URL, (b) =>
      n8nReply(
        { success: true, status: 'ACCEPTED', request_id: b.request_id, data: { target_date: '2026-10-03', scope: 'SELECTED_MEMBERS' } },
        202,
        '9001',
      ),
    );
    const res = await post('/birthdays/send', { date: '2026-10-03', member_ids: ['CH1'], force_resend: true, requested_by: 'attacker' });
    expect(res.status).toBe(202);
    expect(res.body.execution_id).toBe('9001');
    expect(res.headers['x-execution-id']).toBe('9001');
    expect(calls[0]!.body).toEqual({
      request_id: res.headers['x-request-id'],
      requested_by: USERNAME,
      date: '2026-10-03',
      member_ids: ['CH1'],
      force_resend: true,
    });
  });

  it('passes n8n 400 VALIDATION_ERROR through', async () => {
    mockN8n(SEND_URL, () => n8nReply({ success: false, error: { code: 'VALIDATION_ERROR', details: ['date too old'] } }, 400));
    const res = await post('/birthdays/send', { date: '2020-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(['date too old']);
  });

  it('rejects a malformed body before calling n8n', async () => {
    const calls = mockN8n(SEND_URL, echo);
    expect((await post('/birthdays/send', { force_resend: 'yes' })).status).toBe(400);
    expect((await post('/birthdays/send', { member_ids: 'CH1' })).status).toBe(400);
    expect((await post('/birthdays/send', { date: '03/10/2026' })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('is rate-limited to 10 per minute', async () => {
    mockN8n(SEND_URL, () => n8nReply({ success: true, status: 'ACCEPTED' }, 202));
    for (let i = 0; i < 10; i++) expect((await post('/birthdays/send', {})).status).toBe(202);
    expect((await post('/birthdays/send', {})).status).toBe(429);
  });

  it('rejects a concurrent second send while one is in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mockN8n(SEND_URL, async () => {
      await gate;
      return n8nReply({ success: true, status: 'ACCEPTED' }, 202);
    });
    const { app: slowApp } = makeApp({ N8N_TIMEOUT_MS: '5000' });
    const c = await login(slowApp);
    const first = request(slowApp).post('/birthdays/send').set('Cookie', c).send({}).then((r) => r);
    await new Promise((r) => setTimeout(r, 50));
    const second = await request(slowApp).post('/birthdays/send').set('Cookie', c).send({});
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SEND_IN_PROGRESS');
    release();
    expect((await first).status).toBe(202);
  });
});
