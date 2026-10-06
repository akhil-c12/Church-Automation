"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Cake, CircleAlert, MessageCircle, MessageCircleOff, RotateCcw, Send, UserX, UserCheck } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useDeactivateMember, useMember, useUpdateMember } from "@/lib/queries";
import { daysUntilBirthday, formatDay, formatStamp, turningAge, todayISO } from "@/lib/dates";
import { formatPhone } from "@/lib/utils";
import type { Member } from "@/lib/types";
import { Avatar, Card, CardHeader, EmptyState, ErrorState, Meta, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { MemberStatusBadge, MessageStatus, Pill } from "@/components/ui/status";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { MemberForm, ValidationNotice, diff, fromMember, rowFrom } from "@/components/app/member-form";

export default function MemberPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = decodeURIComponent(rawId);
  const member = useMember(id);

  return (
    <div>
      <Link href="/members" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Members
      </Link>
      {member.isPending ? (
        <DetailSkeleton />
      ) : member.error instanceof ApiError && member.error.status === 404 ? (
        <Card>
          <EmptyState
            icon={<UserX />}
            title="Member not found"
            action={
              <Button asChild variant="secondary">
                <Link href="/members">Back to members</Link>
              </Button>
            }
          >
            There&apos;s no member with ID <span className="font-mono text-ink">{id}</span>.
          </EmptyState>
        </Card>
      ) : member.isError ? (
        <ErrorState error={member.error} onRetry={() => member.refetch()} />
      ) : (
        // Re-key on the server's values so the form resets after a save, but not on mere refetches.
        <MemberDetail key={JSON.stringify(fromMember(member.data))} m={member.data} />
      )}
    </div>
  );
}

