import { cn } from "@/lib/utils";

type Tone = "ok" | "bad" | "warn" | "info" | "mute" | "gold";

const TONES: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
  info: "bg-info-soft text-info",
  mute: "bg-mute-soft text-mute",
  gold: "bg-marigold-soft text-marigold-ink",
};

export function Pill({ tone, children, dot = true, className }: { tone: Tone; children: React.ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const MESSAGE: Record<string, [Tone, string]> = {
  SENT: ["ok", "Sent"],
  FAILED: ["bad", "Failed"],
  UNKNOWN: ["info", "Unknown"],
  REVIEW: ["warn", "Needs review"],
  SKIPPED: ["mute", "Skipped"],
  INVALID: ["bad", "Invalid data"],
  DEFERRED: ["info", "Deferred"],
  PENDING: ["info", "Pending"],
};

const DECISION: Record<string, [Tone, string]> = {
  SEND: ["ok", "Will send"],
  SKIPPED: ["mute", "Skipped"],
  INVALID: ["bad", "Invalid data"],
  REVIEW: ["warn", "Needs review"],
  DEFERRED: ["info", "Deferred"],
  NOT_FOUND: ["mute", "Not found"],
};

const RUN: Record<string, [Tone, string]> = {
  COMPLETED: ["ok", "Completed"],
  COMPLETED_WITH_FAILURES: ["bad", "Some failed"],
  COMPLETED_NEEDS_ATTENTION: ["warn", "Needs attention"],
  NO_BIRTHDAYS: ["mute", "No birthdays"],
};

export const messageTone = (s: string) => MESSAGE[s] ?? (["mute", s || "—"] as [Tone, string]);

export function MessageStatus({ status }: { status: string }) {
  const [tone, label] = messageTone(status);
  return <Pill tone={tone}>{label}</Pill>;
}

export function DecisionBadge({ decision }: { decision: string }) {
  const [tone, label] = DECISION[decision] ?? ["mute", decision];
  return <Pill tone={tone}>{label}</Pill>;
}

export function RunResult({ result }: { result: string }) {
  const [tone, label] = RUN[result] ?? ["mute", result];
  return <Pill tone={tone}>{label}</Pill>;
}

export function MemberStatusBadge({ status }: { status: string }) {
  return status === "Active" ? (
    <Pill tone="ok">Active</Pill>
  ) : (
    <Pill tone="mute" dot={false}>
      Inactive
    </Pill>
  );
}
