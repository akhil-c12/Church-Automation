"use client";

import Link from "next/link";
import { MessageSquareQuote } from "lucide-react";
import type { Decision } from "@/lib/types";
import { turningAge, todayISO } from "@/lib/dates";
import { formatPhone, cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/display";
import { DecisionBadge } from "@/components/ui/status";
import { Tip } from "@/components/ui/primitives";

/** One person on a given birthday date, with what n8n will do for them and why. */
export function BirthdayRow({ d, date = todayISO(), leading, className }: { d: Decision; date?: string; leading?: React.ReactNode; className?: string }) {
  const age = d.date_of_birth ? turningAge(d.date_of_birth, date) : null;
  return (
    <div className={cn("flex items-center gap-3.5 px-5 py-3.5", className)}>
      {leading}
      <Avatar name={d.full_name || d.member_id} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link
            href={`/members/${encodeURIComponent(d.member_id)}`}
            className="truncate font-medium text-ink decoration-line-strong underline-offset-4 hover:underline"
          >
            {d.full_name || d.member_id}
          </Link>
          {age !== null && age > 0 && <span className="text-sm text-marigold-ink">turns {age}</span>}
        </div>
        <p className="truncate text-[13px] text-ink-3">
          <span className="font-mono">{formatPhone(d.mobile_number)}</span>
          {d.reason && <span> · {d.reason}</span>}
        </p>
      </div>
      {d.message_preview && (
        <Tip content={<span className="block whitespace-pre-line">{d.message_preview}</span>}>
          <button className="hidden rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink sm:block" aria-label="Preview message">
            <MessageSquareQuote className="size-4" />
          </button>
        </Tip>
      )}
      <DecisionBadge decision={d.decision} />
    </div>
  );
}
