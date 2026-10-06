"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ChevronLeft, ChevronRight, FileUp, MessageCircleOff, Search, UserPlus, Users, X } from "lucide-react";
import { useMembers, type MemberFilters } from "@/lib/queries";
import { daysUntilBirthday, formatDay, MONTHS } from "@/lib/dates";
import { cn, formatPhone, plural } from "@/lib/utils";
import type { Member } from "@/lib/types";
import { PageHeader, Card, Avatar, EmptyState, ErrorState, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Segmented, Select, Switch, Tip } from "@/components/ui/primitives";
import { MemberStatusBadge, MessageStatus, Pill } from "@/components/ui/status";

const PAGE_SIZE = 25;

export default function MembersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Register"
        title="Members"
        description="Everyone on the birthday list. Fix data issues here so nobody's greeting gets skipped."
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href="/import">
                <FileUp /> Import CSV
              </Link>
            </Button>
            <Button asChild>
              <Link href="/members/new">
                <UserPlus /> Add member
              </Link>
            </Button>
          </>
        }
      />
      <Suspense>
        <MembersBrowser />
      </Suspense>
    </>
  );
}

function useUrlState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  return { params, set };
}

function MembersBrowser() {
  const { params, set } = useUrlState();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const wa = params.get("wa") ?? "all";
  const issues = params.get("issues") === "1";
  const month = params.get("month") ?? "all";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const [search, setSearch] = useState(q);
  // Keep the box in sync when the URL changes (back button, "Clear filters").
  const [syncedQ, setSyncedQ] = useState(q);
  if (q !== syncedQ) {
    setSyncedQ(q);
    setSearch(q);
  }
  useEffect(() => {
    const t = setTimeout(() => search.trim() !== q && set({ q: search.trim() || undefined }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const filters: MemberFilters = {
    q: q || undefined,
    status: status === "all" ? undefined : status,
    whatsapp_enabled: wa === "all" ? undefined : wa,
    issues_only: issues || undefined,
    birthday_month: month === "all" ? undefined : Number(month),
    page,
    page_size: PAGE_SIZE,
  };
  const members = useMembers(filters);
  const data = members.data;
  const anyFilter = q || status !== "all" || wa !== "all" || issues || month !== "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 animate-rise [animation-delay:60ms] xl:flex-row xl:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, member ID or phone"
            className="h-10 pl-9"
            aria-label="Search members"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            aria-label="Status"
            value={status}
            onValueChange={(v) => set({ status: v === "all" ? undefined : v })}
            options={[
              { value: "all", label: "All" },
              { value: "Active", label: "Active" },
              { value: "Inactive", label: "Inactive" },
            ]}
          />
          <Select
            aria-label="WhatsApp"
            className="w-36"
            value={wa}
            onValueChange={(v) => set({ wa: v === "all" ? undefined : v })}
            options={[
              { value: "all", label: "Any WhatsApp" },
              { value: "Yes", label: "WhatsApp on" },
              { value: "No", label: "WhatsApp off" },
            ]}
          />
          <Select
            aria-label="Birthday month"
            className="w-40"
            value={month}
            onValueChange={(v) => set({ month: v === "all" ? undefined : v })}
            options={[{ value: "all", label: "Any month" }, ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))]}
          />
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-card px-3 text-sm text-ink-2 shadow-sm">
            <Switch checked={issues} onCheckedChange={(v) => set({ issues: v ? "1" : undefined })} aria-label="Only data issues" />
            Data issues
            {data?.totals.with_data_issues ? <span className="num rounded-full bg-bad-soft px-1.5 text-xs text-bad">{data.totals.with_data_issues}</span> : null}
          </label>
        </div>
      </div>

      <div className="flex min-h-5 items-center justify-between text-sm text-ink-3">
        <span>
          {data ? (
            <>
              {plural(data.pagination.total, "member")}
              {anyFilter ? " match" : ""}
              {members.isFetching && !members.isPending && <span className="ml-2 text-xs">Updating…</span>}
            </>
          ) : null}
        </span>
        {anyFilter && (
          <button onClick={() => (setSearch(""), set({ q: undefined, status: undefined, wa: undefined, issues: undefined, month: undefined }))} className="inline-flex cursor-pointer items-center gap-1 hover:text-ink">
            <X className="size-3.5" /> Clear filters
          </button>
        )}
      </div>

      {members.isError ? (
        <ErrorState error={members.error} onRetry={() => members.refetch()} />
      ) : (
        <Card className={cn("overflow-hidden animate-rise [animation-delay:120ms] transition-opacity", members.isPlaceholderData && "opacity-60")}>
          {members.isPending ? (
            <TableSkeleton />
          ) : data && data.members.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title={anyFilter ? "No members match" : "No members yet"}
              action={
                anyFilter ? undefined : (
                  <Button asChild>
                    <Link href="/members/new">
                      <UserPlus /> Add the first member
                    </Link>
                  </Button>
                )
              }
            >
              {anyFilter ? "Try a different search or clear the filters." : "Add members one by one, or import a CSV."}
            </EmptyState>
          ) : (
            <>
              <MemberTable members={data?.members ?? []} />
              <MemberCards members={data?.members ?? []} />
            </>
          )}
        </Card>
      )}

      {data && data.pagination.total_pages > 1 && (
        <nav className="flex items-center justify-between pt-1" aria-label="Pagination">
          <p className="text-sm text-ink-3 num">
            Page {data.pagination.page} of {data.pagination.total_pages}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>
              <ChevronLeft /> Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= data.pagination.total_pages} onClick={() => set({ page: String(page + 1) })}>
              Next <ChevronRight />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}

function BirthdayCell({ dob }: { dob: string }) {
  const days = daysUntilBirthday(dob);
  if (days === null) return <span className="text-ink-3">—</span>;
  return (
    <span className="whitespace-nowrap">
      <span className="text-ink">{formatDay(dob)}</span>
      {days === 0 ? (
        <Pill tone="gold" className="ml-2">
          Today
        </Pill>
      ) : days <= 14 ? (
        <span className="ml-2 text-xs text-marigold-ink">in {days}d</span>
      ) : null}
    </span>
  );
}

function IssuesCell({ m }: { m: Member }) {
  if (!m.data_issues.length) return null;
  return (
    <Tip content={m.data_issues.join(" · ")}>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-bad">
        <AlertCircle className="size-3.5" /> {m.data_issues.length === 1 ? m.data_issues[0] : `${m.data_issues.length} issues`}
      </span>
    </Tip>
  );
}

function MemberTable({ members }: { members: Member[] }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-paper-2/50 text-left">
            {["Member", "Mobile", "Birthday", "Status", "Last greeting", ""].map((h) => (
              <th key={h} className="px-5 py-2.5 text-xs font-medium text-ink-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {members.map((m) => (
            <tr key={m.member_id} className="group relative transition-colors hover:bg-paper-2/40">
              <td className="px-5 py-3">
                <Link href={`/members/${encodeURIComponent(m.member_id)}`} className="flex items-center gap-3 after:absolute after:inset-0">
                  <Avatar name={m.full_name} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{m.full_name || "Unnamed"}</span>
                    <span className="block font-mono text-xs text-ink-3">{m.member_id}</span>
                  </span>
                </Link>
              </td>
              <td className="px-5 py-3">
                <span className="flex items-center gap-1.5 font-mono text-[13px] text-ink-2">
                  {formatPhone(m.mobile_number)}
                  {m.whatsapp_enabled !== "Yes" && (
                    <Tip content="WhatsApp greetings turned off">
                      <MessageCircleOff className="relative z-10 size-3.5 text-ink-3" />
                    </Tip>
                  )}
                </span>
              </td>
              <td className="px-5 py-3">
                <BirthdayCell dob={m.date_of_birth} />
              </td>
              <td className="px-5 py-3">
                <MemberStatusBadge status={m.status} />
              </td>
              <td className="px-5 py-3">
                {m.last_message_status ? (
                  <span className="flex items-center gap-2">
                    <MessageStatus status={m.last_message_status} />
                    {m.last_birthday_sent && <span className="text-xs text-ink-3">{formatDay(m.last_birthday_sent, { day: "numeric", month: "short", year: "2-digit" })}</span>}
                  </span>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </td>
              <td className="relative z-10 px-5 py-3 text-right">
                <IssuesCell m={m} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemberCards({ members }: { members: Member[] }) {
  return (
    <ul className="divide-y divide-line md:hidden">
      {members.map((m) => (
        <li key={m.member_id}>
          <Link href={`/members/${encodeURIComponent(m.member_id)}`} className="flex items-center gap-3 px-4 py-3.5 active:bg-paper-2">
            <Avatar name={m.full_name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{m.full_name}</p>
              <p className="text-[13px] text-ink-3">
                <BirthdayCell dob={m.date_of_birth} />
              </p>
              <IssuesCell m={m} />
            </div>
            {m.status !== "Active" && <MemberStatusBadge status={m.status} />}
            <ChevronRight className="size-4 text-ink-3" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="w-40" />
          <Skeleton className="ml-auto w-24" />
          <Skeleton className="w-20" />
        </div>
      ))}
    </div>
  );
}
