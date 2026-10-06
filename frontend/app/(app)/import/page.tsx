"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, CheckCircle2, Download, FileSpreadsheet, FileUp, RotateCcw, Upload, X } from "lucide-react";
import { useCsvBatch } from "@/lib/queries";
import { ApiError, detailLines, errorMessage } from "@/lib/api";
import { cn, plural } from "@/lib/utils";
import type { MemberBatch, RowResult } from "@/lib/types";
import { Card, PageHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/status";
import { Segmented } from "@/components/ui/primitives";

const TEMPLATE = `Member_ID,Full_Name,Mobile_Number,Date_of_Birth,WhatsApp_Enabled,Status,Remarks
CH0101,Mary Joseph,9876543210,1992-01-05,Yes,Active,
CH0102,John David,9876543211,1985-07-22,No,Active,Prefers a call
`;

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "members-template.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

const STEPS = ["Upload", "Check", "Import"];

export default function ImportPage() {
  const [file, setFile] = useState<File>();
  const verify = useCsvBatch("verify");
  const commit = useCsvBatch("import");

  const verified: MemberBatch | undefined = verify.data ?? (verify.error instanceof ApiError ? verify.error.batch : undefined);
  const step = commit.isSuccess ? 3 : verified || verify.error ? 2 : 1;

  const choose = (f: File) => {
    setFile(f);
    commit.reset();
    verify.mutate(f);
  };
  const restart = () => {
    setFile(undefined);
    verify.reset();
    commit.reset();
  };

  return (
    <div>
      <Link href="/members" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Members
      </Link>
      <PageHeader
        eyebrow="Register"
        title="Import from CSV"
        description="Add or update up to 500 members at once. Nothing is saved until every row passes the check."
      />

      <ol className="mb-6 flex items-center gap-3 animate-rise [animation-delay:40ms]">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = step > n;
          return (
            <li key={s} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  done ? "bg-primary text-primary-ink" : step === n ? "bg-ink text-paper" : "border border-line text-ink-3",
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : n}
              </span>
              <span className={cn("text-sm", step >= n ? "font-medium text-ink" : "text-ink-3")}>{s}</span>
              {n < STEPS.length && <span className="h-px w-8 bg-line sm:w-14" aria-hidden />}
            </li>
          );
        })}
      </ol>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="upload" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <UploadStep onFile={choose} busy={verify.isPending} />
          </motion.div>
        )}
        {step === 2 && (
          <motion.div key="check" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <CheckStep
              file={file!}
              batch={verified}
              error={verify.error}
              committing={commit.isPending}
              commitError={commit.error}
              onRestart={restart}
              onCommit={() =>
                commit.mutate(file!, {
                  onSuccess: (r) => toast.success("Import complete", { description: `${r.summary.add ?? 0} added · ${r.summary.update ?? 0} updated` }),
                })
              }
            />
          </motion.div>
        )}
        {step === 3 && commit.data && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className="flex flex-col items-center px-6 py-14 text-center">
              <span className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
                <CheckCircle2 className="size-7" />
              </span>
              <h2 className="font-display text-3xl text-ink">Register updated</h2>
              <p className="mt-2 text-ink-3">
                {plural(commit.data.summary.add ?? 0, "member")} added, {commit.data.summary.update ?? 0} updated, {commit.data.summary.unchanged ?? 0} unchanged.
              </p>
              <div className="mt-7 flex gap-2">
                <Button variant="secondary" onClick={restart}>
                  <FileUp /> Import another
                </Button>
                <Button asChild>
                  <Link href="/members">View members</Link>
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UploadStep({ onFile, busy }: { onFile: (f: File) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState("");

  const accept = (f?: File) => {
    setErr("");
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) return setErr("Please choose a .csv file. In Excel or Google Sheets use File → Download → CSV.");
    if (f.size > 2 * 1024 * 1024) return setErr("That file is larger than 2 MB. Split it into smaller files.");
    onFile(f);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] [&>*]:min-w-0">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          accept(e.dataTransfer.files[0]);
        }}
        disabled={busy}
        className={cn(
          "grain group flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all",
          drag ? "scale-[1.01] border-primary bg-primary-soft/50" : "border-line-strong bg-card hover:border-primary/60",
        )}
      >
        <span className={cn("mb-5 flex size-14 items-center justify-center rounded-2xl bg-paper-2 text-ink-2 transition-transform", drag ? "-translate-y-1" : "group-hover:-translate-y-0.5")}>
          {busy ? <span className="size-5 animate-spin rounded-full border-2 border-line-strong border-t-primary" /> : <Upload className="size-6" />}
        </span>
        <span className="font-display text-2xl text-ink">{busy ? "Checking your file…" : "Drop your CSV here"}</span>
        <span className="mt-2 text-sm text-ink-3">{busy ? "The automation is validating every row." : "or click to choose a file · up to 500 rows, 2 MB"}</span>
        {err && <span className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{err}</span>}
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => (accept(e.target.files?.[0]), (e.target.value = ""))} />
      </button>

      <aside className="space-y-4 text-sm">
        <Card className="p-5">
          <p className="mb-3 flex items-center gap-2 font-medium text-ink">
            <FileSpreadsheet className="size-4 text-primary" /> Columns
          </p>
          <ul className="space-y-1.5 text-ink-2">
            <li>
              <span className="font-mono text-[13px] text-ink">Member_ID</span> <span className="text-xs text-bad">required</span>
            </li>
            {["Full_Name", "Mobile_Number", "Date_of_Birth (yyyy-mm-dd)", "WhatsApp_Enabled (Yes/No)", "Status (Active/Inactive)", "Remarks"].map((c) => (
              <li key={c} className="font-mono text-[13px]">
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            Headers can be in any case. Empty cells leave existing values unchanged. Extra columns are ignored.
          </p>
          <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={downloadTemplate}>
            <Download /> Download template
          </Button>
        </Card>
      </aside>
    </div>
  );
}

function CheckStep({
  file,
  batch,
  error,
  committing,
  commitError,
  onRestart,
  onCommit,
}: {
  file: File;
  batch?: MemberBatch;
  error: unknown;
  committing: boolean;
  commitError: unknown;
  onRestart: () => void;
  onCommit: () => void;
}) {
  const [filter, setFilter] = useState("all");
  const rows = useMemo(() => batch?.rows ?? [], [batch]);
  const invalid = rows.filter((r) => r.validation_status === "INVALID");
  const warned = rows.filter((r) => r.warnings.length > 0);
  const shown = filter === "invalid" ? invalid : filter === "warnings" ? warned : rows;
  const s = batch?.summary ?? {};
  const changes = (s.add ?? 0) + (s.update ?? 0);
  const parseErrors = !batch && error ? detailLines(error) : [];

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-paper-2 text-ink-2">
          <FileSpreadsheet className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{file.name}</p>
          <p className="text-sm text-ink-3">
            {batch ? plural(rows.length, "row") : "Couldn't be checked"} · {(file.size / 1024).toFixed(1)} KB
          </p>
        </div>
        {batch && (
          <div className="flex flex-wrap gap-2">
            <Pill tone="ok">{s.add ?? 0} new</Pill>
            <Pill tone="info">{plural(s.update ?? 0, "update")}</Pill>
            <Pill tone="mute">{s.unchanged ?? 0} unchanged</Pill>
            {invalid.length > 0 && <Pill tone="bad">{invalid.length} invalid</Pill>}
          </div>
        )}
      </Card>

      {!batch && error ? (
        <div className="rounded-2xl border border-bad/25 bg-bad-soft/60 p-5 text-sm">
          <p className="font-medium text-ink">{errorMessage(error)}</p>
          {parseErrors.length > 0 && (
            <ul className="mt-2 max-h-60 space-y-0.5 overflow-y-auto font-mono text-[13px] text-ink-2">
              {parseErrors.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <p className="text-sm text-ink-2">
              {invalid.length > 0 ? (
                <>
                  <span className="font-medium text-bad">{plural(invalid.length, "row")} {invalid.length === 1 ? "needs" : "need"} fixing</span> before anything can be imported.
                </>
              ) : changes > 0 ? (
                <>
                  <span className="font-medium text-ok">All rows passed.</span> {plural(changes, "change")} ready to import.
                </>
              ) : (
                "All rows passed, but nothing would change."
              )}
            </p>
            <Segmented
              aria-label="Show rows"
              value={filter}
              onValueChange={setFilter}
              options={[
                { value: "all", label: "All", count: rows.length },
                ...(invalid.length ? [{ value: "invalid", label: "Invalid", count: invalid.length }] : []),
                ...(warned.length ? [{ value: "warnings", label: "Notes", count: warned.length }] : []),
              ]}
            />
          </div>
          <div className="max-h-[440px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="w-16 px-5 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Member</th>
                  <th className="px-3 py-2 font-medium">Change</th>
                  <th className="px-5 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => (
                  <RowLine key={`${r.row}-${r.member_id}`} r={r} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {commitError ? <p className="rounded-lg bg-bad-soft px-4 py-3 text-sm text-bad">{errorMessage(commitError)}</p> : null}

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={onRestart} disabled={committing}>
          <RotateCcw /> Choose a different file
        </Button>
        <Button onClick={onCommit} loading={committing} disabled={!batch || invalid.length > 0 || changes === 0}>
          <Upload /> Import {changes > 0 ? plural(changes, "change") : ""}
        </Button>
      </div>
    </div>
  );
}

function RowLine({ r }: { r: RowResult }) {
  const bad = r.validation_status === "INVALID";
  return (
    <tr className={cn(bad && "bg-bad-soft/30")}>
      <td className="px-5 py-2.5 font-mono text-xs text-ink-3">{r.row}</td>
      <td className="px-3 py-2.5 font-mono text-[13px] text-ink">{r.member_id}</td>
      <td className="px-3 py-2.5">
        {bad ? (
          <Pill tone="bad">
            <X className="size-3" /> Invalid
          </Pill>
        ) : r.validation_status === "UNCHANGED" ? (
          <Pill tone="mute" dot={false}>
            No change
          </Pill>
        ) : r.operation === "ADD" ? (
          <Pill tone="ok">New</Pill>
        ) : (
          <Pill tone="info">Update</Pill>
        )}
      </td>
      <td className="px-5 py-2.5 text-[13px]">
        {r.errors.map((e) => (
          <p key={e} className="text-bad">
            {e}
          </p>
        ))}
        {r.warnings.map((w) => (
          <p key={w} className="text-warn">
            {w}
          </p>
        ))}
      </td>
    </tr>
  );
}
