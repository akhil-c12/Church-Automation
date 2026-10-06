import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { CALLBACK_KEY, ORIGIN, login, makeApp, useMsw } from './helpers.js';

useMsw();

const runBody = (runId = 'RUN-4812') => ({
  event: 'birthday_run.completed',
  run: {
    Run_ID: runId,
    Workflow_Execution_ID: '4812',
    Request_ID: 'req-1',
    Trigger_Source: 'MANUAL',
    Requested_By: 'admin',
    Target_Date: '2026-10-03',
    Sent: 3,
    Failed: 0,
    Result: 'COMPLETED',
  },
});

interface SseEvent {
  id?: string;
  event?: string;
  data?: string;
}

/** Opens a real SSE connection and collects parsed events. */
function openStream(port: number, cookie: string, headers: Record<string, string> = {}) {
  const events: SseEvent[] = [];
  let raw = '';
  let pings = 0;
  let req!: http.ClientRequest;
  const ready = new Promise<http.IncomingMessage>((resolve, reject) => {
    req = http.get({ port, path: '/events', headers: { Cookie: cookie, ...headers } }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        raw += chunk;
        let idx;
        while ((idx = raw.indexOf('\n\n')) >= 0) {
          const block = raw.slice(0, idx);
          raw = raw.slice(idx + 2);
          if (block.startsWith(':')) pings++;
          const ev: SseEvent = {};
          for (const line of block.split('\n')) {
            const m = /^(id|event|data): (.*)$/.exec(line);
            if (m) ev[m[1] as keyof SseEvent] = m[2];
          }
          if (ev.event) events.push(ev);
        }
      });
      resolve(res);
    });
    req.on('error', reject);
  });
  return { events, ready, close: () => req.destroy(), pings: () => pings };
}

const waitFor = async (fn: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
};

let cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.forEach((c) => c());
  cleanup = [];
});

async function startServer() {
  const built = makeApp();
  const server = built.app.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  cleanup.push(() => {
    built.shutdown();
    server.close();
  });
  return { ...built, server, port: (server.address() as AddressInfo).port };
}

describe('POST /hooks/n8n', () => {
  it('rejects a missing or wrong X-Callback-Key with 401', async () => {
    const { app } = makeApp();
    expect((await request(app).post('/hooks/n8n').send(runBody())).status).toBe(401);
    expect((await request(app).post('/hooks/n8n').set('X-Callback-Key', 'wrong').send(runBody())).status).toBe(401);
    expect((await request(app).post('/hooks/n8n').set('X-Callback-Key', CALLBACK_KEY + 'x').send(runBody())).status).toBe(401);
  });

  it('does not accept a session cookie instead of the callback key', async () => {
    const { app } = makeApp();
    const cookie = await login(app);
    const res = await request(app).post('/hooks/n8n').set('Cookie', cookie).send(runBody());
    expect(res.status).toBe(401);
  });

  it('is exempt from CORS (no CORS headers) and the Origin guard', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/hooks/n8n').set('Origin', 'https://n8n.cloud').set('X-Callback-Key', CALLBACK_KEY).send(runBody());
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects malformed callback bodies with 400', async () => {
    const { app } = makeApp();
    const send = (b: object) => request(app).post('/hooks/n8n').set('X-Callback-Key', CALLBACK_KEY).send(b);
    expect((await send({ event: 'something.else' })).status).toBe(400);
    expect((await send({ event: 'birthday_run.completed', run: {} })).status).toBe(400);
    expect((await send({ event: 'birthday_workflow.failed' })).status).toBe(400);
  });

  it('204 and an SSE subscriber receives the event; duplicate Run_ID published once', async () => {
    const { port, app } = await startServer();
    const cookie = await login(app);
    const stream = openStream(port, cookie);
    cleanup.push(stream.close);
    const res = await stream.ready;
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const post = () => request(app).post('/hooks/n8n').set('X-Callback-Key', CALLBACK_KEY).send(runBody());
    expect((await post()).status).toBe(204);
    expect((await post()).status).toBe(204); // at-least-once redelivery

    await waitFor(() => stream.events.length >= 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(stream.events).toHaveLength(1);
    const ev = stream.events[0]!;
    expect(ev.event).toBe('run.completed');
    const data = JSON.parse(ev.data!);
    expect(data.run).toMatchObject({ run_id: 'RUN-4812', execution_id: '4812', result: 'COMPLETED', sent: 3 });
  });

  it('publishes workflow.failed, deduped by execution_id', async () => {
    const { port, app } = await startServer();
    const cookie = await login(app);
    const stream = openStream(port, cookie);
    cleanup.push(stream.close);
    await stream.ready;
    const body = { event: 'birthday_workflow.failed', execution_id: '231', failed_node: 'Read Members', error_message: 'quota', occurred_at: 'now' };
    await request(app).post('/hooks/n8n').set('X-Callback-Key', CALLBACK_KEY).send(body);
    await request(app).post('/hooks/n8n').set('X-Callback-Key', CALLBACK_KEY).send(body);
    await waitFor(() => stream.events.length >= 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(stream.events).toHaveLength(1);
    expect(stream.events[0]!.event).toBe('workflow.failed');
    expect(JSON.parse(stream.events[0]!.data!)).toMatchObject({ execution_id: '231', failed_node: 'Read Members' });
  });

  it('replays missed events on reconnect with Last-Event-ID', async () => {
    const { port, app } = await startServer();
    const cookie = await login(app);
    const first = openStream(port, cookie);
    cleanup.push(first.close);
    await first.ready;
    await request(app).post('/hooks/n8n').set('X-Callback-Key', CALLBACK_KEY).send(runBody('RUN-1'));
    await waitFor(() => first.events.length === 1);
    first.close();

    await request(app).post('/hooks/n8n').set('X-Callback-Key', CALLBACK_KEY).send(runBody('RUN-2'));
    const second = openStream(port, cookie, { 'Last-Event-ID': first.events[0]!.id! });
    cleanup.push(second.close);
    await second.ready;
    await waitFor(() => second.events.length >= 1);
    expect(second.events.map((e) => JSON.parse(e.data!).run.run_id)).toEqual(['RUN-2']);
  });

  it('sends heartbeats and closes the stream on logout', async () => {
    const { port, app } = await startServer();
    const cookie = await login(app);
    const stream = openStream(port, cookie, { Origin: ORIGIN });
    cleanup.push(stream.close);
    const res = await stream.ready;
    await waitFor(() => stream.pings() >= 2, 1000); // heartbeat is 50 ms in tests
    const ended = new Promise<void>((r) => res.on('end', () => r()));
    await request(app).post('/auth/logout').set('Cookie', cookie);
    await ended;
  });

  it('requires auth for /events', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/events')).status).toBe(401);
  });
});
