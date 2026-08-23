import { motion } from "framer-motion";
import { cn } from "../../lib/cn";

interface ProgressBarProps {
  /** 0–100 for determinate; null/undefined renders an indeterminate bar. */
  percent?: number | null;
  className?: string;
  reduceMotion?: boolean;
}

export function ProgressBar({ percent, className, reduceMotion }: ProgressBarProps) {
  const indeterminate = percent == null;
  const clamped = Math.max(0, Math.min(100, percent ?? 0));

  return (
    <div
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-white/8", className)}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {indeterminate ? (
        <motion.div
          className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-accent to-accent-2"
          animate={reduceMotion ? { x: "120%" } : { x: ["-40%", "320%"] }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 1.1, repeat: Infinity, ease: "easeInOut" }
          }
        />
      ) : (
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
          initial={false}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: reduceMotion ? 0 : 0.3, ease: "easeOut" }}
        />
      )}
    </div>
  );
}
