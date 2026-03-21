"use client";

import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "~/trpc/react";
import { usePollInterval } from "~/hooks/use-poll-interval";
import { Topbar } from "~/components/dashboard/topbar";
import { FilterChips } from "~/components/dashboard/filter-chips";
import { ActivityBadge } from "~/components/dashboard/activity-badge";
import {
  ActivityFeedSkeleton,
  timeAgo,
  ROW_HEIGHT,
} from "~/components/dashboard/activity-feed";

const stateOptions = [
  { label: "All", value: "all" as const },
  { label: "Open", value: "open" as const },
  { label: "Merged", value: "merged" as const },
  { label: "Closed", value: "closed" as const },
];

const dateOptions = [
  { label: "1 day", value: "1d" as const },
  { label: "7 days", value: "7d" as const },
  { label: "30 days", value: "30d" as const },
  { label: "90 days", value: "90d" as const },
];

export default function PullRequestsPage() {
  const [stateFilter, setStateFilter] = useState<
    "all" | "open" | "merged" | "closed"
  >("all");
  const [dateRange, setDateRange] = useState<"1d" | "7d" | "30d" | "90d">("7d");
  const parentRef = useRef<HTMLDivElement>(null);

  const poll = usePollInterval();
  const prs = api.github.getPullRequests.useQuery({
    state: stateFilter === "all" ? undefined : stateFilter,
    dateRange,
  }, { refetchInterval: poll });

  const virtualizer = useVirtualizer({
    count: prs.data?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Pull requests" />
      <div className="flex min-h-0 flex-1 flex-col p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <FilterChips
              options={stateOptions}
              value={stateFilter}
              onChange={setStateFilter}
            />
            <FilterChips
              options={dateOptions}
              value={dateRange}
              onChange={setDateRange}
            />
          </div>
          {prs.data?.length ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {prs.data.length} pull requests
            </span>
          ) : null}
        </div>

        {prs.isLoading ? (
          <ActivityFeedSkeleton rows={8} />
        ) : prs.data?.length ? (
          <>
            <div
              ref={parentRef}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <div
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const pr = prs.data[virtualRow.index]!;
                return (
                  <a
                    key={pr.id}
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-border hover:bg-secondary/50 absolute top-0 left-0 flex w-full items-center gap-2.5 border-b px-1 transition-colors"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {pr.title}
                    </span>
                    {pr.state && (
                      <ActivityBadge
                        variant={pr.state as "open" | "merged" | "closed"}
                      />
                    )}
                    {pr.reviewStatus && (
                      <ActivityBadge
                        variant={
                          pr.reviewStatus as
                            | "approved"
                            | "changes_requested"
                            | "review_pending"
                        }
                      />
                    )}
                    <span className="text-muted-foreground shrink-0 text-[11px]">
                      {pr.repoName} · {timeAgo(pr.createdAt)}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
          </>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No pull requests found
          </p>
        )}
      </div>
    </div>
  );
}
