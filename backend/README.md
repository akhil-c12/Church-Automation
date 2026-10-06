# Church Birthday Dashboard — Backend

A thin, secure gateway between the Next.js dashboard and the n8n workflow
**Church Birthday WhatsApp – Production v2**. n8n owns all business logic, Google
Sheets and WhatsApp. This service:

1. authenticates the single admin (bcrypt + JWT in an httpOnly cookie),
2. keeps the n8n API key and webhook URLs **server-side only**,
3. exposes REST endpoints and translates them to n8n webhook calls,
4. receives n8n callbacks and pushes run results to the dashboard over SSE,
5. adds timeouts, safe retries, request IDs, structured logs, rate limits and input-shape validation.

```
Browser ──cookie──► this backend ──X-API-Key──► n8n ──► Sheets / WhatsApp
   ▲                     ▲
   └────── SSE ──────────┴──X-Callback-Key── n8n callbacks
```

The browser never sees the n8n URL, the API key or the callback key. They don't
appear in any response, log line or the frontend bundle.

---

## Setup

Requires Node.js ≥ 22.

```bash
cd backend
npm ci
cp .env.example .env
npm run hash-password          # prompts for the admin password, prints ADMIN_PASSWORD_HASH='...'
openssl rand -hex 32           # → JWT_SECRET
openssl rand -hex 32           # → N8N_CALLBACK_KEY
# N8N_API_KEY = the value of the n8n credential "Church Backend API Key"
npm run dev                    # http://localhost:4000
```

| Script | Does |
|---|---|
| `npm run dev` | `tsx watch` with auto-reload |
| `npm run build` / `npm start` | compile to `dist/` / run it |
| `npm test` | vitest + supertest, n8n mocked with MSW |
| `npm run typecheck` | strict TypeScript over src + tests |
| `npm run hash-password` | bcrypt (cost 12) hash for `ADMIN_PASSWORD_HASH` |

### Environment

The server **refuses to start** if anything is missing or weak, and lists only
variable names, never values.

| Var | Required | Notes |
|---|---|---|
| `PORT` | – | default 4000 |
| `NODE_ENV` | – | `production` enables Secure `__Host-` cookie, HSTS, and requires https URLs |
| `LOG_LEVEL` | – | default `info` |
| `FRONTEND_ORIGIN` | ✔ | exact origin, e.g. `https://admin.church.org` (no path). Only origin allowed by CORS/CSRF guard |
| `TRUST_PROXY` | – | number of proxies in front (0 = none). Needed for per-IP rate limits behind nginx/Caddy/LB/Next proxy |
| `ADMIN_USERNAME` | ✔ | |
| `ADMIN_PASSWORD_HASH` | ✔ | bcrypt. **Wrap in single quotes** in `.env` (`'$2b$12$…'`) |
| `JWT_SECRET` | ✔ | ≥ 32 chars. Rotate to log everyone out |
| `JWT_TTL_HOURS` | – | default 12, max 168 |
| `N8N_WEBHOOK_BASE` | ✔ | see below |
| `N8N_API_KEY` | ✔ | ≥ 16 chars, header `X-API-Key` |
| `N8N_TIMEOUT_MS` | – | per attempt, default 30000 |
| `N8N_CALLBACK_KEY` | ✔ | ≥ 32 chars, must differ from the API key |

### n8n test vs production

The backend builds `${N8N_WEBHOOK_BASE}/church-birthday/v1/api` and `…/v1/send`.

| Mode | `N8N_WEBHOOK_BASE` |
|---|---|
| Production (workflow published) | `https://akrxc12.app.n8n.cloud/webhook` |
| Testing ("Listen for test event" active in editor) | `https://akrxc12.app.n8n.cloud/webhook-test` |

If the webhook isn't registered (workflow unpublished, or test URL not listening), the API
returns **500 `GATEWAY_MISCONFIGURED`** and logs the reason. A wrong API key gives the same code.

### n8n callbacks → `/hooks/n8n`

1. In n8n, open the **Config** node and set `backendCallbackUrl` = `https://<backend>/hooks/n8n`.
   For failure alerts also set `callbackUrl` in **Build Failure Alert**.
2. Create the credential **Church Backend Callback Auth** (Custom Auth, templated) with
   header `X-Callback-Key: <N8N_CALLBACK_KEY>` and attach it to both **Notify Backend** nodes.
3. n8n Cloud cannot reach `localhost`; for local testing use a tunnel (`ngrok http 4000`).

---

## Security model

