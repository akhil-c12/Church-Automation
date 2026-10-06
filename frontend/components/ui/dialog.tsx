"use client";

import type { ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  side,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** "right" renders a slide-over sheet instead of a centred dialog. */
  side?: "right";
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px] data-[state=open]:animate-fade" />
      <D.Content
        className={cn(
          "fixed z-50 flex flex-col border-line bg-card shadow-lg focus:outline-none",
          side === "right"
            ? "inset-y-0 right-0 w-full max-w-md border-l data-[state=open]:animate-[sheet-in_0.3s_cubic-bezier(0.2,0.7,0.2,1)]"
            : "top-1/2 left-1/2 max-h-[85dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border data-[state=open]:animate-[dialog-in_0.2s_ease-out]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 pt-5 pb-4">
          <div className="space-y-1">
            <D.Title className="font-display text-xl font-medium text-ink">{title}</D.Title>
            {description ? (
              <D.Description className="text-sm text-ink-3">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</D.Description>
            )}
          </div>
          <D.Close className="-mr-2 rounded-lg p-1.5 text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="-mx-6 -mb-5 mt-6 flex flex-wrap justify-end gap-2 border-t border-line bg-paper-2/50 px-6 py-4">{children}</div>;
}
