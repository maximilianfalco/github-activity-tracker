"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { RefreshIcon } from "@hugeicons/core-free-icons";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";

export function RefreshButton() {
  const utils = api.useUtils();
  const refresh = api.github.refresh.useMutation({
    onSuccess: async () => {
      await utils.github.invalidate();
    },
  });

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => refresh.mutate()}
      disabled={refresh.isPending}
      className="gap-1.5 text-xs text-muted-foreground"
    >
      <HugeiconsIcon
        icon={RefreshIcon}
        size={14}
        className={refresh.isPending ? "animate-spin" : ""}
      />
      {refresh.isPending ? "Syncing..." : "Refresh"}
    </Button>
  );
}
