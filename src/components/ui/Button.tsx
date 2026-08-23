import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  "inline-flex items-center justify-center gap-2 font-medium rounded-xl select-none " +
  "transition-[transform,background,box-shadow,opacity] duration-150 " +
  "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 " +
  "disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]";

const variants: Record<Variant, string> = {
  primary:
    "text-white bg-gradient-to-b from-accent to-accent-soft shadow-[0_8px_24px_-10px_rgba(235,90,55,0.65)] hover:brightness-110",
  secondary:
    "text-fg bg-elevated border border-line-strong hover:bg-[#242432] hover:border-white/20",
  ghost: "text-muted hover:text-fg hover:bg-white/5",
  danger:
    "text-danger bg-danger/10 border border-danger/25 hover:bg-danger/15 hover:border-danger/40",
};

const sizes: Record<Size, string> = {
  sm: "text-sm px-3 py-1.5",
  md: "text-sm px-4 py-2.5",
  lg: "text-base px-5 py-3",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", className, ...props }, ref) => (
    <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} {...props} />
  ),
);
Button.displayName = "Button";
