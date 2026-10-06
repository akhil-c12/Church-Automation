import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { API_KEY, API_URL, CALLBACK_KEY, ORIGIN, echo, login, makeApp, mockN8n, n8nReply, useMsw } from './helpers.js';
import { loadConfig, ConfigError } from '../src/config.js';
import { maskPhones } from '../src/logger.js';

useMsw();

describe('security headers and CORS', () => {
  it('sets helmet headers, no-store and an X-Request-Id', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/health/live');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('ignores a non-UUID incoming X-Request-Id (log-injection guard)', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/health/live').set('X-Request-Id', '<script>alert(1)</script>');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('allows CORS with credentials only for FRONTEND_ORIGIN', async () => {
    const { app } = makeApp();
    const ok = await request(app).options('/members').set('Origin', ORIGIN).set('Access-Control-Request-Method', 'GET');
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');

    const bad = await request(app).options('/members').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('blocks state-changing requests from a foreign Origin (CSRF), even with a valid cookie', async () => {
    const calls = mockN8n(API_URL, echo);
    const { app } = makeApp();
    const cookie = await login(app);
    const res = await request(app)
      .post('/members/C1/deactivate')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ORIGIN');
    expect(calls).toHaveLength(0);
  });

  it('blocks cross-origin login attempts (login CSRF)', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/auth/login').set('Origin', 'https://evil.example').send({ username: 'a', password: 'b' });
    expect(res.status).toBe(403);
  });

  it('does not parse text/plain bodies as JSON (simple-request CSRF)', async () => {
    const calls = mockN8n(API_URL, echo);
    const { app } = makeApp();
    const cookie = await login(app);
    const res = await request(app)
      .post('/members')
      .set('Cookie', cookie)
      .set('Content-Type', 'text/plain')
      .send('{"member_id":"C1","full_name":"x"}');
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe('secrets never leak', () => {
  it('no response ever contains the n8n URL, API key or callback key', async () => {
    mockN8n(API_URL, () => n8nReply({ nope: true }, 403));
    const { app } = makeApp();
    const cookie = await login(app);
    const responses = await Promise.all([
      request(app).get('/members').set('Cookie', cookie),
      request(app).get('/health'),
      request(app).get('/dashboard').set('Cookie', cookie),
      request(app).post('/hooks/n8n').set('X-Callback-Key', 'wrong').send({}),
    ]);
    for (const r of responses) {
      const text = JSON.stringify({ h: r.headers, b: r.body, t: r.text });
      expect(text).not.toContain(API_KEY);
      expect(text).not.toContain(CALLBACK_KEY);
      expect(text).not.toContain('n8n.test');
    }
  });

  it('public /health exposes only a status word, never n8n internals', async () => {
    mockN8n(API_URL, () =>
      n8nReply({ success: true, action: 'health', data: { status: 'ok', service: 'svc', workflow_id: 'JIuwUF8ENjLXa3MZ', time_ist: 'now' } }),
    );
    const { app } = makeApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ backend: 'ok', n8n: 'ok' });
  });

  it('/health caches the n8n probe so anonymous traffic cannot burn executions', async () => {
    const calls = mockN8n(API_URL, () => n8nReply({ success: true, action: 'health', data: { status: 'ok' } }));
    const { app } = makeApp({}, { healthCacheMs: 60_000 });
    await Promise.all([1, 2, 3, 4, 5].map(() => request(app).get('/health')));
    await request(app).get('/health');
    expect(calls).toHaveLength(1);
  });

  it('/health reports unreachable when n8n is down', async () => {
    mockN8n(API_URL, () => Response.error());
    const { app } = makeApp();
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ backend: 'ok', n8n: 'unreachable' });
  });

  it('masks phone numbers for logs, keeping the last 4 digits', () => {
    expect(maskPhones('/members?q=9876543210')).toBe('/members?q=******3210');
    expect(maskPhones('+919876543210')).toBe('*********3210');
    expect(maskPhones('/runs/4812')).toBe('/runs/4812');
  });
});

describe('input hardening', () => {
  it('rejects repeated query params and nested query objects', async () => {
    const calls = mockN8n(API_URL, echo);
    const { app } = makeApp();
    const cookie = await login(app);
    expect((await request(app).get('/members?page=1&page=2').set('Cookie', cookie)).status).toBe(400);
    expect((await request(app).get('/members?status[$ne]=x').set('Cookie', cookie)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects unknown body fields (no mass-assignment passthrough to n8n)', async () => {
    const calls = mockN8n(API_URL, echo);
    const { app } = makeApp();
    const cookie = await login(app);
    const res = await request(app).post('/members').set('Cookie', cookie).send({ member_id: 'C1', is_admin: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(calls).toHaveLength(0);
  });

  it('rejects __proto__ / constructor keys in JSON bodies', async () => {
    const calls = mockN8n(API_URL, echo);
    const { app } = makeApp();
    const cookie = await login(app);
    for (const raw of ['{"member_id":"C1","__proto__":{"admin":true}}', '{"member_id":"C1","constructor":{"prototype":{"x":1}}}']) {
      const res = await request(app).post('/members').set('Cookie', cookie).set('Content-Type', 'application/json').send(raw);
      expect(res.status, raw).toBe(400);
    }
    expect(calls).toHaveLength(0);
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  it('returns 400 for malformed JSON and 413 for bodies over 1 MB', async () => {
    const { app } = makeApp();
    const cookie = await login(app);
    const bad = await request(app).post('/members').set('Cookie', cookie).set('Content-Type', 'application/json').send('{bad');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_BODY');
    const big = await request(app)
      .post('/members/verify')
      .set('Cookie', cookie)
      .send({ records: [{ member_id: 'C1', remarks: 'x'.repeat(1_100_000) }] });
    expect(big.status).toBe(413);
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});

describe('config', () => {
  const base = {
    FRONTEND_ORIGIN: 'http://localhost:5173',
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD_HASH: '$2b$12$' + 'a'.repeat(53),
    JWT_SECRET: 'j'.repeat(40),
    N8N_WEBHOOK_BASE: 'https://x.app.n8n.cloud/webhook/',
    N8N_API_KEY: 'k'.repeat(32),
    N8N_CALLBACK_KEY: 'c'.repeat(40),
  };

  it('accepts a valid env and strips the trailing slash', () => {
    expect(loadConfig(base).N8N_WEBHOOK_BASE).toBe('https://x.app.n8n.cloud/webhook');
  });

  it.each(['ADMIN_PASSWORD_HASH', 'JWT_SECRET', 'N8N_API_KEY', 'N8N_CALLBACK_KEY', 'N8N_WEBHOOK_BASE', 'FRONTEND_ORIGIN'])(
    'refuses to start without %s, without echoing secret values',
    (key) => {
      const env: Record<string, string> = { ...base, [key]: '' };
      expect(() => loadConfig(env)).toThrow(ConfigError);
      try {
        loadConfig({ ...base, JWT_SECRET: 'short-secret-value' });
      } catch (e) {
        expect(String(e)).not.toContain('short-secret-value');
      }
    },
  );

  it('rejects weak or reused secrets and insecure production URLs', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...base, N8N_CALLBACK_KEY: base.N8N_API_KEY.padEnd(40, 'k') , N8N_API_KEY: base.N8N_API_KEY.padEnd(40, 'k') })).toThrow(/N8N_CALLBACK_KEY/);
    expect(() => loadConfig({ ...base, ADMIN_PASSWORD_HASH: 'plaintext-password' })).toThrow(/ADMIN_PASSWORD_HASH/);
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', N8N_WEBHOOK_BASE: 'http://x/webhook', FRONTEND_ORIGIN: 'https://a.org' })).toThrow(/https/);
    expect(() => loadConfig({ ...base, N8N_WEBHOOK_BASE: 'https://user:pw@x/webhook' })).toThrow(/credentials/);
    expect(() => loadConfig({ ...base, FRONTEND_ORIGIN: 'http://localhost:5173/app' })).toThrow(/origin/);
  });
});
