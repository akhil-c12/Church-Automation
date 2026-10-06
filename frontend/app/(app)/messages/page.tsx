"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, Send } from "lucide-react";
import { useMessages } from "@/lib/queries";
import { formatTime, isISODate, todayISO } from "@/lib/dates";
import { cn, formatPhone } from "@/lib/utils";
import type { LogRow, MessageStatus as MS } from "@/lib/types";
import { Avatar, Card, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Segmented, Tip } from "@/components/ui/primitives";
import { MessageStatus, messageTone } from "@/components/ui/status";
import { DayStepper } from "@/components/app/date-filter";

const STATUSES: MS[] = ["SENT", "FAILED", "UNKNOWN", "REVIEW", "PENDING", "DEFERRED", "SKIPPED", "INVALID"];

export default function MessagesPage() {
  return (
    <>
      <PageHeader eyebrow="Audit trail" title="Message log" description="Every greeting attempt, with WhatsApp's response. Use it to see exactly who got what, and why." />
      <Suspense>
        <MessageLog />
      </Suspense>
    </>
  );
}

function MessageLog() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("date");
  const date = isISODate(raw) ? raw : todayISO();
  const status = params.get("status") ?? "all";
  const log = useMessages({ date, status: status === "all" ? undefined : status });

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  const counts = log.data?.counts ?? {};
  const total = Object.values(counts).reduce((a, n) => a + (n ?? 0), 0);
  const present = STATUSES.filter((s) => counts[s]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 animate-rise [animation-delay:60ms]">
        <DayStepper value={date} onChange={(d) => set({ date: d, status: undefined })} />
        {present.length > 0 && (
          <Segmented
            aria-label="Status"
            value={status}
            onValueChange={(v) => set({ status: v === "all" ? undefined : v })}
            options={[{ value: "all", label: "All", count: total }, ...present.map((s) => ({ value: s, label: messageTone(s)[1], count: counts[s] }))]}
            className="max-w-full overflow-x-auto"
          />
        )}
      </div>

      {log.isError ? (
        <ErrorState error={log.error} onRetry={() => log.refetch()} />
      ) : (
        <Card className={cn("overflow-hidden animate-rise [animation-delay:100ms] transition-opacity", log.isPlaceholderData && "opacity-60")}>
          {log.isPending ? (
            <div className="divide-y divide-line">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <Skeleton className="size-7 rounded-full" />
                  <Skeleton className="w-40" />
                  <Skeleton className="ml-auto w-20" />
                </div>
              ))}
            </div>
          ) : !log.data || log.data.messages.length === 0 ? (
            <EmptyState
              icon={<MessageCircle />}
              title={status === "all" ? "No messages for this day" : "Nothing with this status"}
              action={
                date === todayISO() && status === "all" ? (
                  <Button asChild variant="secondary">
                    <Link href="/send">
                      <Send /> Send today&apos;s wishes
                    </Link>
                  </Button>
                ) : undefined
              }
            >
              Messages appear here as soon as the automation claims them.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {log.data.messages.map((m) => (
                <LogItem key={m.log_id} m={m} />
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function LogItem({ m }: { m: LogRow }) {
  const problem = m.status === "FAILED" || m.status === "UNKNOWN" || m.status === "REVIEW";
  const detail = m.error || m.reason || "—";
  const meta = (
    <>
      {m.trigger_source === "SCHEDULE" ? "Scheduled" : `Manual · ${m.requested_by}`}
      {m.attempt > 1 && ` · attempt ${m.attempt}`}
      {m.error_code && <span className="font-mono"> · code {m.error_code}</span>}
    </>
  );
  return (
    <li className="flex items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-paper-2/30">
      <Avatar name={m.member_name || m.member_id} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1 sm:flex sm:items-start sm:gap-6">
        <div className="min-w-0 sm:w-[38%] sm:shrink-0">
          <Link href={`/members/${encodeURIComponent(m.member_id)}`} className="block truncate font-medium text-ink hover:underline hover:underline-offset-4">
            {m.member_name || m.member_id}
          </Link>
          <p className="truncate font-mono text-xs text-ink-3">
            {m.member_id} · {formatPhone(m.mobile_number)}
          </p>
        </div>
        <div className="mt-1 min-w-0 flex-1 text-[13px] sm:mt-0">
          <p className={cn("truncate", problem ? "text-ink" : "text-ink-2")}>{detail}</p>
          <p className="truncate text-xs text-ink-3">{meta}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <MessageStatus status={m.status} />
        <span className="flex items-center gap-2 text-xs text-ink-3">
          {formatTime(m.completed_at || m.claimed_at)}
          {m.execution_id && (
            <Tip content="Open this run">
              <Link href={`/runs?id=${encodeURIComponent(m.execution_id)}`} className="font-mono hover:text-ink">
                #{m.execution_id}
              </Link>
            </Tip>
          )}
        </span>
      </div>
    </li>
  );
}
