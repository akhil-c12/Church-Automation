import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { errorMessage, ApiError } from "@/lib/api";
import { Button } from "./button";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-line bg-card shadow-sm", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, eyebrow, action, className }: { title: ReactNode; eyebrow?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-end justify-between gap-4 px-5 pt-5 pb-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h2 className="font-display text-lg font-medium text-ink">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-display text-[2rem] leading-tight font-normal text-ink sm:text-[2.35rem]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const AVATAR_TONES = [
  "bg-[#e8dcc4] text-[#5c4a26]",
  "bg-[#d9e4dc] text-[#2d4a3c]",
  "bg-[#e6d6d0] text-[#6a3a2c]",
  "bg-[#dbe0e6] text-[#34495c]",
  "bg-[#e9e1cf] text-[#5a5030]",
  "bg-[#e1d9e2] text-[#4f3d55]",
];

export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const sizes = { sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-12 text-sm", xl: "size-16 text-lg" };
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide",
        AVATAR_TONES[h % AVATAR_TONES.length],
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} />;
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-paper-2 text-ink-3 [&_svg]:size-5">{icon}</div>}
      <p className="font-display text-lg text-ink">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-sm text-ink-3">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const reqId = error instanceof ApiError ? error.requestId : undefined;
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-bad/25 bg-bad-soft/60 text-sm", compact ? "p-3" : "p-4")}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{errorMessage(error)}</p>
        {reqId && <p className="mt-0.5 font-mono text-[11px] text-ink-3">Ref {reqId.slice(0, 8)}</p>}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw /> Retry
        </Button>
      )}
    </div>
  );
}

/** Small key/value row used in detail panels. */
export function Meta({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-ink-3">{label}</dt>
      <dd className={cn("min-w-0 text-right text-ink", mono && "font-mono text-[13px]")}>{children || "—"}</dd>
    </div>
  );
}
