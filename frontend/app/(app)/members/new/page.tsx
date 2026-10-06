"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Cake, UserPlus } from "lucide-react";
import { MemberExistsError, useCreateMember } from "@/lib/queries";
import { daysUntilBirthday, formatDay, turningAge } from "@/lib/dates";
import { Card, PageHeader, Avatar } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { MemberForm, ValidationNotice, emptyMember, rowFrom, toInput } from "@/components/app/member-form";

export default function NewMemberPage() {
  const router = useRouter();
  const create = useCreateMember();
  const [values, setValues] = useState(emptyMember);
  const exists = create.error instanceof MemberExistsError ? create.error : undefined;
  const row = rowFrom(create.error);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(toInput(values), {
      onSuccess: (res) => {
        const r = res.rows[0];
        toast.success(`${values.full_name || values.member_id} added`, {
          description: r?.warnings.length ? r.warnings.join(" · ") : "They'll be greeted automatically on their birthday.",
        });
        router.push(`/members/${encodeURIComponent(values.member_id.trim())}`);
      },
    });
  };

  const days = values.date_of_birth ? daysUntilBirthday(values.date_of_birth) : null;
  const age = values.date_of_birth ? turningAge(values.date_of_birth) : null;
  const canSubmit = values.member_id.trim() && values.full_name.trim() && values.mobile_number.trim() && values.date_of_birth;

  return (
    <div>
      <Link href="/members" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Members
      </Link>
      <PageHeader eyebrow="Register" title="Add a member" description="New members are checked by the automation before they're saved." />

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] [&>*]:min-w-0" noValidate>
        <Card className="p-6 animate-rise [animation-delay:60ms] sm:p-7">
          <MemberForm
            mode="create"
            values={values}
            onChange={(v) => {
              setValues(v);
              if (exists) create.reset();
            }}
            idError={exists ? "This ID is already taken." : undefined}
          />
          {exists && (
            <p className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
              Member ID {exists.memberId} already exists.{" "}
              <Link href={`/members/${encodeURIComponent(exists.memberId)}`} className="font-medium underline underline-offset-2">
                Open that member
              </Link>{" "}
              or choose another ID.
            </p>
          )}
          {!exists && create.error ? (
            <div className="mt-5">
              <ValidationNotice error={create.error} row={row} />
            </div>
          ) : null}
          <div className="mt-7 flex justify-end gap-2 border-t border-line pt-5">
            <Button variant="secondary" type="button" asChild>
              <Link href="/members">Cancel</Link>
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!canSubmit}>
              <UserPlus /> Add member
            </Button>
          </div>
        </Card>

        <aside className="space-y-4 animate-rise [animation-delay:120ms]">
          <p className="eyebrow">Preview</p>
          <Card className="overflow-hidden">
            <div className="grain flex flex-col items-center bg-marigold-soft/60 px-6 pt-8 pb-6 text-center">
              <Avatar name={values.full_name || "?"} size="xl" className="ring-4 ring-card" />
              <p className="mt-4 font-display text-xl text-ink">{values.full_name || "New member"}</p>
              <p className="font-mono text-xs text-ink-3">{values.member_id || "—"}</p>
            </div>
            <div className="flex items-center gap-3 border-t border-line px-5 py-4 text-sm">
              <Cake className="size-4 text-marigold" />
              {days !== null ? (
                <span className="text-ink-2">
                  {days === 0 ? "Birthday today!" : `${formatDay(values.date_of_birth, { day: "numeric", month: "long" })} · in ${days} days`}
                  {age ? <span className="text-ink-3"> · turns {age}</span> : null}
                </span>
              ) : (
                <span className="text-ink-3">Add a date of birth</span>
              )}
            </div>
          </Card>
          <p className="text-xs leading-relaxed text-ink-3">
            Phone numbers shared by family members are allowed. You&apos;ll see a note, not an error.
          </p>
        </aside>
      </form>
    </div>
  );
}
