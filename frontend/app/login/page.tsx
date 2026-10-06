import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { Mark } from "@/components/app/brand";
import { APP_NAME, CHURCH_NAME } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign in" };

function Calendar() {
  // Decorative month grid: a few marigold days stand for birthdays.
  const marked = new Set([3, 9, 14, 21, 22, 27]);
  return (
    <div className="grid grid-cols-7 gap-1.5" aria-hidden>
      {Array.from({ length: 35 }, (_, i) => {
        const day = i - 2;
        const valid = day >= 1 && day <= 31;
        return (
          <div
            key={i}
            className={`relative flex aspect-square items-center justify-center rounded-lg text-[11px] ${
              valid ? "bg-white/[0.06] text-white/55" : ""
            } ${marked.has(day) ? "!bg-[var(--marigold)] !text-[#2b1f00] font-semibold" : ""}`}
          >
            {valid ? day : ""}
          </div>
        );
      })}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[#183f32] text-[#f3eee3] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:4px_4px]" />
        <div className="relative flex items-center gap-3">
          <Mark className="bg-[#f3eee3] text-[#183f32]" />
          <span className="font-display text-lg">{APP_NAME}</span>
        </div>

        <div className="relative max-w-md">
          <p className="font-display text-[2.6rem] leading-[1.12] font-light">
            “Rejoice with those who <em className="text-[var(--marigold)] not-italic">rejoice</em>.”
          </p>
          <p className="mt-4 text-sm tracking-wide text-white/60">Romans 12:15</p>
          <div className="mt-12 w-72 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
            <p className="mb-3 text-xs tracking-[0.12em] text-white/50 uppercase">This month</p>
            <Calendar />
          </div>
        </div>

        <p className="relative text-xs text-white/45">
          Every member remembered on their day — sent once, never twice.
        </p>
      </aside>

      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <Mark />
            <span className="font-display text-lg">{APP_NAME}</span>
          </div>
          <p className="eyebrow mb-2">{CHURCH_NAME}</p>
          <h1 className="font-display text-4xl font-normal text-ink">Welcome back</h1>
          <p className="mt-2 text-[15px] text-ink-3">Sign in to manage members and birthday greetings.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