| Threat | Mitigation |
|---|---|
| n8n URL/key visible in browser DevTools | Only this server talks to n8n. The key lives in env. It is never in responses or logs, and redirects are refused so the key can't be forwarded |
| Session theft via XSS | JWT only in an `httpOnly` cookie (`__Host-` + `Secure` in prod), never in a JSON body or localStorage |
| CSRF | `SameSite=Lax` + strict CORS + **Origin check on every non-GET** + JSON-only bodies |
| Brute force | bcrypt cost 12, 5 failed logins / 15 min / IP, constant-time username compare |
| Logout not really logging out | token `jti` revoked server-side; open SSE streams for it are closed |
| Forged tokens | HS256 only, issuer/audience/subject checked; `alg:none` rejected |
| Spoofed `requested_by` | always taken from the session; client `requested_by`/`request_id` stripped |
| Mass assignment / injection into n8n | strict zod schemas (unknown fields → 400), no nested query parsing, length caps, control chars rejected |
| Forged callbacks | `X-Callback-Key` compared with `timingSafeEqual` on SHA-256 digests; strict body schema; 64 KB limit |
| Duplicate callbacks | de-duplicated by `Run_ID` / `execution_id` |
| Abuse / cost | 120 req/min/IP, 10 sends/min, one send in flight; public `/health` caches its n8n probe for 30 s so anonymous traffic can't burn n8n executions |
| Info leaks | public `/health` returns only `ok`/`unreachable`/…; errors are uniform JSON with no stack traces; `Cache-Control: no-store`; helmet with `default-src 'none'` |
| PII in logs | no headers or bodies are logged; phone numbers in URLs masked (`******3210`) |
| Double-start of a send run | `/send` is never retried; timeout → 502 `SEND_STATUS_UNKNOWN` ("check `/runs?date=` first") |

**Single instance.** SSE subscribers, callback de-duplication, token revocation and the
send lock are in memory. Run one replica. If you scale out, move them to Redis.

---

## Connecting the Next.js frontend

The frontend (`../app`) currently uses mock data in `app/lib/store.ts` and **hard-coded
credentials in `app/lib/auth.tsx`**, which ship to every visitor's browser. Replace both
with calls to this API.

**Recommended:** proxy through Next so the browser only ever sees same-origin `/api/*`,
and the cookie is first-party:

```ts
// next.config.ts
const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.BACKEND_URL}/:path*` }];
  },
};
```

Set `BACKEND_URL` server-side only (never `NEXT_PUBLIC_…`), `FRONTEND_ORIGIN` to the site's
origin, and `TRUST_PROXY=1` so rate limits see the real client IP. Then call
`fetch('/api/members', { credentials: 'include' })`.

Without a proxy, the frontend and backend must be on the **same site**, for example
`admin.church.org` and `api.church.org`, because `SameSite=Lax` cookies are not sent on
cross-site `fetch`.

---

## REST API

Full schema: [`openapi.yaml`](./openapi.yaml). All routes except `/health*`, `/auth/login`
and `/hooks/n8n` require the session cookie. Every response carries `X-Request-Id`.

n8n responses are passed through **unchanged** (status + body). Gateway errors:

| Status | `error.code` | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | our shape check failed (`details[]`) |
| 401 | `UNAUTHENTICATED` / `INVALID_CREDENTIALS` | |
| 403 | `FORBIDDEN_ORIGIN` | cross-origin state-changing request |
| 409 | `SEND_IN_PROGRESS` | another send is being submitted |
| 413 | `PAYLOAD_TOO_LARGE` | > 1 MB JSON / > 2 MB CSV |
| 429 | `RATE_LIMITED` | |
| 500 | `GATEWAY_MISCONFIGURED` | wrong API key or webhook not registered (see logs) |
| 502 | `N8N_UNAVAILABLE` / `N8N_BAD_RESPONSE` / `SEND_STATUS_UNKNOWN` | |

### curl examples

```bash
B=http://localhost:4000; J=cookies.txt

# auth
curl -c $J -H 'Content-Type: application/json' -d '{"username":"admin","password":"…"}' $B/auth/login
curl -b $J $B/auth/me
curl -b $J -X POST $B/auth/logout

# health (public)
curl $B/health            # {"backend":"ok","n8n":"ok"}
curl $B/health/live       # no n8n call; for container health checks

