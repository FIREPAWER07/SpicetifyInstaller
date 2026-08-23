import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { LuX } from "react-icons/lu";
import { cn } from "../lib/cn";

type Tone = "warn" | "neutral" | "accent";

const surface: Record<Tone, string> = {
  warn: "border-warn/25 bg-warn/[0.06]",
  neutral: "border-line bg-white/[0.03]",
  accent: "border-accent/25 bg-accent/[0.07]",
};

const iconColor: Record<Tone, string> = {
  warn: "text-warn",
  neutral: "text-faint",
  accent: "text-accent",
};

interface NoticeProps {
  icon?: IconType;
  tone?: Tone;
  children: ReactNode;
  onDismiss?: () => void;
}

/** Compact, on-palette inline notice used for legal + contextual warnings. */
export function Notice({ icon: Icon, tone = "neutral", children, onDismiss }: NoticeProps) {
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3", surface[tone])}>
      {Icon && <Icon className={cn("mt-0.5 size-4 shrink-0", iconColor[tone])} />}
      <div className="min-w-0 flex-1 text-sm leading-snug text-muted">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-0.5 rounded-lg p-1 text-faint transition-colors hover:text-fg"
        >
          <LuX className="size-4" />
        </button>
      )}
    </div>
  );
}
