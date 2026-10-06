"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { CalendarHeart, FileUp, History, LogOut, Menu, MessageCircle, Search, Send, UserPlus, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout, useMe } from "@/lib/queries";
import { LiveEventsProvider, useLiveStatus } from "@/lib/live";
import { Wordmark } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { CommandMenu, useCommandMenu } from "./command-menu";
import { Avatar, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/primitives";

const NAV = [
  { href: "/today", label: "Today", icon: CalendarHeart },
  { href: "/members", label: "Members", icon: Users },
  { href: "/send", label: "Send wishes", icon: Send },
  { href: "/messages", label: "Message log", icon: MessageCircle },
  { href: "/runs", label: "Run history", icon: History },
  { href: "/import", label: "Import CSV", icon: FileUp },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-0.5" aria-label="Main">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/today" && pathname.startsWith(`${href}/`) && !(href === "/members" && pathname === "/members/new"));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-card text-ink shadow-sm" : "text-ink-2 hover:bg-card/60 hover:text-ink",
            )}
          >
            {active && <span className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-marigold" aria-hidden />}
            <Icon className={cn("size-[18px]", active ? "text-primary" : "text-ink-3 group-hover:text-ink-2")} strokeWidth={1.8} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function LiveDot() {
  const status = useLiveStatus();
  const copy = {
    live: ["Live", "Run results appear here the moment n8n reports them."],
    connecting: ["Connecting…", "Trying to reach the live update stream."],
    offline: ["Offline", "Live updates are paused. Pages still refresh on their own."],
  }[status];
  return (
    <Tip content={copy[1]} side="right">
      <span className="inline-flex cursor-default items-center gap-2 text-xs text-ink-3">
        <span className="relative flex size-2">
          {status === "live" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-50" />}
          <span className={cn("relative inline-flex size-2 rounded-full", status === "live" ? "bg-ok" : status === "connecting" ? "bg-warn" : "bg-mute")} />
        </span>
        {copy[0]}
      </span>
    </Tip>
  );
}


function SidebarBody({ onNavigate, onSearch }: { onNavigate?: () => void; onSearch: () => void }) {
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const signOut = async () => {
    await logout();
    qc.clear(); // drop every cached member/phone number from memory
    router.replace("/login");
  };
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-6 pb-5">
        <Wordmark />
      </div>

      <div className="space-y-2 px-3">
        <button
          onClick={onSearch}
          className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-[10px] border border-line bg-card px-3 text-sm text-ink-3 shadow-sm transition-colors hover:border-line-strong hover:text-ink-2"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded border border-line bg-paper px-1.5 font-mono text-[10px] text-ink-3">⌘K</kbd>
        </button>
        <Button asChild variant="primary" className="w-full">
          <Link href="/members/new" onClick={onNavigate}>
            <UserPlus /> Add member
          </Link>
        </Button>
      </div>

      <div className="mt-6 flex-1 overflow-y-auto px-3">
        <NavLinks onNavigate={onNavigate} />
      </div>

      <div className="border-t border-line px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <LiveDot />
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-3">
          {me.data ? <Avatar name={me.data.username} size="sm" /> : <Skeleton className="size-7 rounded-full" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{me.data?.username ?? "…"}</p>
            <p className="text-xs text-ink-3">Administrator</p>
          </div>
          <Tip content="Sign out">
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-bad-soft hover:text-bad"
            >
              <LogOut className="size-4" />
            </button>
          </Tip>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const { open, setOpen } = useCommandMenu();
  const [drawer, setDrawer] = useState(false);

  // The proxy already redirects visitors without a cookie; this covers expired sessions.
  if (me.isPending || me.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-ink-3 animate-fade">
          <span className="size-2 animate-ping rounded-full bg-marigold" /> Opening the register…
        </div>
      </div>
    );
  }

  return (
    <LiveEventsProvider>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-line bg-paper-2 lg:block">
          <SidebarBody onSearch={() => setOpen(true)} />
        </aside>

        <Dialog.Root open={drawer} onOpenChange={setDrawer}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30 animate-fade lg:hidden" />
            <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-72 border-r border-line bg-paper-2 shadow-lg animate-rise focus:outline-none lg:hidden">
              <Dialog.Title className="sr-only">Navigation</Dialog.Title>
              <Dialog.Description className="sr-only">Main navigation</Dialog.Description>
              <Dialog.Close className="absolute top-6 right-4 rounded-lg p-1.5 text-ink-3 hover:bg-card" aria-label="Close menu">
                <X className="size-4" />
              </Dialog.Close>
              <SidebarBody onNavigate={() => setDrawer(false)} onSearch={() => (setDrawer(false), setOpen(true))} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-paper/85 px-4 py-3 backdrop-blur lg:hidden">
            <button onClick={() => setDrawer(true)} aria-label="Open menu" className="rounded-lg p-1.5 text-ink-2 hover:bg-paper-2">
              <Menu className="size-5" />
            </button>
            <Wordmark className="[&_p+p]:hidden [&>span]:size-8" />
            <button onClick={() => setOpen(true)} aria-label="Search" className="ml-auto rounded-lg p-1.5 text-ink-2 hover:bg-paper-2">
              <Search className="size-5" />
            </button>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-16 sm:px-6 lg:px-10 lg:pt-12">{children}</main>
        </div>
      </div>
      <CommandMenu open={open} onOpenChange={setOpen} />
    </LiveEventsProvider>
  );
}
