import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { API_URL, login, makeApp, mockN8n, n8nReply, useMsw } from './helpers.js';

useMsw();

const ok = (action: string, data: object) => n8nReply({ success: true, action, data });

function responder(failMessageLog: boolean) {
  return (b: Record<string, unknown>) => {
    const data = b.data as Record<string, unknown>;
    switch (b.action) {
      case 'list_members':
        return data.issues_only
          ? ok('list_members', { members: [], pagination: { page: 1, page_size: 1, total: 4, total_pages: 4 }, totals: {} })
          : ok('list_members', { members: [], pagination: { total: 120 }, totals: { all_members: 120, with_data_issues: 4 } });
      case 'preview_send':
        return ok('preview_send', { target_date: '2026-10-03', birthdays: 3, would_send: 2, counts: { SEND: 2, SKIPPED: 1 }, members: [] });
      case 'message_log':
        return failMessageLog
          ? n8nReply({ success: false, error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Sheets down' } }, 503)
          : ok('message_log', { counts: { SENT: 2 }, messages: [] });
      case 'run_history':
        return ok('run_history', { found: true, status: 'FOUND', runs: [{ run_id: 'RUN-1', result: 'COMPLETED' }] });
      default:
        throw new Error(`unexpected ${String(b.action)}`);
    }
  };
}

describe('GET /dashboard', () => {
  it('calls the five sources and aggregates them', async () => {
    const calls = mockN8n(API_URL, responder(false));
    const { app } = makeApp();
    const cookie = await login(app);
    const res = await request(app).get('/dashboard').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(calls.map((c) => [c.body.action, c.body.data]).sort()).toEqual(
      [
        ['list_members', { page_size: 1 }],
        ['list_members', { issues_only: true, page_size: 1 }],
        ['preview_send', {}],
        ['message_log', {}],
        ['run_history', { limit: 1 }],
      ].sort(),
    );
    expect(res.body.data).toEqual({
      totals: { all_members: 120, with_data_issues: 4 },
      data_issues: 4,
      today: { date: '2026-10-03', birthdays: 3, would_send: 2, counts: { SEND: 2, SKIPPED: 1 }, members: [] },
      messages_today: { SENT: 2 },
      last_run: { run_id: 'RUN-1', result: 'COMPLETED' },
    });
    expect(res.body.errors).toEqual([]);
  });

  it('still returns 200 with partial data when one source fails', async () => {
    mockN8n(API_URL, responder(true));
    const { app } = makeApp();
    const cookie = await login(app);
    const res = await request(app).get('/dashboard').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.messages_today).toBeNull();
    expect(res.body.data.totals).toEqual({ all_members: 120, with_data_issues: 4 });
    expect(res.body.errors).toEqual([{ source: 'messages', status: 503, code: 'DEPENDENCY_UNAVAILABLE', message: 'Sheets down' }]);
  });

  it('returns 502 when every source fails', async () => {
    mockN8n(API_URL, () => Response.error());
    const { app } = makeApp();
    const cookie = await login(app);
    const res = await request(app).get('/dashboard').set('Cookie', cookie);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('N8N_UNAVAILABLE');
  });
});
