import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { echo, login, makeApp, mockN8n, API_URL, PASSWORD, USERNAME, useMsw } from './helpers.js';

useMsw();

describe('auth', () => {
  it('rejects a wrong password with 401 and sets no cookie', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/auth/login').send({ username: USERNAME, password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a wrong username with the same error', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/auth/login').send({ username: 'root', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('sets an httpOnly SameSite=Lax cookie on success', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/auth/login').send({ username: USERNAME, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ username: USERNAME });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^cbd_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    // The token itself never appears in the JSON body.
    expect(JSON.stringify(res.body)).not.toMatch(/eyJ/);
  });

  it('uses a Secure __Host- cookie in production', async () => {
    const { app } = makeApp({ NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://admin.example.org' });
    const res = await request(app).post('/auth/login').send({ username: USERNAME, password: PASSWORD });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^__Host-cbd_session=/);
    expect(cookie).toMatch(/Secure/);
  });

  it('protects routes without a cookie', async () => {
    const { app } = makeApp();
    for (const path of ['/members', '/auth/me', '/dashboard', '/runs', '/messages', '/events', '/birthdays/preview']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('GET /auth/me returns the username', async () => {
    const { app } = makeApp();
    const cookie = await login(app);
    const res = await request(app).get('/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ username: USERNAME });
  });

  it('logout clears the cookie and revokes the token server-side', async () => {
    const { app } = makeApp();
    const cookie = await login(app);
    const out = await request(app).post('/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(204);
    expect(String(out.headers['set-cookie'])).toMatch(/cbd_session=;/);
    // Replaying the old cookie no longer works.
    const me = await request(app).get('/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(401);
  });

  it('rejects tokens signed with another secret, another algorithm, or for another user', async () => {
    const { app } = makeApp();
    const opts = { issuer: 'church-birthday-backend', audience: 'church-birthday-dashboard', jwtid: 'x', expiresIn: 60 };
    const forged = [
      jwt.sign({}, 'some-other-secret-some-other-secret-1234', { ...opts, subject: USERNAME }),
      jwt.sign({}, '', { ...opts, subject: USERNAME, algorithm: 'none' }),
      jwt.sign({}, 'test-jwt-secret-that-is-long-enough-0123456789', { ...opts, subject: 'someone-else' }),
      jwt.sign({}, 'test-jwt-secret-that-is-long-enough-0123456789', { ...opts, subject: USERNAME, expiresIn: -10 }),
    ];
    for (const token of forged) {
      const res = await request(app).get('/auth/me').set('Cookie', `cbd_session=${token}`);
      expect(res.status).toBe(401);
    }
  });

  it('rate-limits failed logins: 5 per 15 minutes per IP', async () => {
    const { app } = makeApp();
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post('/auth/login').send({ username: USERNAME, password: 'bad' });
      expect(r.status).toBe(401);
    }
    const blocked = await request(app).post('/auth/login').send({ username: USERNAME, password: PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('a token stays valid across requests to n8n-backed routes', async () => {
    const calls = mockN8n(API_URL, echo);
    const { app } = makeApp();
    const cookie = await login(app);
    const res = await request(app).get('/members').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(calls[0]!.body.requested_by).toBe(USERNAME);
  });
});
