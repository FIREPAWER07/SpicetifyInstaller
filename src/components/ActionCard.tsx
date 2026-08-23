import { motion } from "framer-motion";
import type { IconType } from "react-icons";
import { Card } from "./ui/Card";
import { cn } from "../lib/cn";

export interface ActionCardProps {
  icon: IconType;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  reduceMotion?: boolean;
}

export function ActionCard({
  icon: Icon,
  title,
  description,
  onClick,
  disabled,
  danger,
  reduceMotion,
}: ActionCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={reduceMotion || disabled ? undefined : { y: -3 }}
      whileTap={reduceMotion || disabled ? undefined : { scale: 0.985 }}
      transition={{ duration: 0.15 }}
      className="text-left focus-visible:outline-none disabled:cursor-not-allowed"
    >
      <Card
        className={cn(
          "h-full p-4 transition-colors duration-150",
          disabled ? "opacity-45" : "hover:border-line-strong",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl border",
              danger
                ? "border-danger/25 bg-danger/10 text-danger"
                : "border-accent/20 bg-accent/10 text-accent",
            )}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold leading-tight">{title}</h3>
            <p className="mt-1 text-sm leading-snug text-muted">{description}</p>
          </div>
        </div>
      </Card>
    </motion.button>
  );
}
