"use client";

import { useEffect, useReducer } from "react";
import type { ScanEvent, ScanSummary } from "./engine";
import { summarize } from "./engine";
import type { ClaimablePosition, PositionCategory } from "./types";

export type AdapterStatus = "scanning" | "done" | "failed";

export interface AdapterState {
  id: string;
  name: string;
  category: PositionCategory;
  status: AdapterStatus;
  ms?: number;
  count?: number;
  error?: string;
}

export interface ScanState {
  phase: "connecting" | "scanning" | "done" | "error";
  error?: string;
  adapters: AdapterState[];
  positions: ClaimablePosition[];
  /** Live totals while streaming; replaced by the server's summary at the end. */
  summary: ScanSummary;
  log: string[];
  ms?: number;
}

const initial: ScanState = {
  phase: "connecting",
  adapters: [],
  positions: [],
  summary: summarize([]),
  log: [],
};

type Action =
  { type: "event"; event: ScanEvent } | { type: "error"; message: string } | { type: "reset" };

export function scanReducer(state: ScanState, action: Action): ScanState {
  if (action.type === "reset") return initial;
  if (action.type === "error") return { ...state, phase: "error", error: action.message };

  const e = action.event;
  switch (e.type) {
    case "scan_started":
      return {
        ...state,
        phase: "scanning",
        adapters: e.adapters.map((a) => ({ ...a, status: "scanning" })),
        log: [...state.log, `[start] ${e.adapters.length} adapters`],
      };
    case "adapter_started":
      return state;
    case "adapter_done": {
      const positions = [...state.positions, ...e.positions];
      return {
        ...state,
        positions,
        summary: summarize([
          { type: "adapter_done", adapterId: "*", positions, ms: 0, dropped: 0 },
        ]),
        adapters: state.adapters.map((a) =>
          a.id === e.adapterId ? { ...a, status: "done", ms: e.ms, count: e.positions.length } : a,
        ),
        log: [...state.log, `[ok]   ${e.adapterId} · ${e.positions.length} found · ${e.ms}ms`],
      };
    }
    case "adapter_failed":
      return {
        ...state,
        adapters: state.adapters.map((a) =>
          a.id === e.adapterId ? { ...a, status: "failed", ms: e.ms, error: e.error } : a,
        ),
        log: [...state.log, `[fail] ${e.adapterId} · ${e.timedOut ? "timed out" : e.error}`],
      };
    case "scan_done":
      return {
        ...state,
        phase: "done",
        summary: e.summary,
        ms: e.ms,
        log: [...state.log, `[done] ${e.summary.positionCount} positions · ${e.ms}ms`],
      };
  }
}

/** Opens the NDJSON stream from /api/scan and folds events into state. */
export function useScan(address: string) {
  const [state, dispatch] = useReducer(scanReducer, initial);

  useEffect(() => {
    const controller = new AbortController();
    dispatch({ type: "reset" });

    (async () => {
      const res = await fetch(`/api/scan?address=${encodeURIComponent(address)}`, {
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Scan failed (${res.status})`);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let finished = false;
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ScanEvent;
          if (event.type === "scan_done") finished = true;
          dispatch({ type: "event", event });
        }
      }
      if (!finished) throw new Error("Connection dropped before the scan finished.");
    })().catch((err: unknown) => {
      if (controller.signal.aborted) return;
      dispatch({ type: "error", message: err instanceof Error ? err.message : "Scan failed" });
    });

    return () => controller.abort();
  }, [address]);

  return state;
}