# members
curl -b $J "$B/members?q=mary&status=Active&issues_only=true&page=1&page_size=50"
curl -b $J $B/members/CH0012
curl -b $J -H 'Content-Type: application/json' \
  -d '{"member_id":"CH0101","full_name":"Mary Joseph","mobile_number":"9876543210","date_of_birth":"1992-01-05","whatsapp_enabled":"Yes","status":"Active"}' \
  $B/members                                   # upsert: creates, or updates if member_id exists
curl -b $J -X PATCH -H 'Content-Type: application/json' -d '{"remarks":"Moved to choir"}' $B/members/CH0101
curl -b $J -X POST $B/members/CH0101/deactivate   # no hard delete, by design
curl -b $J -H 'Content-Type: application/json' -d '{"records":[{"member_id":"CH0101","full_name":"Mary"}]}' $B/members/verify
curl -b $J -H 'Content-Type: application/json' -d '{"records":[…]}' $B/members/import
curl -b $J -F file=@members.csv $B/members/verify   # CSV dry run
curl -b $J -F file=@members.csv $B/members/import   # CSV commit (≤ 500 rows, ≤ 2 MB)

# birthdays
curl -b $J "$B/birthdays/preview?date=2026-10-03&member_ids=CH0012,CH0040"
curl -b $J -H 'Content-Type: application/json' -d '{"date":"2026-10-03","member_ids":["CH0012"],"force_resend":false}' $B/birthdays/send
#   → 202 {"success":true,"status":"ACCEPTED","execution_id":"4812",…}

# runs & messages
curl -b $J "$B/runs?date=2026-10-03&limit=20"
curl -b $J $B/runs/4812                    # poll until data.status != IN_PROGRESS_OR_NOT_FOUND
curl -b $J "$B/messages?date=2026-10-03&status=FAILED&limit=100"

# dashboard aggregate (partial data + errors[] if a source fails)
curl -b $J $B/dashboard

# live events (SSE)
curl -N -b $J $B/events

# n8n callback (what n8n sends)
curl -H "X-Callback-Key: $N8N_CALLBACK_KEY" -H 'Content-Type: application/json' \
  -d '{"event":"birthday_run.completed","run":{"Run_ID":"RUN-4812","Result":"COMPLETED"}}' $B/hooks/n8n
```

### CSV format

Headers are matched case-insensitively, ignoring spaces and underscores:
`Member_ID` (required), `Full_Name`/`Name`, `Mobile_Number`/`Mobile`/`Phone`,
`Date_of_Birth`/`DOB`, `WhatsApp_Enabled`/`WhatsApp`, `Status`, `Remarks`/`Notes`.
Other columns (e.g. `Created_At` from a Sheets export) are ignored. Empty cells are
**omitted** so an import never blanks existing values; use `PATCH` with `"remarks":""` to
clear a field. `yes/no/true/false/y/n/1/0` and `active/inactive` are normalised.

### SSE events

```
event: run.completed
data: {"run":{"run_id":"RUN-4812","execution_id":"4812","result":"COMPLETED","sent":3,…},"received_at":"…"}

event: workflow.failed
data: {"execution_id":"231","failed_node":"Read Members","error_message":"…","received_at":"…"}
```

Heartbeat comment every 25 s. Reconnects resume via `Last-Event-ID` (last 50 events
buffered). The stream closes when the session expires or the user logs out. Max 20
concurrent streams.

```js
const es = new EventSource('/api/events', { withCredentials: true });
es.addEventListener('run.completed', (e) => refresh(JSON.parse(e.data).run));
```

---

## Deployment

```bash
docker compose up -d --build
```

The image is multi-stage on `node:24-alpine`, runs as the non-root `node` user with
root-owned read-only code, uses `tini` for signals, and has a `/health/live` healthcheck. Compose
adds a read-only filesystem, drops all capabilities and binds to `127.0.0.1:4000`. Put a
TLS reverse proxy in front and set `TRUST_PROXY=1`.

Behind nginx, disable buffering for SSE (the app also sends `X-Accel-Buffering: no`) and
set `proxy_read_timeout` above 25 s.

Go-live checklist:

- [ ] `NODE_ENV=production`, https `FRONTEND_ORIGIN` and `N8N_WEBHOOK_BASE`
- [ ] strong admin password (≥ 12 chars), fresh `JWT_SECRET` and `N8N_CALLBACK_KEY`
- [ ] `N8N_API_KEY` matches the n8n credential; `curl /health` → `"n8n":"ok"`
- [ ] `backendCallbackUrl` + callback credential configured in n8n
- [ ] frontend's hard-coded credentials and mock store removed
- [ ] exactly one replica
