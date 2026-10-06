"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useLogin } from "@/lib/queries";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/** Only same-site relative paths, so ?next= can't bounce the user to another site. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.startsWith("/login")) return "/today";
  return raw;
}

export function LoginForm() {
  const params = useSearchParams();
  const login = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(
      { username: username.trim(), password },
      // Full navigation so the app boots with a clean cache under the new session.
      { onSuccess: () => window.location.assign(safeNext(params.get("next"))) },
    );
  };

  const err = login.error;
  const message =
    err instanceof ApiError
      ? err.status === 401
        ? "That username and password don't match."
        : err.status === 429
          ? "Too many attempts. Wait 15 minutes and try again."
          : err.message
      : err
        ? "Something went wrong. Try again."
        : "";

  return (
    <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
      <Field label="Username">
        {(p) => (
          <Input
            {...p}
            autoComplete="username"
            autoFocus
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="h-11"
          />
        )}
      </Field>
      <Field label="Password">
        {(p) => (
          <div className="relative">
            <Input
              {...p}
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 pr-11"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-md p-1.5 text-ink-3 hover:text-ink"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        )}
      </Field>

      {message && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2.5 text-sm text-bad animate-fade">
          {message}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" loading={login.isPending} disabled={!username || !password}>
        Sign in
      </Button>
      <p className="flex items-center justify-center gap-1.5 pt-2 text-xs text-ink-3">
        <LockKeyhole className="size-3" /> Secure session · expires automatically
      </p>
    </form>
  );
}
