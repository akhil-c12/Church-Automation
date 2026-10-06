"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bot, CalendarDays, Hand, History, X } from "lucide-react";
import { useRun, useRuns } from "@/lib/queries";
import { formatDay, formatStamp, formatTime, isISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Run } from "@/lib/types";
import { Card, EmptyState, ErrorState, Meta, PageHeader, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { RunResult } from "@/components/ui/status";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export default function RunsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Automation"
        title="Run history"
        description="Each time the workflow runs — on schedule or when you press send — it leaves a summary here, traceable by its n8n execution number."
      />
      <Suspense>
        <Runs />
      </Suspense>
    </>
  );
}

function duration(r: Run): string {
  const a = r.started_at?.match(/(\d{2}):(\d{2}):(\d{2})/);
  const b = r.finished_at?.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (!a || !b) return "";
  const s = (m: RegExpMatchArray) => Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  const d = s(b) - s(a);
  return d >= 0 ? (d < 60 ? `${d}s` : `${Math.floor(d / 60)}m ${d % 60}s`) : "";
}

function Runs() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("date");
  const date = isISODate(raw) ? raw : undefined;
  const openId = params.get("id") ?? undefined;
  const runs = useRuns({ date });

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  const list = runs.data?.runs ?? [];
  const byDay = list.reduce<Record<string, Run[]>>((acc, r) => {
    (acc[r.target_date] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 animate-rise [animation-delay:60ms]">
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <Input type="date" value={date ?? ""} onChange={(e) => set({ date: e.target.value || undefined })} className="w-44 pl-9" aria-label="Filter by date" />
        </div>
        {date && (
          <Button variant="ghost" size="sm" onClick={() => set({ date: undefined })}>
            <X /> All dates
          </Button>
        )}
      </div>

      {runs.isError ? (
        <ErrorState error={runs.error} onRetry={() => runs.refetch()} />
      ) : runs.isPending ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={<History />} title={date ? "No runs on this date" : "No runs yet"}>
            Runs appear after the 9:00 and 13:00 schedules, or after a manual send.
          </EmptyState>
        </Card>
      ) : (
        Object.entries(byDay).map(([day, items], gi) => (
          <section key={day} className="animate-rise" style={{ animationDelay: `${80 + gi * 40}ms` }}>
            <h2 className="mb-2.5 flex items-baseline gap-2 px-1">
              <span className="font-display text-lg text-ink">{formatDay(day, { weekday: "long", day: "numeric", month: "long" })}</span>
            </h2>
            <Card className="divide-y divide-line overflow-hidden">
              {items.map((r) => (
                <button key={r.run_id} onClick={() => set({ id: r.execution_id })} className="flex w-full cursor-pointer flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 text-left transition-colors hover:bg-paper-2/40">
                  <span className={cn("flex size-9 items-center justify-center rounded-full", r.trigger_source === "SCHEDULE" ? "bg-paper-2 text-ink-3" : "bg-primary-soft text-primary")}>
                    {r.trigger_source === "SCHEDULE" ? <Bot className="size-4" /> : <Hand className="size-4" />}
                  </span>
                  <span className="min-w-36">
                    <span className="block text-sm font-medium text-ink">{r.trigger_source === "SCHEDULE" ? "Scheduled run" : `Sent by ${r.requested_by}`}</span>
                    <span className="block text-xs text-ink-3">
                      {formatTime(r.started_at)}
                      {duration(r) && ` · took ${duration(r)}`}
                    </span>
                  </span>
                  <span className="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3">
                    <Count n={r.sent} label="sent" tone="text-ok" />
                    <Count n={r.failed} label="failed" tone="text-bad" />
                    <Count n={r.needs_review} label="review" tone="text-warn" />
                    <Count n={r.skipped} label="skipped" />
                  </span>
                  <span className="flex items-center gap-3">
                    <RunResult result={r.result} />
                    <span className="hidden font-mono text-xs text-ink-3 sm:inline">#{r.execution_id}</span>
                  </span>
                </button>
              ))}
            </Card>
          </section>
        ))
      )}

      <RunSheet id={openId} onClose={() => set({ id: undefined })} />
    </div>
  );
}

function Count({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <span>
      <span className={cn("num font-medium", n && tone ? tone : "text-ink")}>{n}</span> {label}
    </span>
  );
}

function RunSheet({ id, onClose }: { id?: string; onClose: () => void }) {
  const run = useRun(id);
  const r = run.data?.runs[0];
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent side="right" title={id ? `Run #${id}` : "Run"} description={r ? formatStamp(r.started_at) : undefined}>
        {run.isPending ? (
          <div className="space-y-3">
            <Skeleton className="w-32" />
            <Skeleton className="h-40" />
          </div>
        ) : run.isError ? (
          <ErrorState error={run.error} />
        ) : !r ? (
          <div className="flex items-center gap-3 rounded-xl bg-marigold-soft px-4 py-3 text-sm text-ink-2">
            <span className="size-2 animate-ping rounded-full bg-marigold" /> Still running — this updates automatically.
          </div>
        ) : (
          <div className="space-y-6">
            <RunResult result={r.result} />
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["Sent", r.sent, "text-ok"],
                  ["Failed", r.failed, "text-bad"],
                  ["Review", r.needs_review, "text-warn"],
                ] as const
              ).map(([l, n, tone]) => (
                <div key={l} className="rounded-xl border border-line px-3 py-3">
                  <p className={cn("font-display text-3xl num", n ? tone : "text-ink-3")}>{n}</p>
                  <p className="text-xs text-ink-3">{l}</p>
                </div>
              ))}
            </div>
            <dl className="divide-y divide-line">
              <Meta label="Birthday date">{formatDay(r.target_date, { day: "numeric", month: "long", year: "numeric" })}</Meta>
              <Meta label="Trigger">{r.trigger_source === "SCHEDULE" ? "Schedule" : "Manual"}</Meta>
              <Meta label="Requested by">{r.requested_by}</Meta>
              <Meta label="Birthdays">{r.birthdays}</Meta>
              <Meta label="Attempted">{r.attempted}</Meta>
              <Meta label="Unknown outcome">{r.unknown}</Meta>
              <Meta label="Skipped">{r.skipped}</Meta>
              <Meta label="Invalid data">{r.invalid}</Meta>
              <Meta label="Deferred">{r.deferred}</Meta>
              <Meta label="Started">{formatStamp(r.started_at)}</Meta>
              <Meta label="Finished">{formatStamp(r.finished_at)}</Meta>
              <Meta label="Execution" mono>
                #{r.execution_id}
              </Meta>
              <Meta label="Request" mono>
                <span className="block max-w-48 truncate">{r.request_id}</span>
              </Meta>
            </dl>
            <div className="flex gap-2">
              <Button asChild variant="secondary" className="flex-1">
                <Link href={`/messages?date=${r.target_date}`}>Messages</Link>
              </Button>
              {(r.needs_review > 0 || r.failed > 0) && (
                <Button asChild className="flex-1">
                  <Link href={`/send?date=${r.target_date}`}>Review &amp; retry</Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
