"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { api } from "~/trpc/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Checkbox } from "~/components/ui/checkbox";
import { Button } from "~/components/ui/button";

interface RepoFilterProps {
  allRepos: string[];
  includedRepos: string[];
}

export function RepoFilter({ allRepos, includedRepos }: RepoFilterProps) {
  const [open, setOpen] = useState(false);
  const utils = api.useUtils();

  const update = api.settings.update.useMutation({
    onMutate: async (input) => {
      await utils.github.getRecap.cancel();
      const prev = utils.github.getRecap.getData();

      if (prev && input.recapIncludedRepos !== undefined) {
        utils.github.getRecap.setData(undefined, {
          ...prev,
          includedRepos: input.recapIncludedRepos,
        });
      }

      return { prev };
    },
    onError: (_err, _input, context) => {
      if (context?.prev) {
        utils.github.getRecap.setData(undefined, context.prev);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        utils.settings.get.invalidate(),
        utils.github.getRecap.invalidate(),
      ]);
    },
  });

  const included = new Set<string>(includedRepos);

  function toggle(repoName: string) {
    const next = new Set(included);
    if (next.has(repoName)) {
      next.delete(repoName);
    } else {
      next.add(repoName);
    }
    update.mutate({ recapIncludedRepos: [...next] });
  }

  function selectAll() {
    update.mutate({ recapIncludedRepos: [...allRepos] });
  }

  function deselectAll() {
    update.mutate({ recapIncludedRepos: ["__none__"] });
  }

  if (!allRepos.length) return null;

  const selectedCount = included.size;
  const label =
    selectedCount === 0
      ? "No repos"
      : selectedCount === allRepos.length
        ? "All repos"
        : `${selectedCount} repo${selectedCount !== 1 ? "s" : ""}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          {label}
          <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
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
        <div className="max-h-64 overflow-y-auto py-1">
          {allRepos.map((repo) => (
            <label
              key={repo}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-secondary"
            >
              <Checkbox
                checked={included.has(repo)}
                onCheckedChange={() => toggle(repo)}
              />
              <span className="truncate font-mono text-xs">{repo}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
