import { cn, APP_NAME, CHURCH_NAME } from "@/lib/utils";

/** A single candle: the app's mark. */
export function Mark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-9 items-center justify-center rounded-[11px] bg-ink text-paper shadow-sm", className)} aria-hidden>
      <svg viewBox="0 0 24 24" className="size-5" fill="none">
        <path d="M12 2.5c1.9 2.1 2.6 3.6 2.6 4.8a2.6 2.6 0 0 1-5.2 0c0-1.2.7-2.7 2.6-4.8Z" fill="var(--marigold)" />
        <rect x="9.5" y="11.5" width="5" height="9" rx="1.2" fill="currentColor" />
        <path d="M6.5 21h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Mark />
      <div className="leading-tight">
        <p className="font-display text-[17px] font-medium text-ink">{APP_NAME}</p>
        <p className="text-xs text-ink-3">{CHURCH_NAME}</p>
      </div>
    </div>
  );
}
