"use client";

import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, call, request, type Envelope } from "./api";
import { addDays, daysUntilBirthday, monthOf, todayISO } from "./dates";
import type {
  DashboardData,
  DashboardSourceError,
  ListMembers,
  Member,
  MemberBatch,
  MemberInput,
  MessageLog,
  Preview,
  RunHistory,
  SendAccepted,
} from "./types";

export const keys = {
  me: ["me"] as const,
  dashboard: ["dashboard"] as const,
  members: (p?: object) => (p ? (["members", p] as const) : (["members"] as const)),
  member: (id: string) => ["member", id] as const,
  upcoming: ["upcoming"] as const,
  preview: (p?: object) => (p ? (["preview", p] as const) : (["preview"] as const)),
  messages: (p?: object) => (p ? (["messages", p] as const) : (["messages"] as const)),
  runs: (p?: object) => (p ? (["runs", p] as const) : (["runs"] as const)),
  run: (id: string) => ["run", id] as const,
};

// ---------- auth ----------

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => (await request<{ data: { username: string } }>("/auth/me")).body.data,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: async (v: { username: string; password: string }) =>
      (await request<{ data: { username: string } }>("/auth/login", { method: "POST", json: v })).body.data,
  });
}

export async function logout() {
  await request("/auth/logout", { method: "POST" }).catch(() => undefined);
}

// ---------- reads ----------

export function useDashboard() {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: async () => (await request<{ data: DashboardData; errors: DashboardSourceError[] }>("/dashboard")).body,
    refetchInterval: 5 * 60_000,
  });
}

export interface MemberFilters {
  q?: string;
  status?: string;
  whatsapp_enabled?: string;
  issues_only?: boolean;
  birthday_month?: number;
  page?: number;
  page_size?: number;
}

export function useMembers(filters: MemberFilters, enabled = true) {
  return useQuery({
    queryKey: keys.members(filters),
    enabled,
    queryFn: ({ signal }) => call<ListMembers>("/members", { query: { ...filters, issues_only: filters.issues_only || undefined }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useMember(id: string) {
  return useQuery({
    queryKey: keys.member(id),
    queryFn: async () => (await call<{ member: Member }>(`/members/${encodeURIComponent(id)}`)).member,
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
  });
}

export interface Upcoming {
  member: Member;
  days: number;
  date: string;
}

/** Active members with a birthday in the next `days` days (excluding today). Two n8n calls at most. */
export function useUpcomingBirthdays(days = 14) {
  const t = todayISO();
  const months = [...new Set([monthOf(t), monthOf(addDays(t, days))])];
  const results = useQueries({
    queries: months.map((m) => ({
      queryKey: [...keys.upcoming, m],
      queryFn: () => call<ListMembers>("/members", { query: { birthday_month: m, status: "Active", page_size: 200 } }),
      staleTime: 10 * 60_000,
    })),
  });
  const loading = results.some((r) => r.isPending);
  const error = results.find((r) => r.error)?.error;
  const seen = new Set<string>();
  const list: Upcoming[] = [];
  for (const r of results) {
    for (const member of r.data?.members ?? []) {
      if (seen.has(member.member_id)) continue;
      seen.add(member.member_id);
      const d = daysUntilBirthday(member.date_of_birth, t);
      if (d !== null && d > 0 && d <= days) list.push({ member, days: d, date: addDays(t, d) });
    }
  }
  list.sort((a, b) => a.days - b.days || a.member.full_name.localeCompare(b.member.full_name));
  return { list, loading, error };
}

export function usePreview(date: string, enabled = true) {
  return useQuery({
    queryKey: keys.preview({ date }),
    queryFn: () => call<Preview>("/birthdays/preview", { query: { date } }),
    enabled,
  });
}

export function useMessages(params: { date: string; status?: string; member_id?: string; limit?: number }) {
  return useQuery({
    queryKey: keys.messages(params),
    queryFn: () => call<MessageLog>("/messages", { query: { limit: 1000, ...params } }),
    placeholderData: keepPreviousData,
  });
}

export function useRuns(params: { date?: string; limit?: number }) {
  return useQuery({
    queryKey: keys.runs(params),
    queryFn: () => call<RunHistory>("/runs", { query: { limit: 50, ...params } }),
    placeholderData: keepPreviousData,
  });
}

/** Polls a run every 4 s until n8n reports it finished. SSE invalidation makes it near-instant. */
export function useRun(executionId: string | undefined) {
  return useQuery({
    queryKey: keys.run(executionId ?? ""),
    queryFn: () => call<RunHistory>(`/runs/${encodeURIComponent(executionId!)}`),
    enabled: !!executionId,
    refetchInterval: (q) => (q.state.data && q.state.data.status !== "IN_PROGRESS_OR_NOT_FOUND" ? false : 4000),
  });
}

// ---------- writes ----------

function useInvalidateMembers() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.members() });
    void qc.invalidateQueries({ queryKey: keys.dashboard });
    void qc.invalidateQueries({ queryKey: keys.upcoming });
    void qc.invalidateQueries({ queryKey: keys.preview() });
  };
}

export class MemberExistsError extends Error {
  constructor(readonly memberId: string) {
    super(`Member ID ${memberId} already exists`);
  }
}

/** Creates a member. Checks the ID first, because the backend's POST is an upsert. */
export function useCreateMember() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: async (input: MemberInput) => {
      try {
        await call(`/members/${encodeURIComponent(input.member_id)}`);
        throw new MemberExistsError(input.member_id);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
      }
      return call<MemberBatch>("/members", { method: "POST", json: input });
    },
    onSuccess: invalidate,
  });
}

export function useUpdateMember(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (patch: Omit<MemberInput, "member_id">) =>
      call<MemberBatch>(`/members/${encodeURIComponent(id)}`, { method: "PATCH", json: patch }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.member(id) });
      invalidate();
    },
  });
}

export function useDeactivateMember(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: () => call<MemberBatch>(`/members/${encodeURIComponent(id)}/deactivate`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.member(id) });
      invalidate();
    },
  });
}

/** CSV verify (dry run) or import (commit). */
export function useCsvBatch(mode: "verify" | "import") {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return call<MemberBatch>(`/members/${mode}`, { method: "POST", form });
    },
    onSuccess: mode === "import" ? invalidate : undefined,
  });
}

export function useSend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { date?: string; member_ids?: string[]; force_resend?: boolean }) => {
      const { body, executionId } = await request<Envelope<SendAccepted>>("/birthdays/send", { method: "POST", json: v });
      return { ...body, execution_id: body.execution_id ?? executionId };
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.runs() });
    },
  });
}
