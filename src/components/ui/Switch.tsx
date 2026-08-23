import { cn } from "../../lib/cn";

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
}

export function Switch({ checked, onChange, label, id }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200",
        checked ? "bg-accent/90 border-accent" : "bg-white/8 border-line-strong",
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 -translate-y-1/2 h-4.5 w-4.5 rounded-full bg-white shadow transition-[left] duration-200",
          checked ? "left-[22px]" : "left-[3px]",
        )}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}
