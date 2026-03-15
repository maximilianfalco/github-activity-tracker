"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Checkbox } from "~/components/ui/checkbox";
import { Button } from "~/components/ui/button";

const ACTIVITY_TYPES = [
  { value: "commit", label: "Commits" },
  { value: "pr", label: "Pull requests" },
  { value: "review", label: "Reviews" },
] as const;

export type ActivityTypeSet = Set<string>;

interface ActivityTypeFilterProps {
  included: ActivityTypeSet;
  onChange: (next: ActivityTypeSet) => void;
}

export function ActivityTypeFilter({
  included,
  onChange,
}: ActivityTypeFilterProps) {
  const [open, setOpen] = useState(false);

  function toggle(type: string) {
    const next = new Set(included);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    onChange(next);
  }

  function selectAll() {
    onChange(new Set(ACTIVITY_TYPES.map((t) => t.value)));
  }

  function deselectAll() {
    onChange(new Set());
  }

  const label =
    included.size === 0
      ? "No types"
      : included.size === ACTIVITY_TYPES.length
        ? "All types"
        : `${included.size} type${included.size !== 1 ? "s" : ""}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          {label}
          <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <div className="flex gap-1 border-b border-border px-3 py-2">
          <button
            onClick={selectAll}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Select all
          </button>
          <span className="text-[11px] text-muted-foreground">·</span>
          <button
            onClick={deselectAll}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Deselect all
          </button>
        </div>
        <div className="py-1">
          {ACTIVITY_TYPES.map((type) => (
            <label
              key={type.value}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-secondary"
            >
              <Checkbox
                checked={included.has(type.value)}
                onCheckedChange={() => toggle(type.value)}
              />
              <span className="text-xs">{type.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
