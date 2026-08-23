import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LuMinus, LuSquare, LuCopy, LuX } from "react-icons/lu";
import { isTauri } from "../lib/api";
import { cn } from "../lib/cn";
import logo from "../assets/img/logo-spicetify.png";

/**
 * Custom frameless title bar. The bar itself is a Tauri drag region; the control
 * buttons stay interactive as (non-drag) children. Falls back to inert controls
 * in browser preview where the window API is unavailable.
 */
/** Resolve the current window without ever throwing (guards against API/runtime
 * shape mismatches that would otherwise crash render if called in an effect). */
function currentWindow() {
  if (!isTauri) return null;
  try {
    return getCurrentWindow();
  } catch (e) {
    console.error("Window API unavailable:", e);
    return null;
  }
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = currentWindow();
    if (!win) return;
    let unlisten: (() => void) | undefined;
    win.isMaximized().then(setMaximized).catch(() => {});
    win
      .onResized(() => win.isMaximized().then(setMaximized).catch(() => {}))
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  const minimize = () => void currentWindow()?.minimize().catch(() => {});
  const toggleMaximize = () => void currentWindow()?.toggleMaximize().catch(() => {});
  const close = () => void currentWindow()?.close().catch(() => {});

  return (
    <div
      data-tauri-drag-region
      onDoubleClick={toggleMaximize}
      className="relative z-20 flex h-9 shrink-0 select-none items-center justify-between border-b border-line"
    >
      <div data-tauri-drag-region className="flex items-center gap-2 px-3">
        <img src={logo} alt="" draggable={false} className="size-4 rounded" />
        <span className="text-xs font-medium text-muted">Spicetify Installer</span>
      </div>

      <div className="flex h-full">
        <WindowButton onClick={minimize} label="Minimize">
          <LuMinus className="size-4" />
        </WindowButton>
        <WindowButton onClick={toggleMaximize} label={maximized ? "Restore" : "Maximize"}>
          {maximized ? <LuCopy className="size-3.5" /> : <LuSquare className="size-3.5" />}
        </WindowButton>
        <WindowButton onClick={close} label="Close" danger>
          <LuX className="size-4" />
        </WindowButton>
      </div>
    </div>
  );
}

function WindowButton({
  onClick,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-full w-11 place-items-center text-faint transition-colors",
        danger ? "hover:bg-danger hover:text-white" : "hover:bg-white/8 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
