"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatDay, todayISO, isISODate } from "@/lib/dates";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

/** Day stepper: ‹ Today › plus a date input. */
export function DayStepper({ value, onChange, allowFuture = false }: { value: string; onChange: (d: string) => void; allowFuture?: boolean }) {
  const t = todayISO();
  const label = value === t ? "Today" : value === addDays(t, -1) ? "Yesterday" : formatDay(value, { weekday: "short", day: "numeric", month: "short" });
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center rounded-[10px] border border-line bg-card shadow-sm">
        <Button variant="ghost" size="icon" className="size-9 rounded-r-none" onClick={() => onChange(addDays(value, -1))} aria-label="Previous day">
          <ChevronLeft />
        </Button>
        <span className="min-w-28 px-2 text-center text-sm font-medium text-ink">{label}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-l-none"
          onClick={() => onChange(addDays(value, 1))}
          disabled={!allowFuture && value >= t}
          aria-label="Next day"
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
        <Input
          type="date"
          value={value}
          max={allowFuture ? undefined : t}
          onChange={(e) => isISODate(e.target.value) && onChange(e.target.value)}
          className="w-44 pl-9"
          aria-label="Pick a date"
        />
      </div>
    </div>
  );
}
