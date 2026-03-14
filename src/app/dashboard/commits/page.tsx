"use client";

import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "~/trpc/react";
import { usePollInterval } from "~/hooks/use-poll-interval";
import { Topbar } from "~/components/dashboard/topbar";
import { FilterChips } from "~/components/dashboard/filter-chips";
import {
  ActivityFeedSkeleton,
  timeAgo,
  ROW_HEIGHT,
} from "~/components/dashboard/activity-feed";

const dateOptions = [
  { label: "1 day", value: "1d" as const },
  { label: "7 days", value: "7d" as const },
  { label: "30 days", value: "30d" as const },
  { label: "90 days", value: "90d" as const },
];

export default function CommitsPage() {
  const [dateRange, setDateRange] = useState<"1d" | "7d" | "30d" | "90d">(
    "1d",
  );
  const poll = usePollInterval();
  const commits = api.github.getCommits.useQuery(
    { dateRange },
    { refetchInterval: poll },
  );
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: commits.data?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Commits" />
      <div className="flex min-h-0 flex-1 flex-col p-6">
        <div className="mb-4 flex items-center justify-between">
          <FilterChips
            options={dateOptions}
            value={dateRange}
            onChange={setDateRange}
          />
          {commits.data?.length ? (
            <span className="text-xs text-muted-foreground">
              {commits.data.length} commits
            </span>
          ) : null}
        </div>

        {commits.isLoading ? (
          <ActivityFeedSkeleton rows={8} />
        ) : commits.data?.length ? (
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
                  const commit = commits.data[virtualRow.index]!;
                  return (
                    <a
                      key={commit.id}
                      href={commit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute left-0 top-0 flex w-full items-center gap-2.5 border-b border-border px-1 transition-colors hover:bg-secondary/50"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {commit.title}
                      </span>
                      {commit.branch && (
                        <code className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {commit.branch}
                        </code>
                      )}
                      <code className="shrink-0 text-[11px] text-muted-foreground">
                        {commit.sha?.slice(0, 7)}
                      </code>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {commit.repoName} · {timeAgo(commit.createdAt)}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No commits in this time range
          </p>
        )}
      </div>
    </div>
  );
}
