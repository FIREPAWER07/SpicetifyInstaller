import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ---- Shared types (mirror the Rust structs) --------------------------------

export interface Status {
  spicetify_installed: boolean;
  spicetify_version: string | null;
  spotify_installed: boolean;
  spotify_running: boolean;
  has_backup: boolean;
}

export interface SpicetifyUpdate {
  current_version: string | null;
  latest_version: string;
  update_available: boolean;
}

export interface Progress {
  stage: string;
  percent: number | null;
  message: string;
}

export interface LogLine {
  level: "info" | "warn" | "error";
  line: string;
}

export interface AppError {
  kind: string;
  message: string;
}

export const EVENT_PROGRESS = "op:progress";
export const EVENT_LOG = "op:log";

/** True when running inside the Tauri webview (vs. a plain browser preview). */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Normalize an unknown thrown value into an AppError shape. */
export function toAppError(e: unknown): AppError {
  if (e && typeof e === "object" && "message" in e && "kind" in e) {
    return e as AppError;
  }
  return { kind: "other", message: typeof e === "string" ? e : String(e) };
}

// ---- Commands --------------------------------------------------------------

export const getStatus = () => invoke<Status>("get_status");
export const checkSpicetifyUpdate = () => invoke<SpicetifyUpdate>("check_spicetify_update");
export const cancelOperation = () => invoke<void>("cancel_operation");

export const installSpicetify = (marketplace: boolean) =>
  invoke<string>("install_spicetify", { marketplace });
export const backupSpotify = () => invoke<string>("backup_spotify");
export const repairSpicetify = () => invoke<string>("repair_spicetify");
export const applySpicetify = () => invoke<string>("apply_spicetify");
export const uninstallSpicetify = () => invoke<string>("uninstall_spicetify");

/** Human-readable byte size, e.g. 1536 → "1.5 KB". */
export function humanBytes(n: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return u === 0 ? `${n} B` : `${v.toFixed(1)} ${units[u]}`;
}

// ---- Events ----------------------------------------------------------------

export function onProgress(cb: (p: Progress) => void): Promise<UnlistenFn> {
  return listen<Progress>(EVENT_PROGRESS, (e) => cb(e.payload));
}

export function onLog(cb: (l: LogLine) => void): Promise<UnlistenFn> {
  return listen<LogLine>(EVENT_LOG, (e) => cb(e.payload));
}
