import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LuCircleCheck,
  LuCircleX,
  LuChevronDown,
  LuTerminal,
  LuLoader,
  LuBan,
  LuRotateCw,
  LuCopy,
  LuCheck,
} from "react-icons/lu";
import { Button } from "./ui/Button";
import { ProgressBar } from "./ui/ProgressBar";
import { cn } from "../lib/cn";
import type { OperationState } from "../hooks/useOperation";

interface OperationPanelProps {
  state: OperationState;
  onCancel: () => void;
  onRetry: () => void;
  onClose: () => void;
  reduceMotion?: boolean;
}

const logColor: Record<string, string> = {
  info: "text-muted",
  warn: "text-warn",
  error: "text-danger",
};

export function OperationPanel({
  state,
  onCancel,
  onRetry,
  onClose,
  reduceMotion,
}: OperationPanelProps) {
  const open = state.phase !== "idle";
  const running = state.phase === "running";
  const [showLogs, setShowLogs] = useState(false);
  const [copied, setCopied] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const copyAll = async () => {
    const parts: string[] = [];
    if (state.label) parts.push(`# ${state.label}`);
    if (state.result) parts.push(state.result);
    if (state.error) parts.push(`Error [${state.error.kind}]: ${state.error.message}`);
    if (state.logs.length) {
      parts.push("");
      parts.push(...state.logs.map((l) => `[${l.level}] ${l.line}`));
    }
    try {
      await navigator.clipboard.writeText(parts.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  // Auto-open logs on error; keep pinned to the newest line.
  useEffect(() => {
    if (state.phase === "error") setShowLogs(true);
  }, [state.phase]);

  useEffect(() => {
    if (showLogs && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [state.logs, showLogs]);

  // Escape closes when not running.
  useEffect(() => {
    if (!open || running) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, running, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={running ? undefined : onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${state.label ?? "Operation"} progress`}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="surface-card relative z-10 w-full max-w-lg rounded-2xl p-6"
          >
            <Header state={state} />

            {running && (
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{state.progress?.stage ?? "Working…"}</span>
                  <span className="tabular-nums text-faint">
                    {state.progress?.percent != null
                      ? `${Math.round(state.progress.percent)}%`
                      : ""}
                  </span>
                </div>
                <ProgressBar percent={state.progress?.percent} reduceMotion={reduceMotion} />
                <p className="min-h-5 text-sm text-muted">{state.progress?.message ?? ""}</p>
              </div>
            )}

            {(state.phase === "success" ||
              state.phase === "error" ||
              state.phase === "cancelled") && (
              <p className="mt-4 select-text whitespace-pre-wrap text-sm text-muted">
                {state.phase === "success"
                  ? state.result
                  : state.phase === "cancelled"
                    ? "The operation was cancelled. Nothing was left half-applied."
                    : state.error?.message}
              </p>
            )}

            {state.logs.length > 0 && (
              <div className="mt-5">
                <button
                  onClick={() => setShowLogs((v) => !v)}
                  className="flex items-center gap-2 text-sm text-faint transition-colors hover:text-fg"
                  aria-expanded={showLogs}
                >
                  <LuTerminal className="size-4" />
                  Technical logs ({state.logs.length})
                  <LuChevronDown
                    className={cn("size-4 transition-transform", showLogs && "rotate-180")}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {showLogs && (
                    <motion.div
                      initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div
                        ref={logRef}
                        className="mt-3 max-h-52 select-text overflow-y-auto rounded-xl border border-line bg-black/40 p-3 font-mono text-xs leading-relaxed"
                      >
                        {state.logs.map((l, i) => (
                          <div key={i} className={cn("whitespace-pre-wrap", logColor[l.level])}>
                            {l.line}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-2">
              <div>
                {!running && (state.logs.length > 0 || state.result || state.error) && (
                  <Button variant="ghost" size="sm" onClick={copyAll} aria-label="Copy logs">
                    {copied ? (
                      <>
                        <LuCheck className="size-4 text-success" />
                        Copied
                      </>
                    ) : (
                      <>
                        <LuCopy className="size-4" />
                        Copy
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {running ? (
                  <Button variant="danger" onClick={onCancel}>
                    <LuBan className="size-4" />
                    Cancel
                  </Button>
                ) : (
                  <>
                    {state.phase === "error" && (
                      <Button variant="secondary" onClick={onRetry}>
                        <LuRotateCw className="size-4" />
                        Try again
                      </Button>
                    )}
                    <Button
                      variant={state.phase === "success" ? "primary" : "secondary"}
                      onClick={onClose}
                    >
                      Close
                    </Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Header({ state }: { state: OperationState }) {
  const map = {
    running: { icon: LuLoader, tone: "text-accent", spin: true, title: state.label ?? "Working" },
    success: { icon: LuCircleCheck, tone: "text-success", spin: false, title: "Success" },
    error: { icon: LuCircleX, tone: "text-danger", spin: false, title: "Something went wrong" },
    cancelled: { icon: LuBan, tone: "text-faint", spin: false, title: "Cancelled" },
    idle: { icon: LuLoader, tone: "text-muted", spin: false, title: "" },
  } as const;
  const m = map[state.phase];
  const Icon = m.icon;
  return (
    <div className="flex items-center gap-3">
      <span className={cn("grid size-10 place-items-center rounded-xl bg-white/5", m.tone)}>
        <Icon className={cn("size-5", m.spin && "animate-spin")} />
      </span>
      <div>
        <h2 className="text-lg font-semibold">{m.title}</h2>
        {state.label && state.phase === "running" && (
          <p className="text-xs text-faint">Working on your Spotify — please wait</p>
        )}
      </div>
    </div>
  );
}
