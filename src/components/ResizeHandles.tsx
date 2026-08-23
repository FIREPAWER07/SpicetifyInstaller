import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";
import { isTauri } from "../lib/api";
import { cn } from "../lib/cn";

// Mirrors the (non-exported) ResizeDirection union from @tauri-apps/api/window.
type ResizeDir =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

/**
 * Invisible edge/corner grips that restore native-style resizing on a frameless
 * window. Sits below modals (z-40) so overlays keep priority; corners come last
 * so they win over edges at the shared coordinates.
 */
const HANDLES: { dir: ResizeDir; cls: string }[] = [
  { dir: "North", cls: "top-0 inset-x-0 h-1 cursor-ns-resize" },
  { dir: "South", cls: "bottom-0 inset-x-0 h-1 cursor-ns-resize" },
  { dir: "West", cls: "left-0 inset-y-0 w-1 cursor-ew-resize" },
  { dir: "East", cls: "right-0 inset-y-0 w-1 cursor-ew-resize" },
  { dir: "NorthWest", cls: "top-0 left-0 size-2 cursor-nwse-resize" },
  { dir: "NorthEast", cls: "top-0 right-0 size-2 cursor-nesw-resize" },
  { dir: "SouthWest", cls: "bottom-0 left-0 size-2 cursor-nesw-resize" },
  { dir: "SouthEast", cls: "bottom-0 right-0 size-2 cursor-nwse-resize" },
];

export function ResizeHandles() {
  if (!isTauri) return null;

  const start = (dir: ResizeDir) => (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      void getCurrentWindow().startResizeDragging(dir).catch(() => {});
    } catch {
      /* window API unavailable */
    }
  };

  return (
    <>
      {HANDLES.map((h) => (
        <div key={h.dir} onMouseDown={start(h.dir)} className={cn("fixed z-40", h.cls)} />
      ))}
    </>
  );
}
