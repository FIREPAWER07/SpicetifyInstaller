import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelOperation,
  onLog,
  onProgress,
  toAppError,
  type AppError,
  type LogLine,
  type Progress,
} from "../lib/api";
import type { UnlistenFn } from "@tauri-apps/api/event";

export type OpPhase = "idle" | "running" | "success" | "error" | "cancelled";

export interface OperationState {
  phase: OpPhase;
  /** Human label of the active operation, e.g. "Install". */
  label: string | null;
  progress: Progress | null;
  logs: LogLine[];
  result: string | null;
  error: AppError | null;
}

/** Helpers handed to a local (non-backend-event) runner so it can drive the UI. */
export interface LocalHandle {
  progress: (p: Progress) => void;
  log: (l: LogLine) => void;
}

const initial: OperationState = {
  phase: "idle",
  label: null,
  progress: null,
  logs: [],
  result: null,
  error: null,
};

/**
 * Drives a single long-running operation and tracks its phase, progress, logs,
 * and result. `run` wires up backend `op:progress`/`op:log` events for the
 * duration; `runLocal` lets a frontend-driven flow (e.g. the Tauri updater) push
 * progress directly. Both share one state shape so the OperationPanel is reused.
 */
export function useOperation() {
  const [state, setState] = useState<OperationState>(initial);
  const unlisteners = useRef<UnlistenFn[]>([]);
  const lastRun = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    unlisteners.current.forEach((u) => u());
    unlisteners.current = [];
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const succeed = useCallback((result: string) => {
    setState((s) => ({ ...s, phase: "success", result, progress: null }));
  }, []);

  const fail = useCallback((e: unknown) => {
    const error = toAppError(e);
    setState((s) => ({
      ...s,
      phase: error.kind === "cancelled" ? "cancelled" : "error",
      error,
      progress: null,
    }));
  }, []);

  const run = useCallback(
    async (label: string, fn: () => Promise<string>) => {
      lastRun.current = () => void run(label, fn);
      cleanup();
      setState({ ...initial, phase: "running", label });

      unlisteners.current.push(
        await onProgress((p) => setState((s) => ({ ...s, progress: p }))),
        await onLog((l) => setState((s) => ({ ...s, logs: [...s.logs, l] }))),
      );

      try {
        succeed(await fn());
      } catch (e) {
        fail(e);
      } finally {
        cleanup();
      }
    },
    [cleanup, succeed, fail],
  );

  const runLocal = useCallback(
    async (label: string, fn: (h: LocalHandle) => Promise<string>) => {
      lastRun.current = () => void runLocal(label, fn);
      cleanup();
      setState({ ...initial, phase: "running", label });

      const handle: LocalHandle = {
        progress: (p) => setState((s) => ({ ...s, progress: p })),
        log: (l) => setState((s) => ({ ...s, logs: [...s.logs, l] })),
      };

      try {
        succeed(await fn(handle));
      } catch (e) {
        fail(e);
      }
    },
    [cleanup, succeed, fail],
  );

  const retry = useCallback(() => lastRun.current?.(), []);

  const cancel = useCallback(async () => {
    try {
      await cancelOperation();
    } catch {
      /* best-effort */
    }
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setState(initial);
  }, [cleanup]);

  return { state, run, runLocal, retry, cancel, reset };
}
