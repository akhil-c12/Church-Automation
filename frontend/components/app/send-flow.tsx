"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Check, CircleDashed, Loader2, Send, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";
import { useRun, useSend } from "@/lib/queries";
import { ApiError, detailLines, errorMessage } from "@/lib/api";
import { formatLongDate } from "@/lib/dates";
import { plural, cn } from "@/lib/utils";
import type { Decision } from "@/lib/types";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/display";
import { RunResult } from "@/components/ui/status";

interface SendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  /** Who will receive a message (for the confirmation list). */
  recipients: Decision[];
  /** Omit to send to everyone n8n considers eligible on `date`. */
  memberIds?: string[];
  force?: boolean;
}

/**
 * Confirmation → submit → live progress, in one dialog. A timeout never
 * resubmits: it explains the run may have started and points to Run history.
 */
export function SendDialog({ open, onOpenChange, date, recipients, memberIds, force }: SendDialogProps) {
  const send = useSend();
  const [executionId, setExecutionId] = useState<string>();

  const close = (o: boolean) => {
    // Keep the dialog open while the request is in flight so it can't be resubmitted blindly.
    if (!o && send.isPending) return;
    onOpenChange(o);
    if (!o) {
      setTimeout(() => {
        send.reset();
        setExecutionId(undefined);
      }, 200);
    }
  };

  const submit = () =>
    send.mutate(
      { date, member_ids: memberIds?.length ? memberIds : undefined, force_resend: force || undefined },
      { onSuccess: (r) => setExecutionId(r.execution_id) },
    );

  const unknown = send.error instanceof ApiError && send.error.code === "SEND_STATUS_UNKNOWN";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={executionId ? "Sending birthday wishes" : unknown ? "We couldn't confirm the send" : "Send birthday wishes?"}
        description={formatLongDate(date)}
      >
        {executionId ? (
          <RunProgress executionId={executionId} onDone={() => close(false)} date={date} />
        ) : unknown ? (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" />
              <div className="space-y-1.5">
                <p className="font-medium text-ink">The request may or may not have started a run.</p>
                <p className="text-ink-2">
                  Please don&apos;t send again yet. Check Run history for this date first. Members who already received a message are
                  never messaged twice, but a second run would still start.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => close(false)}>
                Close
              </Button>
              <Button asChild>
                <Link href={`/runs?date=${date}`} onClick={() => close(false)}>
                  Check run history
                </Link>
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div>
            <p className="text-[15px] text-ink-2">
              {recipients.length > 0 ? (
                <>
                  WhatsApp greetings will go to <strong className="font-semibold text-ink">{plural(recipients.length, "member")}</strong>.
                </>
              ) : (
                <>n8n will message everyone eligible for this date.</>
              )}{" "}
              Anyone who already received today&apos;s message is skipped automatically.
            </p>
            {force && (
              <div className="mt-4 flex gap-2.5 rounded-xl bg-warn-soft px-3.5 py-3 text-sm text-ink-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
                <span>
                  <strong className="font-medium text-ink">Force resend is on.</strong> This overrides “needs review” and retry limits for the selected
                  members. It never resends to someone already marked Sent.
                </span>
              </div>
            )}
            {recipients.length > 0 && (
              <ul className="mt-4 max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                {recipients.map((r) => (
                  <li key={r.member_id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <Avatar name={r.full_name} size="sm" />
                    <span className="flex-1 truncate text-sm text-ink">{r.full_name}</span>
                    <span className="font-mono text-xs text-ink-3">{r.member_id}</span>
                  </li>
                ))}
              </ul>
            )}
            {send.error && (
              <div role="alert" className="mt-4 rounded-xl bg-bad-soft px-3.5 py-3 text-sm text-bad">
                <p className="font-medium">{errorMessage(send.error)}</p>
                {detailLines(send.error).map((l) => (
                  <p key={l} className="mt-1 text-[13px]">
                    {l}
                  </p>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="secondary" onClick={() => close(false)} disabled={send.isPending}>
                Cancel
              </Button>
              <Button onClick={submit} loading={send.isPending}>
                <Send /> {recipients.length ? `Send ${plural(recipients.length, "wish", "wishes")}` : "Send now"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Step({ state, title, children }: { state: "done" | "active" | "waiting"; title: string; children?: React.ReactNode }) {
  return (
    <li className="group relative flex gap-3.5 pb-6 last:pb-0">
      <span className="absolute top-7 bottom-1 left-[13px] w-px bg-line group-last:hidden" aria-hidden />
      <span
        className={cn(
          "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border",
          state === "done" && "border-primary bg-primary text-primary-ink",
          state === "active" && "border-marigold bg-marigold-soft text-marigold-ink",
          state === "waiting" && "border-line bg-card text-ink-3",
        )}
      >
        {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : state === "active" ? <Loader2 className="size-3.5 animate-spin" /> : <CircleDashed className="size-3.5" />}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className={cn("text-sm font-medium", state === "waiting" ? "text-ink-3" : "text-ink")}>{title}</p>
        {children && <div className="mt-1 text-sm text-ink-3">{children}</div>}
      </div>
    </li>
  );
}

function RunProgress({ executionId, onDone, date }: { executionId: string; onDone: () => void; date: string }) {
  const run = useRun(executionId);
  const r = run.data?.runs[0];
  const finished = !!r;

  return (
    <div>
      <ol>
        <Step state="done" title="Request accepted by n8n">
          Execution <span className="font-mono text-ink-2">#{executionId}</span>
        </Step>
        <Step state={finished ? "done" : "active"} title={finished ? "Messages processed" : "Sending messages…"}>
          {finished ? "Each message was claimed, sent and logged." : "This usually takes under a minute. You can close this — we'll notify you."}
        </Step>
        <Step state={finished ? "done" : "waiting"} title="Run summary">
          {r && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 space-y-3">
              <RunResult result={r.result} />
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Sent", r.sent, "text-ok"],
                  ["Failed", r.failed, "text-bad"],
                  ["To review", r.needs_review, "text-warn"],
                ].map(([label, n, tone]) => (
                  <div key={label as string} className="rounded-xl border border-line bg-paper/60 px-3 py-2.5">
                    <p className={cn("font-display text-2xl num", n ? (tone as string) : "text-ink-3")}>{n as number}</p>
                    <p className="text-xs text-ink-3">{label}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </Step>
      </ol>
      {run.error && <p className="mt-4 text-sm text-bad">{errorMessage(run.error)}</p>}
      <DialogFooter>
        <Button variant="secondary" asChild>
          <Link href={`/messages?date=${date}`} onClick={onDone}>
            View message log
          </Link>
        </Button>
        <Button onClick={onDone}>{finished ? "Done" : "Close"}</Button>
      </DialogFooter>
    </div>
  );
}
