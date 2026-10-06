"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, Cake, Info, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { usePreview } from "@/lib/queries";
import { addDays, formatLongDate, isISODate, todayISO } from "@/lib/dates";
import { plural, cn } from "@/lib/utils";
import type { Decision } from "@/lib/types";
import { Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Checkbox, Segmented } from "@/components/ui/primitives";
import { BirthdayRow } from "@/components/app/birthday-row";
import { SendDialog } from "@/components/app/send-flow";

const SELECTABLE = new Set(["SEND", "REVIEW", "DEFERRED"]);

export default function SendPage() {
  return (
    <>
      <PageHeader
        eyebrow="Greetings"
        title="Send birthday wishes"
        description="The automation sends at 9:00 and 13:00 every day. Use this to send now, catch up on a missed day, or retry someone who needs review."
      />
      <Suspense>
        <SendPlanner />
      </Suspense>
    </>
  );
}

function SendPlanner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const t = todayISO();
  const min = addDays(t, -30);
  const rawDate = params.get("date");
  const date = isISODate(rawDate) && rawDate <= t && rawDate >= min ? rawDate : t;
  const only = params.get("member");

  const preview = usePreview(date);
  const decisions = useMemo(() => preview.data?.members ?? [], [preview.data]);
  const [dialog, setDialog] = useState(false);

  // Default selection: everyone n8n will send to (or just ?member=). A manual
  // selection sticks until the preview content changes (React Query keeps the
  // same object reference when a refetch returns identical data).
  const defaults = useMemo(
    () => new Set(decisions.filter((d) => (only ? d.member_id === only && SELECTABLE.has(d.decision) : d.decision === "SEND")).map((d) => d.member_id)),
    [decisions, only],
  );
  const [manual, setManual] = useState<{ base: Set<string>; ids: Set<string> }>();
  const selected = manual && manual.base === defaults ? manual.ids : defaults;
  const setSelected = (fn: Set<string> | ((s: Set<string>) => Set<string>)) =>
    setManual({ base: defaults, ids: typeof fn === "function" ? fn(selected) : fn });

  const setDate = (d: string) => router.replace(`${pathname}?date=${d}`, { scroll: false });

  const chosen = useMemo(() => decisions.filter((d) => selected.has(d.member_id)), [decisions, selected]);
  const force = chosen.some((d) => d.decision !== "SEND");
  const selectable = decisions.filter((d) => SELECTABLE.has(d.decision));
  const allChecked = selectable.length > 0 && selectable.every((d) => selected.has(d.member_id));
  const someChecked = selectable.some((d) => selected.has(d.member_id));

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const groups: [string, string, Decision[]][] = [
    ["ready", "Ready to send", decisions.filter((d) => d.decision === "SEND")],
    ["review", "Needs your decision", decisions.filter((d) => d.decision === "REVIEW" || d.decision === "DEFERRED")],
    ["blocked", "Won't be sent", decisions.filter((d) => !SELECTABLE.has(d.decision))],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] [&>*]:min-w-0">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2 animate-rise [animation-delay:60ms]">
          <Segmented
            aria-label="Date"
            value={date === t ? "today" : date === addDays(t, -1) ? "yesterday" : "custom"}
            onValueChange={(v) => v !== "custom" && setDate(v === "today" ? t : addDays(t, -1))}
            options={[
              { value: "today", label: "Today" },
              { value: "yesterday", label: "Yesterday" },
              { value: "custom", label: "Other day" },
            ]}
          />
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <Input type="date" value={date} min={min} max={t} onChange={(e) => isISODate(e.target.value) && setDate(e.target.value)} className="w-44 pl-9" aria-label="Birthday date" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => preview.refetch()} aria-label="Refresh" disabled={preview.isFetching}>
            <RefreshCw className={cn(preview.isFetching && "animate-spin")} />
          </Button>
        </div>

        <Card className="overflow-hidden animate-rise [animation-delay:100ms]">
          <CardHeader
            eyebrow={formatLongDate(date)}
            title={preview.data ? plural(preview.data.birthdays, "birthday") : "Birthdays"}
            action={
              selectable.length > 0 && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-3">
                  <Checkbox
                    checked={allChecked ? true : someChecked ? "indeterminate" : false}
                    onCheckedChange={(v) => setSelected(new Set(v ? selectable.map((d) => d.member_id) : []))}
                    aria-label="Select all"
                  />
                  Select all
                </label>
              )
            }
          />
          {preview.isPending ? (
            <div className="space-y-4 border-t border-line px-5 py-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : preview.isError ? (
            <div className="border-t border-line p-5">
              <ErrorState error={preview.error} onRetry={() => preview.refetch()} />
            </div>
          ) : decisions.length === 0 ? (
            <div className="border-t border-line">
              <EmptyState icon={<Cake />} title="No birthdays on this date">
                Pick another day, or check the members list for missing dates of birth.
              </EmptyState>
            </div>
          ) : (
            groups.map(([key, label, list]) =>
              list.length ? (
                <section key={key} className="border-t border-line">
                  <p className="eyebrow bg-paper-2/40 px-5 py-2">
                    {label} · {list.length}
                  </p>
                  <div className="divide-y divide-line">
                    {list.map((d) => {
                      const can = SELECTABLE.has(d.decision);
                      return (
                        <BirthdayRow
                          key={d.member_id}
                          d={d}
                          date={date}
                          className={cn(!can && "opacity-75")}
                          leading={
                            <Checkbox
                              checked={selected.has(d.member_id)}
                              onCheckedChange={(v) => toggle(d.member_id, v)}
                              disabled={!can}
                              aria-label={`Select ${d.full_name}`}
                            />
                          }
                        />
                      );
                    })}
                  </div>
                </section>
              ) : null,
            )
          )}
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-10 lg:self-start">
        <Card className="p-5 animate-rise [animation-delay:140ms]">
          <p className="eyebrow mb-3">Ready</p>
          <p className="font-display text-5xl leading-none text-ink num">{chosen.length}</p>
          <p className="mt-2 text-sm text-ink-3">{chosen.length === 1 ? "person selected" : "people selected"}</p>
          <AnimatePresence>
            {force && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 overflow-hidden rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-ink-2"
              >
                Includes members that need review. This is sent as a <strong className="font-medium text-ink">force resend</strong>.
              </motion.p>
            )}
          </AnimatePresence>
          <Button className="mt-5 w-full" size="lg" disabled={chosen.length === 0} onClick={() => setDialog(true)}>
            <Send /> Review &amp; send
          </Button>
        </Card>
        <div className="space-y-3 rounded-2xl border border-line p-5 text-[13px] leading-relaxed text-ink-3 animate-rise [animation-delay:180ms]">
          <p className="flex items-center gap-2 font-medium text-ink-2">
            <ShieldCheck className="size-4 text-primary" /> Never sent twice
          </p>
          <p>
            Each message is recorded <em>before</em> it is sent. If anything goes wrong mid-way, the person is marked “needs review” instead of being messaged again.
          </p>
          <p className="flex items-start gap-2">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Check what happened in the{" "}
              <Link href={`/messages?date=${date}`} className="text-ink-2 underline underline-offset-2">
                message log
              </Link>{" "}
              or{" "}
              <Link href={`/runs?date=${date}`} className="text-ink-2 underline underline-offset-2">
                run history
              </Link>
              .
            </span>
          </p>
        </div>
      </aside>

      <SendDialog open={dialog} onOpenChange={setDialog} date={date} recipients={chosen} memberIds={chosen.map((c) => c.member_id)} force={force} />
    </div>
  );
}
