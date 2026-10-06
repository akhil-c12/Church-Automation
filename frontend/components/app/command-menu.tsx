"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog } from "radix-ui";
import { CalendarHeart, FileUp, History, Loader2, MessageCircle, Search, Send, UserPlus, Users } from "lucide-react";
import { useMembers } from "@/lib/queries";
import { Avatar } from "@/components/ui/display";
import { formatDay } from "@/lib/dates";

const PAGES = [
  { href: "/today", label: "Today", icon: CalendarHeart },
  { href: "/members", label: "Members", icon: Users },
  { href: "/members/new", label: "Add a member", icon: UserPlus },
  { href: "/send", label: "Send birthday wishes", icon: Send },
  { href: "/messages", label: "Message log", icon: MessageCircle },
  { href: "/runs", label: "Run history", icon: History },
  { href: "/import", label: "Import from CSV", icon: FileUp },
];

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useCommandMenu() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 250);
  const searching = query.length >= 2;
  const members = useMembers({ q: query, page_size: 8 }, open && searching);

  const pages = PAGES.filter((p) => !q || p.label.toLowerCase().includes(q.toLowerCase()));

  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-[2px] animate-fade" />
        <Dialog.Content className="fixed top-[14vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-card shadow-lg animate-fade focus:outline-none">
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Dialog.Description className="sr-only">Find a member or jump to a page</Dialog.Description>
          <Command shouldFilter={false} loop className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.09em] [&_[cmdk-group-heading]]:text-ink-3 [&_[cmdk-group-heading]]:uppercase">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-4 text-ink-3" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search members by name, ID or phone…"
                className="h-13 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
              />
              {searching && members.isFetching && <Loader2 className="size-4 animate-spin text-ink-3" />}
            </div>
            <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
              {searching && (
                <Command.Group heading="Members">
                  {members.data?.members.length === 0 && !members.isFetching && (
                    <p className="px-3 py-6 text-center text-sm text-ink-3">No members match “{query}”.</p>
                  )}
                  {members.data?.members.map((m) => (
                    <Item key={m.member_id} value={`m-${m.member_id}`} onSelect={() => go(`/members/${encodeURIComponent(m.member_id)}`)}>
                      <Avatar name={m.full_name} size="sm" />
                      <span className="flex-1 truncate text-ink">{m.full_name}</span>
                      <span className="font-mono text-xs text-ink-3">{m.member_id}</span>
                      <span className="hidden text-xs text-ink-3 sm:inline">{formatDay(m.date_of_birth)}</span>
                    </Item>
                  ))}
                </Command.Group>
              )}
              {pages.length > 0 && (
                <Command.Group heading="Go to">
                  {pages.map((p) => (
                    <Item key={p.href} value={p.href} onSelect={() => go(p.href)}>
                      <p.icon className="size-4 text-ink-3" />
                      <span className="text-ink">{p.label}</span>
                    </Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Item({ children, value, onSelect }: { children: React.ReactNode; value: string; onSelect: () => void }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-paper-2"
    >
      {children}
    </Command.Item>
  );
}
