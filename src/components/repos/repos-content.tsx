"use client";

import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "~/trpc/react";
import { usePollInterval } from "~/hooks/use-poll-interval";
import { FilterChips } from "~/components/dashboard/filter-chips";
import { RepoBar } from "~/components/dashboard/repo-bar";
import { Skeleton } from "~/components/ui/skeleton";

const ROW_HEIGHT = 40;

const sortOptions = [
  { label: "Most active", value: "total" as const },
  { label: "Recent", value: "recent" as const },
];

export function ReposContent() {
  const [sortBy, setSortBy] = useState<"total" | "recent">("total");
  const poll = usePollInterval();
  const repos = api.github.getRepoBreakdown.useQuery(undefined, {
    refetchInterval: poll,
  });
  const parentRef = useRef<HTMLDivElement>(null);

  const sorted = repos.data?.toSorted((a, b) =>
    sortBy === "recent"
      ? b.lastActivityAt.getTime() - a.lastActivityAt.getTime()
      : b.total - a.total,
  );

  const maxTotal =
    repos.data?.reduce((max, repo) => Math.max(max, repo.total), 0) ?? 0;

  const virtualizer = useVirtualizer({
    count: sorted?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      {repos.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 py-2.5">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-1 flex-1" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      ) : sorted?.length ? (
        <>
          <div className="mb-4 flex items-center justify-between">
            <FilterChips
              options={sortOptions}
              value={sortBy}
              onChange={setSortBy}
            />
            <span className="text-xs text-muted-foreground">
              {sorted.length} repos
            </span>
          </div>
          <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
            <div
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const repo = sorted[virtualRow.index];
                if (!repo) {
                  return null;
                }

                return (
                  <div
                    key={repo.repoName}
                    className="absolute left-0 top-0 w-full"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <RepoBar
                      repoName={repo.repoName}
                      commits={repo.commits}
                      prs={repo.prs}
                      maxTotal={maxTotal}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No repository activity found
        </p>
      )}
    </div>
  );
}
