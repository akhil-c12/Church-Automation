// All "today" logic follows the church's timezone (n8n schedules in IST).
export const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || "Asia/Kolkata";

const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export function todayISO(): string {
  return ymdFmt.format(new Date());
}

/** Calendar arithmetic on yyyy-MM-dd strings (no timezone drift). */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isISODate(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

const utc = (iso: string) => new Date(`${iso}T12:00:00Z`);

export function formatDay(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  if (!isISODate(iso)) return "—";
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(utc(iso));
}

export function formatLongDate(iso: string): string {
  return formatDay(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** "2026-10-03 09:00:41" (IST wall time from n8n) -> "9:00 AM". */
export function formatTime(stamp: string | undefined): string {
  const m = stamp?.match(/(\d{2}):(\d{2})/);
  if (!m) return "—";
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

export function formatStamp(stamp: string | undefined): string {
  if (!stamp) return "—";
  const date = stamp.slice(0, 10);
  if (!isISODate(date)) return stamp;
  const t = todayISO();
  const day = date === t ? "Today" : date === addDays(t, -1) ? "Yesterday" : formatDay(date);
  return stamp.length > 10 ? `${day}, ${formatTime(stamp)}` : day;
}

/** Days from `from` until the next occurrence of the birthday (0 = today). Feb 29 → Feb 28 in common years. */
export function daysUntilBirthday(dob: string, from = todayISO()): number | null {
  if (!isISODate(dob)) return null;
  const year = Number(from.slice(0, 4));
  const next = (y: number) => {
    let md = dob.slice(5);
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    if (md === "02-29" && !leap) md = "02-28";
    return `${y}-${md}`;
  };
  let target = next(year);
  if (target < from) target = next(year + 1);
  return Math.round((utc(target).getTime() - utc(from).getTime()) / 86_400_000);
}

/** Age the member turns on their next birthday (or today). */
export function turningAge(dob: string, from = todayISO()): number | null {
  const days = daysUntilBirthday(dob, from);
  if (days === null) return null;
  return Number(addDays(from, days).slice(0, 4)) - Number(dob.slice(0, 4));
}

export function monthOf(iso: string): number {
  return Number(iso.slice(5, 7));
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function greeting(): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
