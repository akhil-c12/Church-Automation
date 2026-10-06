"use client";

import { AlertTriangle, CircleAlert } from "lucide-react";
import type { Member, MemberInput, RowResult } from "@/lib/types";
import { ApiError, detailLines, errorMessage } from "@/lib/api";
import { todayISO } from "@/lib/dates";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Segmented, Switch } from "@/components/ui/primitives";

export interface MemberFormValues {
  member_id: string;
  full_name: string;
  mobile_number: string;
  date_of_birth: string;
  whatsapp_enabled: boolean;
  status: "Active" | "Inactive";
  remarks: string;
}

export const emptyMember: MemberFormValues = {
  member_id: "",
  full_name: "",
  mobile_number: "",
  date_of_birth: "",
  whatsapp_enabled: true,
  status: "Active",
  remarks: "",
};

export function fromMember(m: Member): MemberFormValues {
  return {
    member_id: m.member_id,
    full_name: m.full_name ?? "",
    mobile_number: m.mobile_number ?? "",
    date_of_birth: m.date_of_birth ?? "",
    whatsapp_enabled: m.whatsapp_enabled === "Yes",
    status: m.status === "Inactive" ? "Inactive" : "Active",
    remarks: m.remarks ?? "",
  };
}

export function toInput(v: MemberFormValues): MemberInput {
  return {
    member_id: v.member_id.trim(),
    full_name: v.full_name.trim(),
    mobile_number: v.mobile_number.trim(),
    date_of_birth: v.date_of_birth,
    whatsapp_enabled: v.whatsapp_enabled ? "Yes" : "No",
    status: v.status,
    remarks: v.remarks.trim(),
  };
}

/** Only the fields that changed, for PATCH. */
export function diff(before: MemberFormValues, after: MemberFormValues): Omit<MemberInput, "member_id"> {
  const a = toInput(after);
  const b = toInput(before);
  const out: Record<string, string> = {};
  for (const k of ["full_name", "mobile_number", "date_of_birth", "whatsapp_enabled", "status", "remarks"] as const) {
    if (a[k] !== b[k]) out[k] = a[k] ?? "";
  }
  return out;
}

/** n8n's row-level verdict for a single-record upsert. */
export function rowFrom(err: unknown): RowResult | undefined {
  return err instanceof ApiError ? err.batch?.rows[0] : undefined;
}

export function MemberForm({
  values,
  onChange,
  mode,
  idError,
}: {
  values: MemberFormValues;
  onChange: (v: MemberFormValues) => void;
  mode: "create" | "edit";
  idError?: string;
}) {
  const set = <K extends keyof MemberFormValues>(k: K, v: MemberFormValues[K]) => onChange({ ...values, [k]: v });
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Full name" className="sm:col-span-2">
        {(p) => <Input {...p} value={values.full_name} onChange={(e) => set("full_name", e.target.value)} maxLength={200} autoComplete="off" placeholder="Mary Joseph" required />}
      </Field>
      <Field label="Member ID" hint={mode === "edit" ? "IDs can't be changed." : "Unique ID used in the church register, e.g. CH0101."} error={idError}>
        {(p) => (
          <Input
            {...p}
            value={values.member_id}
            onChange={(e) => set("member_id", e.target.value.toUpperCase())}
            maxLength={64}
            disabled={mode === "edit"}
            className="font-mono"
            placeholder="CH0101"
            required
          />
        )}
      </Field>
      <Field label="Date of birth">
        {(p) => <Input {...p} type="date" value={values.date_of_birth} max={todayISO()} onChange={(e) => set("date_of_birth", e.target.value)} required />}
      </Field>
      <Field label="Mobile number" hint="10-digit number. The country code is added automatically.">
        {(p) => (
          <Input
            {...p}
            type="tel"
            inputMode="tel"
            value={values.mobile_number}
            onChange={(e) => set("mobile_number", e.target.value)}
            maxLength={32}
            className="font-mono"
            placeholder="98765 43210"
            required
          />
        )}
      </Field>
      <div className="space-y-1.5">
        <span className="block text-[13px] font-medium text-ink-2">Status</span>
        <Segmented
          aria-label="Status"
          value={values.status}
          onValueChange={(v) => set("status", v as "Active" | "Inactive")}
          options={[
            { value: "Active", label: "Active" },
            { value: "Inactive", label: "Inactive" },
          ]}
        />
      </div>
      <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-line bg-paper/50 px-4 py-3 sm:col-span-2">
        <span>
          <span className="block text-sm font-medium text-ink">Send WhatsApp birthday greetings</span>
          <span className="block text-[13px] text-ink-3">Turn off for members who prefer a call or have no WhatsApp.</span>
        </span>
        <Switch checked={values.whatsapp_enabled} onCheckedChange={(v) => set("whatsapp_enabled", v)} aria-label="WhatsApp greetings" />
      </label>
      <Field label="Remarks" optional className="sm:col-span-2">
        {(p) => <Textarea {...p} value={values.remarks} onChange={(e) => set("remarks", e.target.value)} maxLength={1000} placeholder="Anything the office should know" />}
      </Field>
    </div>
  );
}

/** Shows n8n's validation verdict (errors block saving; warnings don't). */
export function ValidationNotice({ error, row }: { error: unknown; row?: RowResult }) {
  if (!error && !row?.warnings.length) return null;
  const errors = row?.errors.length ? row.errors : error ? (detailLines(error).length ? detailLines(error) : [errorMessage(error)]) : [];
  return (
    <div className="space-y-2 animate-fade">
      {errors.length > 0 && (
        <div role="alert" className="flex gap-3 rounded-xl border border-bad/25 bg-bad-soft/70 px-4 py-3 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-bad" />
          <div>
            <p className="font-medium text-ink">{row ? "Please fix the following" : "Couldn't save"}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-2">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {row && row.warnings.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-warn/25 bg-warn-soft/70 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
          <ul className="space-y-0.5 text-ink-2">
            {row.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
