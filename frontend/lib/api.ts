/**
 * The only way the UI talks to the server: same-origin /api/*, which Next.js
 * rewrites to the backend. The backend holds every secret; nothing here does.
 */

export interface Envelope<T> {
  success: boolean;
  action?: string;
  status?: string;
  data?: T;
  error?: { code: string; message?: string; details?: unknown[] };
  request_id?: string;
  execution_id?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown[] = [],
    readonly body?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Row-level results n8n returns with a 422 from verify/upsert. */
  get batch(): import("./types").MemberBatch | undefined {
    const data = (this.body as Envelope<unknown> | undefined)?.data as import("./types").MemberBatch | undefined;
    return data && Array.isArray(data.rows) ? data : undefined;
  }
}

const FRIENDLY: Record<string, string> = {
  N8N_UNAVAILABLE: "The automation service isn't responding. Try again in a moment.",
  N8N_BAD_RESPONSE: "The automation service sent an unexpected reply. Try again.",
  GATEWAY_MISCONFIGURED: "The server is misconfigured. Ask the administrator to check the backend logs.",
  DEPENDENCY_UNAVAILABLE: "Google Sheets is unavailable right now. Try again shortly.",
  RATE_LIMITED: "Too many requests. Wait a minute and try again.",
  NETWORK: "Can't reach the server. Check your connection.",
};

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH";
  json?: unknown;
  form?: FormData;
  query?: Query;
  signal?: AbortSignal;
}

let onUnauthorized: (() => void) | undefined;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<{ body: T; executionId?: string; requestId?: string }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  const url = `/api${path}${qs.size ? `?${qs}` : ""}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.json !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.form ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined),
      credentials: "same-origin",
      cache: "no-store",
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK", FRIENDLY.NETWORK);
  }

  const requestId = res.headers.get("x-request-id") ?? undefined;
  const executionId = res.headers.get("x-execution-id") ?? undefined;
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  const env = body as Envelope<unknown> | undefined;
  if (!res.ok || env?.success === false) {
    if (res.status === 401 && !path.startsWith("/auth/login")) onUnauthorized?.();
    const code = env?.error?.code ?? `HTTP_${res.status}`;
    const message = FRIENDLY[code] ?? env?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, code, message, env?.error?.details ?? [], body, requestId);
  }
  return { body: body as T, executionId, requestId };
}

/** For n8n pass-through routes: returns `data` from the envelope. */
export async function call<T>(path: string, opts?: RequestOptions): Promise<T> {
  const { body } = await request<Envelope<T>>(path, opts);
  return body.data as T;
}

/** Human-readable lines from a validation error's details. */
export function detailLines(err: unknown): string[] {
  if (!(err instanceof ApiError)) return [];
  return err.details.map((d) => {
    if (typeof d === "string") return d;
    const o = d as { row?: number; path?: string; message?: string };
    return [o.row ? `Row ${o.row}` : "", o.path ? `${o.path}:` : "", o.message ?? ""].filter(Boolean).join(" ");
  });
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
