/**
 * Local stand-in for the n8n workflow, implementing the contract in CLAUDE.md
 * with in-memory data. For development and demos only — nothing is sent anywhere.
 *
 *   MOCK_N8N_API_KEY=... MOCK_N8N_CALLBACK_URL=http://127.0.0.1:4000/hooks/n8n \
 *   MOCK_N8N_CALLBACK_KEY=... npm run mock:n8n
 *
 * Then point the backend at it: N8N_WEBHOOK_BASE=http://127.0.0.1:5678/webhook
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const PORT = Number(process.env.MOCK_N8N_PORT ?? 5678);
const API_KEY = process.env.MOCK_N8N_API_KEY ?? 'dev-n8n-api-key-change-me';
const CALLBACK_URL = process.env.MOCK_N8N_CALLBACK_URL ?? '';
const CALLBACK_KEY = process.env.MOCK_N8N_CALLBACK_KEY ?? '';
const CHURCH = process.env.MOCK_CHURCH_NAME ?? 'St. Thomas Church';
const TZ = 'Asia/Kolkata';

// ---------- time helpers (IST) ----------
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const istNow = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .format(new Date())
    .replace('T', ' ');
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const today = () => ymd(new Date());
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// ---------- data ----------
interface Row {
  member_id: string;
  full_name: string;
  mobile_number: string;
  date_of_birth: string;
  whatsapp_enabled: string;
  status: string;
  remarks: string;
  created_at: string;
  updated_at: string;
  last_birthday_sent: string;
  last_message_status: string;
  last_error: string;
}

const NAMES = [
  'Mary Joseph', 'John David', 'Sarah Thomas', 'Peter Paul', 'Grace Samuel', 'Abraham Isaac', 'Ruth Daniel', 'Joel Mathew',
  'Esther Varghese', 'Samuel George', 'Rebecca John', 'Daniel Raj', 'Hannah Philip', 'Stephen Jacob', 'Lydia Chacko', 'Timothy Kurian',
  'Martha Abraham', 'Andrew Simon', 'Priscilla Mani', 'Benjamin Cherian', 'Naomi Joseph', 'Joshua Thomas', 'Deborah Kuruvilla',
  'Elijah Mathai', 'Miriam Jose', 'Caleb Varkey', 'Susanna Ninan', 'Nathaniel Oommen', 'Tabitha George', 'Silas Eapen',
  'Anna Koshy', 'Gideon Pothen', 'Leah Zachariah', 'Jonah Alexander', 'Phoebe Mammen', 'Micah Jacob',
];

function seedMembers(): Map<string, Row> {
  const t = today();
  const [, mm, dd] = t.split('-');
  const map = new Map<string, Row>();
  NAMES.forEach((name, i) => {
    const id = `CH${String(i + 1).padStart(4, '0')}`;
    let dob: string;
    if (i < 4) dob = `${1960 + i * 9}-${mm}-${dd}`; // birthdays today
    else if (i < 10) dob = `${1975 + i}-${addDays(t, (i - 3) * 2).slice(5)}`; // upcoming
    else dob = `${1950 + ((i * 7) % 55)}-${String(((i * 5) % 12) + 1).padStart(2, '0')}-${String(((i * 11) % 28) + 1).padStart(2, '0')}`;
    map.set(id, {
      member_id: id,
      full_name: name,
      mobile_number: `98${String(76543210 + i * 1379).padStart(8, '0')}`,
      date_of_birth: dob,
      whatsapp_enabled: i === 3 || i === 17 ? 'No' : 'Yes',
      status: i === 22 || i === 30 ? 'Inactive' : 'Active',
      remarks: i === 3 ? 'Prefers a phone call' : i === 22 ? 'Moved to Bangalore' : '',
      created_at: '2025-01-12 10:00:00',
      updated_at: '2026-09-01 18:20:00',
      last_birthday_sent: '',
      last_message_status: '',
      last_error: '',
    });
  });
  // Data issues to show off validation.
  map.get('CH0012')!.mobile_number = '98765';
  map.get('CH0026')!.date_of_birth = '';
  map.get('CH0002')!.mobile_number = '9876543210';
  return map;
}

const members = seedMembers();

interface Log {
  log_id: string; member_id: string; member_name: string; mobile_number: string; birthday_date: string; attempt: number;
  status: string; reason: string; wa_message_id: string; http_status: number | string; error_code: string; error: string;
  trigger_source: string; requested_by: string; claimed_at: string; completed_at: string; execution_id: string;
}
interface Run {
  run_id: string; execution_id: string; request_id: string; trigger_source: string; requested_by: string; target_date: string;
  started_at: string; finished_at: string; birthdays: number; attempted: number; sent: number; failed: number; unknown: number;
  skipped: number; invalid: number; needs_review: number; deferred: number; data_issues: number; result: string;
}
const logs: Log[] = [];
const runs: Run[] = [];
const inProgress = new Set<string>();
let execSeq = 4800;

// ---------- member logic ----------
const digits = (s: string) => s.replace(/\D/g, '');
function normalize(m: string) {
  const d = digits(m);
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith('91')) return d;
  return '';
}
function issuesOf(r: Row): string[] {
  const out: string[] = [];
  if (!r.full_name.trim()) out.push('Missing name');
  if (!normalize(r.mobile_number)) out.push('Invalid mobile number');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date_of_birth)) out.push('Missing or invalid date of birth');
  return out;
}
function view(r: Row) {
  const data_issues = issuesOf(r);
  return {
    ...r,
    normalized_mobile: normalize(r.mobile_number),
    data_issues,
    eligible_for_whatsapp: r.status === 'Active' && r.whatsapp_enabled === 'Yes' && data_issues.length === 0,
  };
}
function birthdayOn(r: Row, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date_of_birth)) return false;
  const md = r.date_of_birth.slice(5);
  const target = date.slice(5);
  if (md === target) return true;
  // Feb 29 birthdays are celebrated on Feb 28 in non-leap years.
  return md === '02-29' && target === '02-28' && !isLeap(Number(date.slice(0, 4)));
}

type Result = { status: number; body: Record<string, unknown> };
const ok = (action: string, data: unknown, status = 200): Result => ({ status, body: { success: true, action, data } });
const fail = (action: string, status: number, code: string, message: string, details: unknown[] = [], data?: unknown): Result => ({
  status,
  body: { success: false, action, error: { code, message, details }, ...(data ? { data } : {}) },
});

function validateRecords(records: Record<string, string>[]) {
  const phoneOwners = new Map<string, string>();
  for (const m of members.values()) phoneOwners.set(normalize(m.mobile_number), m.member_id);
  const rows = records.map((rec, i) => {
    const existing = members.get(String(rec.member_id));
    const merged = { ...(existing ?? {}), ...rec } as Row;
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!existing) {
      if (!rec.full_name) errors.push('full_name is required for new members');
      if (!rec.mobile_number) errors.push('mobile_number is required for new members');
      if (!rec.date_of_birth) errors.push('date_of_birth is required for new members');
    }
    if (rec.mobile_number && !normalize(rec.mobile_number)) errors.push('mobile_number must be a 10-digit Indian number');
    if (rec.date_of_birth) {
      const d = new Date(`${rec.date_of_birth}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.date_of_birth) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== rec.date_of_birth) {
        errors.push('date_of_birth must be a real date in yyyy-MM-dd');
      } else if (rec.date_of_birth > today()) errors.push('date_of_birth cannot be in the future');
    }
    if (rec.full_name && rec.full_name.length < 2) errors.push('full_name is too short');
    const owner = rec.mobile_number ? phoneOwners.get(normalize(rec.mobile_number)) : undefined;
    if (owner && owner !== rec.member_id) warnings.push(`Mobile number is shared with ${owner} (allowed for families)`);
    const changed = !existing || (Object.keys(rec) as (keyof Row)[]).some((k) => k !== 'member_id' && existing[k] !== rec[k]);
    return {
      row: i + 1,
      member_id: String(rec.member_id),
      operation: existing ? 'UPDATE' : 'ADD',
      validation_status: errors.length ? 'INVALID' : changed ? 'VALID' : 'UNCHANGED',
      errors,
      warnings,
      _merged: merged,
    };
  });
  const summary = {
    total: rows.length,
    add: rows.filter((r) => r.operation === 'ADD' && r.validation_status === 'VALID').length,
    update: rows.filter((r) => r.operation === 'UPDATE' && r.validation_status === 'VALID').length,
    unchanged: rows.filter((r) => r.validation_status === 'UNCHANGED').length,
    invalid: rows.filter((r) => r.validation_status === 'INVALID').length,
  };
  return { rows, summary };
}

function decide(date: string, memberIds?: string[], force = false) {
  const targets = memberIds?.length
    ? memberIds.map((id) => members.get(id) ?? ({ member_id: id } as Row))
    : [...members.values()].filter((m) => m.status === 'Active' && birthdayOn(m, date));
  return targets.map((m) => {
    const base = {
      member_id: m.member_id,
      full_name: m.full_name ?? '',
      mobile_number: m.mobile_number ?? '',
      date_of_birth: m.date_of_birth ?? '',
      attempt: 0,
      message_preview: m.full_name ? `Dear ${m.full_name}, wishing you a joyful and blessed birthday! With love, ${CHURCH}.` : '',
    };
    if (!members.has(m.member_id)) return { ...base, decision: 'NOT_FOUND', reason: 'No member with this ID' };
    const mine = logs.filter((l) => l.member_id === m.member_id && l.birthday_date === date);
    const attempt = mine.length;
    const last = mine.at(-1);
    if (mine.some((l) => l.status === 'SENT')) return { ...base, attempt, decision: 'SKIPPED', reason: 'Already sent for this date' };
    if (m.status !== 'Active') return { ...base, attempt, decision: 'SKIPPED', reason: 'Member is inactive' };
    if (!birthdayOn(m, date) && !memberIds?.length) return { ...base, attempt, decision: 'SKIPPED', reason: 'Not a birthday on this date' };
    if (m.whatsapp_enabled !== 'Yes') return { ...base, attempt, decision: 'SKIPPED', reason: 'WhatsApp disabled for this member' };
    const issues = issuesOf(m);
    if (issues.length) return { ...base, attempt, decision: 'INVALID', reason: issues.join('; ') };
    if (!force && last && (last.status === 'UNKNOWN' || last.status === 'REVIEW'))
      return { ...base, attempt, decision: 'REVIEW', reason: 'Previous attempt outcome unknown — check, then force resend' };
    if (!force && attempt >= 3) return { ...base, attempt, decision: 'REVIEW', reason: 'Maximum attempts reached' };
    return { ...base, attempt: attempt + 1, decision: 'SEND', reason: last?.status === 'FAILED' ? 'Retrying after failure' : 'Birthday today' };
  });
}

function countBy<T>(items: T[], key: (t: T) => string) {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
}

function performRun(opts: { executionId: string; requestId: string; trigger: string; requestedBy: string; date: string; memberIds?: string[]; force?: boolean }) {
  const started = istNow();
  const decisions = decide(opts.date, opts.memberIds, opts.force);
  let sent = 0, failed = 0, unknown = 0;
  for (const d of decisions) {
    const roll = (Number(digits(d.member_id)) * 7 + Date.now()) % 20;
    let status = d.decision === 'SEND' ? (roll === 0 ? 'UNKNOWN' : roll < 3 ? 'FAILED' : 'SENT') : d.decision;
    if (d.decision === 'NOT_FOUND') continue;
    if (status === 'SENT') sent++;
    if (status === 'FAILED') failed++;
    if (status === 'UNKNOWN') unknown++;
    const m = members.get(d.member_id);
    logs.push({
      log_id: `LOG-${randomUUID().slice(0, 8)}`,
      member_id: d.member_id,
      member_name: d.full_name,
      mobile_number: d.mobile_number,
      birthday_date: opts.date,
      attempt: d.attempt,
      status,
      reason: status === 'FAILED' ? 'WhatsApp API rejected the message' : status === 'UNKNOWN' ? 'Timed out waiting for WhatsApp' : d.reason,
      wa_message_id: status === 'SENT' ? `wamid.${randomUUID().replace(/-/g, '').slice(0, 24)}` : '',
      http_status: status === 'SENT' ? 200 : status === 'FAILED' ? 400 : '',
      error_code: status === 'FAILED' ? '131026' : '',
      error: status === 'FAILED' ? 'Message undeliverable' : '',
      trigger_source: opts.trigger,
      requested_by: opts.requestedBy,
      claimed_at: started,
      completed_at: istNow(),
      execution_id: opts.executionId,
    });
    if (m && d.decision === 'SEND') {
      m.last_message_status = status;
      if (status === 'SENT') m.last_birthday_sent = opts.date;
      m.last_error = status === 'FAILED' ? 'Message undeliverable' : '';
    }
  }
  const c = countBy(decisions, (d) => d.decision);
  const run: Run = {
    run_id: `RUN-${opts.executionId}`,
    execution_id: opts.executionId,
    request_id: opts.requestId,
    trigger_source: opts.trigger,
    requested_by: opts.requestedBy,
    target_date: opts.date,
    started_at: started,
    finished_at: istNow(),
    birthdays: decisions.length,
    attempted: c.SEND ?? 0,
    sent,
    failed,
    unknown,
    skipped: c.SKIPPED ?? 0,
    invalid: c.INVALID ?? 0,
    needs_review: (c.REVIEW ?? 0) + unknown,
    deferred: 0,
    data_issues: [...members.values()].filter((m) => issuesOf(m).length).length,
    result: decisions.length === 0 ? 'NO_BIRTHDAYS' : failed ? 'COMPLETED_WITH_FAILURES' : unknown || c.REVIEW ? 'COMPLETED_NEEDS_ATTENTION' : 'COMPLETED',
  };
  runs.unshift(run);
  return run;
}

async function callback(run: Run) {
  if (!CALLBACK_URL) return;
  const pascal = Object.fromEntries(
    Object.entries(run).map(([k, v]) => [k === 'execution_id' ? 'Workflow_Execution_ID' : k.split('_').map((p) => (p === 'id' ? 'ID' : p[0]!.toUpperCase() + p.slice(1))).join('_'), v]),
  );
  try {
    const res = await fetch(CALLBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Callback-Key': CALLBACK_KEY },
      body: JSON.stringify({ event: 'birthday_run.completed', run: pascal }),
    });
    console.log(`[mock-n8n] callback -> ${res.status}`);
  } catch (err) {
    console.log(`[mock-n8n] callback failed: ${(err as Error).message}`);
  }
}

// Seed history: yesterday's and this morning's scheduled runs.
for (const [offset, hour] of [[-2, '09'], [-1, '09'], [0, '09']] as const) {
  const date = addDays(today(), offset);
  const r = performRun({ executionId: String(++execSeq), requestId: `sched-${execSeq}`, trigger: 'SCHEDULE', requestedBy: 'system', date });
  r.started_at = `${date} ${hour}:00:02`;
  r.finished_at = `${date} ${hour}:00:41`;
}
// Leave one of today's birthdays un-sent so the UI has something to send.
{
  const t = today();
  const idx = logs.findIndex((l) => l.birthday_date === t && l.member_id === 'CH0003');
  if (idx >= 0) logs.splice(idx, 1);
  const m = members.get('CH0003');
  if (m) { m.last_birthday_sent = ''; m.last_message_status = ''; }
}

// ---------- handlers ----------
function api(action: string, data: Record<string, unknown>): Result {
  switch (action) {
    case 'health':
      return ok('health', { status: 'ok', service: 'church-birthday', workflow_id: 'mock', time_ist: istNow() });
    case 'list_members': {
      let list = [...members.values()];
      const q = String(data.q ?? '').toLowerCase();
      if (q) list = list.filter((m) => m.full_name.toLowerCase().includes(q) || m.member_id.toLowerCase().includes(q) || m.mobile_number.includes(q));
      if (data.status) list = list.filter((m) => m.status === data.status);
      if (data.whatsapp_enabled) list = list.filter((m) => m.whatsapp_enabled === data.whatsapp_enabled);
      if (data.issues_only) list = list.filter((m) => issuesOf(m).length > 0);
      if (data.birthday_month) list = list.filter((m) => Number(m.date_of_birth.slice(5, 7)) === Number(data.birthday_month));
      list.sort((a, b) => a.full_name.localeCompare(b.full_name));
      const page = Number(data.page ?? 1);
      const size = Math.min(Number(data.page_size ?? 50), 200);
      const all = [...members.values()];
      return ok('list_members', {
        members: list.slice((page - 1) * size, page * size).map(view),
        pagination: { page, page_size: size, total: list.length, total_pages: Math.max(1, Math.ceil(list.length / size)) },
        totals: { all_members: all.length, with_data_issues: all.filter((m) => issuesOf(m).length).length },
      });
    }
    case 'get_member': {
      const m = data.member_id
        ? members.get(String(data.member_id))
        : [...members.values()].find((x) => normalize(x.mobile_number) === normalize(String(data.mobile_number ?? '')));
      return m ? ok('get_member', { member: view(m) }) : fail('get_member', 404, 'MEMBER_NOT_FOUND', 'Member not found');
    }
    case 'verify_members':
    case 'upsert_members': {
      const records = (data.records ?? []) as Record<string, string>[];
      if (!records.length || records.length > 500) return fail(action, 400, 'VALIDATION_ERROR', 'records must have 1-500 items');
      const { rows, summary } = validateRecords(records);
      const publicRows = rows.map(({ _merged, ...r }) => r);
      if (summary.invalid) return fail(action, 422, 'VALIDATION_ERROR', `${summary.invalid} invalid row(s); nothing was written`, [], { committed: false, summary, rows: publicRows });
      if (action === 'upsert_members') {
        for (const r of rows) {
          if (r.validation_status !== 'VALID') continue;
          const defaults = {
            whatsapp_enabled: 'Yes', status: 'Active', remarks: '', created_at: istNow(), last_birthday_sent: '', last_message_status: '', last_error: '',
          };
          members.set(r.member_id, { ...defaults, ...r._merged, updated_at: istNow() } as Row);
        }
      }
      return ok(action, { committed: action === 'upsert_members', summary, rows: publicRows });
    }
    case 'preview_send': {
      const date = String(data.date ?? today());
      const decisions = decide(date, data.member_ids as string[] | undefined);
      return ok('preview_send', {
        target_date: date,
        birthdays: decisions.filter((d) => d.decision !== 'NOT_FOUND').length,
        would_send: decisions.filter((d) => d.decision === 'SEND').length,
        counts: countBy(decisions, (d) => d.decision),
        members: decisions,
      });
    }
    case 'message_log': {
      const date = String(data.date ?? today());
      let rows = logs.filter((l) => l.birthday_date === date);
      const counts = countBy(rows, (l) => l.status);
      if (data.status) rows = rows.filter((l) => l.status === data.status);
      if (data.member_id) rows = rows.filter((l) => l.member_id === data.member_id);
      const total = rows.length;
      rows = rows.slice(-Number(data.limit ?? 200)).reverse();
      return ok('message_log', { date, counts, returned: rows.length, total, messages: rows });
    }
    case 'run_history': {
      if (data.execution_id && inProgress.has(String(data.execution_id))) return ok('run_history', { found: false, status: 'IN_PROGRESS_OR_NOT_FOUND', runs: [] });
      let list = runs;
      if (data.execution_id) list = list.filter((r) => r.execution_id === String(data.execution_id));
      if (data.request_id) list = list.filter((r) => r.request_id === String(data.request_id));
      if (data.date) list = list.filter((r) => r.target_date === String(data.date));
      list = list.slice(0, Number(data.limit ?? 50));
      return ok('run_history', { found: list.length > 0, status: list.length ? 'FOUND' : 'IN_PROGRESS_OR_NOT_FOUND', runs: list });
    }
    default:
      return fail(action, 400, 'UNKNOWN_ACTION', `Unknown action: ${action}`);
  }
}

function send(body: Record<string, unknown>): Result {
  const date = String(body.date ?? today());
  const errors: string[] = [];
  if (date > today()) errors.push('date cannot be in the future');
  if (date < addDays(today(), -30)) errors.push('date can be at most 30 days back');
  const ids = body.member_ids as string[] | undefined;
  if (body.force_resend && !ids?.length) errors.push('force_resend requires member_ids');
  if (errors.length) return { status: 400, body: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid send request', details: errors } } };
  const executionId = String(++execSeq);
  inProgress.add(executionId);
  setTimeout(() => {
    const run = performRun({
      executionId, requestId: String(body.request_id), trigger: 'MANUAL', requestedBy: String(body.requested_by), date, memberIds: ids, force: Boolean(body.force_resend),
    });
    inProgress.delete(executionId);
    void callback(run);
  }, 3500);
  return {
    status: 202,
    body: {
      success: true, status: 'ACCEPTED', execution_id: executionId, request_id: body.request_id,
      data: { target_date: date, scope: ids?.length ? 'SELECTED_MEMBERS' : 'ALL_BIRTHDAYS', member_ids: ids ?? [], force_resend: Boolean(body.force_resend), requested_by: body.requested_by },
    },
  };
}

// ---------- server ----------
http
  .createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const reply = (status: number, body: unknown, exec?: string) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...(exec ? { 'X-Execution-Id': exec } : {}) });
        res.end(JSON.stringify(body));
      };
      const path = req.url ?? '';
      if (req.method !== 'POST' || !/^\/webhook(-test)?\/church-birthday\/v1\/(api|send)$/.test(path)) {
        return reply(404, { code: 404, message: `The requested webhook "${req.method} ${path}" is not registered.` });
      }
      if (req.headers['x-api-key'] !== API_KEY) return reply(403, { message: 'Authorization data is wrong!' });
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        return reply(400, { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON' } });
      }
      // Simulate n8n + Sheets latency.
      setTimeout(() => {
        const exec = String(++execSeq);
        const r = path.endsWith('/send') ? send(body) : api(String(body.action), (body.data ?? {}) as Record<string, unknown>);
        const execId = (r.body.execution_id as string | undefined) ?? exec;
        reply(r.status, { ...r.body, request_id: body.request_id, execution_id: execId }, execId);
      }, 120 + Math.random() * 180);
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`[mock-n8n] listening on http://127.0.0.1:${PORT}/webhook (today IST: ${today()})`));
