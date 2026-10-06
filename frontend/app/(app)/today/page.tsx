"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Cake, CircleAlert, History, Send, Sparkles } from "lucide-react";
import { useDashboard, useMe, useUpcomingBirthdays } from "@/lib/queries";
import { formatDay, formatStamp, greeting, todayISO, turningAge } from "@/lib/dates";
import { cn, plural } from "@/lib/utils";
import type { DashboardData, MessageStatus as MS } from "@/lib/types";
import { Card, CardHeader, EmptyState, ErrorState, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { RunResult, messageTone } from "@/components/ui/status";
import { BirthdayRow } from "@/components/app/birthday-row";
import { SendDialog } from "@/components/app/send-flow";

export default function TodayPage() {
  const me = useMe();
  const dash = useDashboard();
  const [sendOpen, setSendOpen] = useState(false);
  const t = todayISO();
  const data = dash.data?.data;
  const today = data?.today;
  const pending = today?.members.filter((m) => m.decision === "SEND") ?? [];
  const [weekday, ...rest] = formatDay(t, { weekday: "long", day: "numeric", month: "long" }).split(" ");

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-6 animate-rise">
        <div>
          <p className="eyebrow mb-2">
            {greeting()}
            {me.data ? `, ${me.data.username}` : ""}
          </p>
          <h1 className="font-display text-[2.6rem] leading-[1.05] font-light text-ink sm:text-5xl">
            {weekday?.replace(",", "")}, <span className="font-normal">{rest.join(" ")}</span>
          </h1>
          <p className="mt-3 text-[15px] text-ink-3">
            {!today ? (
              <span className="inline-block w-56">
                <Skeleton />
              </span>
            ) : today.birthdays ? (
              <>
                <span className="text-ink">{plural(today.birthdays ?? 0, "birthday")}</span> today
                {pending.length > 0 ? (
                  <>
                    {" "}
                    · <span className="text-ink">{pending.length}</span> waiting to be sent
                  </>
                ) : (
                  " · everyone's been greeted"
                )}
              </>
            ) : (
              "No birthdays today."
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <Link href="/runs">
              <History /> Run history
            </Link>
          </Button>
          {pending.length > 0 ? (
            <Button onClick={() => setSendOpen(true)}>
              <Send /> Send {pending.length} now
            </Button>
          ) : (
            <Button asChild>
              <Link href="/send">
                <Send /> Send wishes
              </Link>
            </Button>
          )}
        </div>
      </header>

      {dash.isError && <ErrorState error={dash.error} onRetry={() => dash.refetch()} />}
      {dash.data && dash.data.errors.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warn/25 bg-warn-soft/70 px-4 py-3 text-sm text-ink-2 animate-fade">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            Some figures couldn&apos;t load ({dash.data.errors.map((e) => e.source.replace("_", " ")).join(", ")}). The rest is up to date.
          </span>
        </div>
      )}

      <Stats data={data} loading={dash.isPending} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2 animate-rise [animation-delay:80ms]">
          <CardHeader
            eyebrow="Today"
            title="Birthdays"
            action={
              <Link href="/send" className="inline-flex items-center gap-1 text-sm text-ink-3 transition-colors hover:text-ink">
                Other dates <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          {dash.isPending ? (
            <div className="space-y-4 px-5 pt-2 pb-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3.5">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                </div>
              ))}
            </div>
          ) : today && today.members.length > 0 ? (
            <div className="divide-y divide-line border-t border-line">
              {today.members.map((d) => (
                <BirthdayRow key={d.member_id} d={d} />
              ))}
            </div>
          ) : (
            <NoBirthdaysToday />
          )}
        </Card>

        <div className="min-w-0 space-y-6">
          <MessagesToday counts={data?.messages_today} loading={dash.isPending} />
          <LastRun run={data?.last_run} loading={dash.isPending} />
        </div>
      </div>

      <ComingUp />

      <SendDialog open={sendOpen} onOpenChange={setSendOpen} date={t} recipients={pending} memberIds={pending.map((p) => p.member_id)} />
    </div>
  );
}

function Stats({ data, loading }: { data?: DashboardData; loading: boolean }) {
  const sent = data?.messages_today?.SENT ?? 0;
  const items = [
    { label: "Members", value: data?.totals?.all_members, href: "/members", hint: "on the register" },
    {
      label: "Data issues",
      value: data?.data_issues,
      href: "/members?issues=1",
      hint: data?.data_issues ? "need fixing before their birthday" : "all records look good",
      alert: !!data?.data_issues,
    },
    { label: "Birthdays today", value: data?.today?.birthdays, href: "/send", hint: `${data?.today?.would_send ?? 0} ready to send`, gold: true },
    { label: "Sent today", value: sent, href: "/messages", hint: `${data?.messages_today?.FAILED ?? 0} failed` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((s, i) => (
        <Link
          key={s.label}
          href={s.href}
          style={{ animationDelay: `${i * 50}ms` }}
          className="group rounded-2xl border border-line bg-card p-4 shadow-sm transition-all animate-rise hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md sm:p-5"
        >
          <p className="flex items-center gap-1.5 text-[13px] text-ink-3">
            {s.gold && <Cake className="size-3.5 text-marigold" />}
            {s.alert && <span className="size-1.5 rounded-full bg-bad" />}
            {s.label}
          </p>
          {loading ? (
            <Skeleton className="mt-3 mb-2 h-9 w-16" />
          ) : (
            <p className={cn("mt-2 font-display text-[2.4rem] leading-none num", s.alert ? "text-bad" : "text-ink")}>{s.value ?? "—"}</p>
          )}
          <p className="mt-2 truncate text-xs text-ink-3">{s.hint}</p>
        </Link>
      ))}
    </div>
  );
}

