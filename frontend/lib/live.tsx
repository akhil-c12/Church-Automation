"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { keys } from "./queries";
import type { Run } from "./types";

export type LiveStatus = "connecting" | "live" | "offline";

const LiveContext = createContext<LiveStatus>("connecting");
export const useLiveStatus = () => useContext(LiveContext);

const RESULT_COPY: Record<string, string> = {
  COMPLETED: "All birthday messages went out",
  COMPLETED_WITH_FAILURES: "Some messages failed",
  COMPLETED_NEEDS_ATTENTION: "Some messages need review",
  NO_BIRTHDAYS: "No birthdays to send",
};

/**
 * Subscribes to the backend's SSE stream. When n8n finishes a run, every view
 * that could have changed is refreshed and the admin gets a toast.
 */
export function LiveEventsProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>("connecting");

  useEffect(() => {
    const es = new EventSource("/api/events");
    const refresh = (executionId?: string) => {
      for (const key of [keys.dashboard, keys.runs(), keys.messages(), keys.preview(), keys.members()]) {
        void qc.invalidateQueries({ queryKey: key });
      }
      if (executionId) void qc.invalidateQueries({ queryKey: keys.run(executionId) });
    };

    es.onopen = () => setStatus("live");
    es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? "offline" : "connecting");

    es.addEventListener("run.completed", (e) => {
      try {
        const { run } = JSON.parse((e as MessageEvent).data) as { run: Partial<Run> };
        refresh(run.execution_id);
        const text = RESULT_COPY[run.result ?? ""] ?? "Birthday run finished";
        const detail = `${run.sent ?? 0} sent · ${run.failed ?? 0} failed${run.needs_review ? ` · ${run.needs_review} to review` : ""}`;
        if (run.result === "COMPLETED" || run.result === "NO_BIRTHDAYS") toast.success(text, { description: detail });
        else toast.warning(text, { description: detail });
      } catch {
        refresh();
      }
    });

    es.addEventListener("workflow.failed", (e) => {
      refresh();
      let node = "";
      try {
        node = (JSON.parse((e as MessageEvent).data) as { failed_node?: string }).failed_node ?? "";
      } catch {}
      toast.error("The automation workflow failed", { description: node ? `Failed at: ${node}` : "Check the run history." });
    });

    return () => es.close();
  }, [qc]);

  return <LiveContext.Provider value={status}>{children}</LiveContext.Provider>;
}
