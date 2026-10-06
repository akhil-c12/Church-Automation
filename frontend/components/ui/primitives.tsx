"use client";

import type { ReactNode } from "react";
import { Select as S, Switch as Sw, ToggleGroup, Tooltip as T, Checkbox as Cb } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- Select ----------

export interface Option {
  value: string;
  label: string;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  id,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
}) {
  return (
    <S.Root value={value} onValueChange={onValueChange}>
      <S.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border border-line bg-card px-3 text-sm text-ink shadow-sm transition-colors hover:border-line-strong focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/15 data-[placeholder]:text-ink-3",
          className,
        )}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon>
          <ChevronDown className="size-4 text-ink-3" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-line bg-card p-1 shadow-lg animate-fade"
        >
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center rounded-lg py-1.5 pr-8 pl-2.5 text-sm text-ink-2 outline-none data-[highlighted]:bg-paper-2 data-[highlighted]:text-ink data-[state=checked]:font-medium data-[state=checked]:text-ink"
              >
                <S.ItemText>{o.label}</S.ItemText>
                <S.ItemIndicator className="absolute right-2.5">
                  <Check className="size-3.5 text-primary" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}

// ---------- Switch ----------

export function Switch({
  checked,
  onCheckedChange,
  id,
  disabled,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <Sw.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-line-strong transition-colors data-[state=checked]:bg-primary disabled:opacity-50"
    >
      <Sw.Thumb className="block size-4 translate-x-0.5 rounded-full bg-card shadow-sm transition-transform duration-200 data-[state=checked]:translate-x-[18px]" />
    </Sw.Root>
  );
}

// ---------- Checkbox ----------

export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  "aria-label": ariaLabel,
}: {
  checked: boolean | "indeterminate";
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <Cb.Root
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      disabled={disabled}
      aria-label={ariaLabel}
      className="flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border border-line-strong bg-card transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Cb.Indicator className="text-primary-ink">
        {checked === "indeterminate" ? <span className="block h-0.5 w-2.5 rounded bg-current" /> : <Check className="size-3.5" strokeWidth={3} />}
      </Cb.Indicator>
    </Cb.Root>
  );
}

// ---------- Segmented control ----------

export function Segmented({
  value,
  onValueChange,
  options,
  "aria-label": ariaLabel,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: (Option & { count?: number })[];
  "aria-label": string;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v)}
      aria-label={ariaLabel}
      className={cn("inline-flex rounded-[10px] border border-line bg-paper-2/70 p-0.5", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium whitespace-nowrap text-ink-3 transition-all hover:text-ink data-[state=on]:bg-card data-[state=on]:text-ink data-[state=on]:shadow-sm"
        >
          {o.label}
          {o.count !== undefined && <span className="num text-xs text-ink-3">{o.count}</span>}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

// ---------- Tooltip ----------

export function Tip({ content, children, side = "top" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-64 rounded-lg bg-ink px-2.5 py-1.5 text-xs leading-snug text-paper shadow-lg animate-fade"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
