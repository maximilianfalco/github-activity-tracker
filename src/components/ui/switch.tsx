"use client";

import { cn } from "~/lib/utils";

type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
};

export function Switch({
  checked,
  onCheckedChange,
  className,
  disabled = false,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-4 w-7 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-green-600" : "bg-muted",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
          checked ? "left-3.5" : "left-0.5",
        )}
      />
    </button>
  );
}