function NoBirthdaysToday() {
  const { list } = useUpcomingBirthdays(30);
  const next = list[0];
  return (
    <EmptyState icon={<Cake />} title="A quiet day">
      {next ? (
        <>
          The next birthday is <span className="text-ink">{next.member.full_name}</span> on {formatDay(next.date, { day: "numeric", month: "long" })}.
        </>
      ) : (
        "No birthdays on the register today."
      )}
    </EmptyState>
  );
}

const ORDER: MS[] = ["SENT", "FAILED", "UNKNOWN", "REVIEW", "PENDING", "DEFERRED", "SKIPPED", "INVALID"];
const BAR: Record<string, string> = { ok: "bg-ok", bad: "bg-bad", warn: "bg-warn", info: "bg-info", mute: "bg-line-strong" };

function MessagesToday({ counts, loading }: { counts?: Partial<Record<MS, number>> | null; loading: boolean }) {
  const entries = ORDER.map((s) => [s, counts?.[s] ?? 0] as const).filter(([, n]) => n > 0);
  const total = entries.reduce((a, [, n]) => a + n, 0);
  return (
    <Card className="animate-rise [animation-delay:120ms]">
      <CardHeader
        eyebrow="Today"
        title="Messages"
        action={
          <Link href="/messages" className="text-sm text-ink-3 hover:text-ink">
            Log
          </Link>
        }
      />
      <div className="px-5 pb-5">
        {loading ? (
          <Skeleton className="h-2.5 w-full rounded-full" />
        ) : total === 0 ? (
          <p className="text-sm text-ink-3">No messages logged yet today.</p>
        ) : (
          <>
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Messages by status">
              {entries.map(([s, n]) => (
                <div key={s} className={cn("h-full transition-all", BAR[messageTone(s)[0]])} style={{ width: `${(n / total) * 100}%` }} />
              ))}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
              {entries.map(([s, n]) => (
                <div key={s} className="flex items-center justify-between text-sm">
                  <dt className="flex items-center gap-2 text-ink-2">
                    <span className={cn("size-2 rounded-full", BAR[messageTone(s)[0]])} />
                    {messageTone(s)[1]}
                  </dt>
                  <dd className="num font-medium text-ink">{n}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
    </Card>
  );
}

function LastRun({ run, loading }: { run?: DashboardData["last_run"]; loading: boolean }) {
  return (
    <Card className="animate-rise [animation-delay:160ms]">
      <CardHeader
        eyebrow="Automation"
        title="Last run"
        action={
          <Link href="/runs" className="text-sm text-ink-3 hover:text-ink">
            History
          </Link>
        }
      />
      <div className="px-5 pb-5">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="w-24" />
            <Skeleton className="w-40" />
          </div>
        ) : !run ? (
          <p className="text-sm text-ink-3">No runs recorded yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <RunResult result={run.result} />
              <span className="text-xs text-ink-3">{formatStamp(run.finished_at || run.started_at)}</span>
            </div>
            <p className="text-sm text-ink-2">
              <span className="num font-medium text-ink">{run.sent}</span> sent ·{" "}
              <span className={cn("num font-medium", run.failed ? "text-bad" : "text-ink")}>{run.failed}</span> failed
              {run.needs_review > 0 && (
                <>
                  {" "}
                  · <span className="num font-medium text-warn">{run.needs_review}</span> to review
                </>
              )}
            </p>
            <p className="flex items-center justify-between text-xs text-ink-3">
              <span>{run.trigger_source === "SCHEDULE" ? "Scheduled" : `Manual · ${run.requested_by}`}</span>
              <span className="font-mono">#{run.execution_id}</span>
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function ComingUp() {
  const { list, loading, error } = useUpcomingBirthdays(14);
  return (
    <section className="animate-rise [animation-delay:200ms]">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="eyebrow mb-1">Next two weeks</p>
          <h2 className="font-display text-2xl text-ink">Coming up</h2>
        </div>
        <Link href="/members" className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink">
          All members <ArrowRight className="size-3.5" />
        </Link>
      </div>
      {error ? (
        <ErrorState error={error} compact />
      ) : loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={<Sparkles />} title="Nothing in the next two weeks" />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {list.slice(0, 8).map(({ member, days, date }) => {
            const age = turningAge(member.date_of_birth);
            const blocked = !member.eligible_for_whatsapp;
            return (
              <Link
                key={member.member_id}
                href={`/members/${encodeURIComponent(member.member_id)}`}
                className="group flex gap-4 rounded-2xl border border-line bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md"
              >
                <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-marigold-soft py-2 text-marigold-ink">
                  <span className="font-display text-2xl leading-none num">{date.slice(8)}</span>
                  <span className="mt-1 text-[10px] font-semibold tracking-wider uppercase">{formatDay(date, { month: "short" })}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{member.full_name}</p>
                  <p className="text-[13px] text-ink-3">
                    {days === 1 ? "Tomorrow" : `In ${days} days`}
                    {age ? ` · turns ${age}` : ""}
                  </p>
                  {blocked && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-bad">
                      <CircleAlert className="size-3" /> {member.data_issues[0] ?? (member.whatsapp_enabled !== "Yes" ? "WhatsApp off" : "Won't be sent")}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
