import { type ReactNode } from "react";

interface TooltipProps {
  label: string;
  children: ReactNode;
}

/**
 * Lightweight hover/focus tooltip. The trigger keeps its own semantics; the
 * bubble is `aria-hidden` decorative text mirrored via the child's own label.
 */
export function Tooltip({ label, children }: TooltipProps) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 translate-y-1
                   whitespace-nowrap rounded-lg border border-line-strong bg-elevated px-2.5 py-1.5
                   text-xs text-fg opacity-0 shadow-xl transition-all duration-150
                   group-hover:translate-y-0 group-hover:opacity-100
                   group-focus-within:translate-y-0 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