function MemberDetail({ m }: { m: Member }) {
  const original = useMemo(() => fromMember(m), [m]);
  const [values, setValues] = useState(original);
  const update = useUpdateMember(m.member_id);
  const patch = diff(original, values);
  const dirty = Object.keys(patch).length > 0;

  const save = () =>
    update.mutate(patch, {
      onSuccess: (res) => {
        const w = res.rows[0]?.warnings ?? [];
        toast.success("Changes saved", w.length ? { description: w.join(" · ") } : undefined);
      },
    });

  const days = daysUntilBirthday(m.date_of_birth);
  const age = turningAge(m.date_of_birth);
  const inactive = m.status !== "Active";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-5 animate-rise">
        <Avatar name={m.full_name} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[2rem] leading-tight text-ink sm:text-[2.35rem]">{m.full_name || "Unnamed member"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-3">
            <span className="font-mono">{m.member_id}</span>
            <span aria-hidden>·</span>
            <MemberStatusBadge status={m.status} />
            {m.whatsapp_enabled === "Yes" ? (
              <Pill tone="info" dot={false}>
                <MessageCircle className="size-3" /> WhatsApp
              </Pill>
            ) : (
              <Pill tone="mute" dot={false}>
                <MessageCircleOff className="size-3" /> No WhatsApp
              </Pill>
            )}
            {m.eligible_for_whatsapp ? <Pill tone="ok">Will be greeted</Pill> : <Pill tone="bad">Won&apos;t be greeted</Pill>}
          </div>
        </div>
        {days !== null && (
          <div className="flex items-center gap-3 rounded-2xl border border-marigold/30 bg-marigold-soft/70 px-4 py-3">
            <Cake className="size-5 text-marigold" />
            <div className="leading-tight">
              <p className="text-sm font-medium text-ink">
                {days === 0 ? "Birthday today" : days === 1 ? "Birthday tomorrow" : `Birthday in ${days} days`}
              </p>
              <p className="text-xs text-ink-3">
                {formatDay(m.date_of_birth, { day: "numeric", month: "long" })}
                {age ? ` · turns ${age}` : ""}
              </p>
            </div>
          </div>
        )}
      </header>

      {m.data_issues.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-bad/25 bg-bad-soft/60 px-4 py-3 text-sm animate-fade">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-bad" />
          <div>
            <p className="font-medium text-ink">This member won&apos;t receive a birthday message until these are fixed:</p>
            <ul className="mt-1 list-disc pl-4 text-ink-2">
              {m.data_issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] [&>*]:min-w-0">
        <Card className="animate-rise [animation-delay:60ms]">
          <CardHeader eyebrow="Details" title="Member record" />
          <div className="px-5 pt-2 pb-5 sm:px-6">
            <MemberForm mode="edit" values={values} onChange={setValues} />
            {update.error ? (
              <div className="mt-5">
                <ValidationNotice error={update.error} row={rowFrom(update.error)} />
              </div>
            ) : null}
          </div>
          <AnimatePresence>
            {dirty && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="sticky bottom-4 mx-4 mb-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-ink px-4 py-3 text-paper shadow-lg"
              >
                <span className="text-sm">
                  {Object.keys(patch).length} unsaved change{Object.keys(patch).length > 1 ? "s" : ""}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="text-paper/80 hover:bg-white/10 hover:text-paper" onClick={() => (setValues(original), update.reset())}>
                    <RotateCcw /> Discard
                  </Button>
                  <Button size="sm" className="bg-paper text-ink hover:bg-paper/90" onClick={save} loading={update.isPending}>
                    Save changes
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        <div className="space-y-6">
          <Card className="animate-rise [animation-delay:100ms]">
            <CardHeader eyebrow="WhatsApp" title="Greetings" />
            <dl className="divide-y divide-line px-5 pb-3">
              <Meta label="Last sent">{m.last_birthday_sent ? formatDay(m.last_birthday_sent, { day: "numeric", month: "short", year: "numeric" }) : "Never"}</Meta>
              <Meta label="Last status">{m.last_message_status ? <MessageStatus status={m.last_message_status} /> : "—"}</Meta>
              {m.last_error && <Meta label="Last error">{<span className="text-bad">{m.last_error}</span>}</Meta>}
              <Meta label="Mobile" mono>
                {formatPhone(m.normalized_mobile || m.mobile_number)}
              </Meta>
            </dl>
            {days === 0 && !inactive && (
              <div className="border-t border-line px-5 py-4">
                <Button asChild variant="secondary" className="w-full">
                  <Link href={`/send?date=${todayISO()}&member=${encodeURIComponent(m.member_id)}`}>
                    <Send /> Send today&apos;s greeting
                  </Link>
                </Button>
              </div>
            )}
          </Card>

          <Card className="animate-rise [animation-delay:140ms]">
            <CardHeader eyebrow="Record" title="History" />
            <dl className="divide-y divide-line px-5 pb-3">
              <Meta label="Added">{formatStamp(m.created_at)}</Meta>
              <Meta label="Updated">{formatStamp(m.updated_at)}</Meta>
            </dl>
          </Card>

          <StatusAction m={m} />
        </div>
      </div>
    </div>
  );
}

function StatusAction({ m }: { m: Member }) {
  const [open, setOpen] = useState(false);
  const deactivate = useDeactivateMember(m.member_id);
  const reactivate = useUpdateMember(m.member_id);
  const active = m.status === "Active";

  if (!active) {
    return (
      <Card className="flex items-center justify-between gap-3 p-5">
        <p className="text-sm text-ink-3">Inactive members aren&apos;t greeted.</p>
        <Button
          variant="secondary"
          size="sm"
          loading={reactivate.isPending}
          onClick={() => reactivate.mutate({ status: "Active" }, { onSuccess: () => toast.success(`${m.full_name} is active again`) })}
        >
          <UserCheck /> Reactivate
        </Button>
      </Card>
    );
  }

  return (
    <>
      <Card className="flex items-center justify-between gap-3 p-5">
        <p className="text-sm text-ink-3">Moved away or left the church?</p>
        <Button variant="danger-ghost" size="sm" onClick={() => setOpen(true)}>
          <UserX /> Deactivate
        </Button>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Deactivate ${m.full_name}?`} description="They stay on the register but won't receive birthday greetings.">
          <p className="text-sm text-ink-2">Nothing is deleted. You can reactivate them at any time.</p>
          {deactivate.error ? (
            <div className="mt-4">
              <ValidationNotice error={deactivate.error} row={rowFrom(deactivate.error)} />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deactivate.isPending}
              onClick={() =>
                deactivate.mutate(undefined, {
                  onSuccess: () => {
                    setOpen(false);
                    toast.success(`${m.full_name} deactivated`);
                  },
                })
              }
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-5">
        <Skeleton className="size-16 rounded-full" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="w-40" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] [&>*]:min-w-0">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}
