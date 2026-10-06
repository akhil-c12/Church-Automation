"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Tip } from "@/components/ui/primitives";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "light", "dark"];
const ICON = { system: Monitor, light: Sun, dark: Moon };
const LABEL = { system: "Theme: system", light: "Theme: light", dark: "Theme: dark" };
const EVENT = "themechange";

function read(): Theme {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (next !== "system") root.classList.add(next);
    try {
      if (next === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  };

  const Icon = ICON[theme];
  return (
    <Tip content={LABEL[theme]}>
      <button
        onClick={cycle}
        aria-label={LABEL[theme]}
        className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-paper hover:text-ink"
      >
        <Icon className="size-4" />
      </button>
    </Tip>
  );
}
