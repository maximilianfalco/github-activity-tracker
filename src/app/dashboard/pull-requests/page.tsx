"use client";

import { memo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api, type RouterOutputs } from "~/trpc/react";
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
  { label: "Draft", value: "draft" as const },
  { label: "Merged", value: "merged" as const },
  { label: "Closed", value: "closed" as const },
];

const dateOptions = [
  { label: "1 day", value: "1d" as const },
  { label: "7 days", value: "7d" as const },
  { label: "30 days", value: "30d" as const },
  { label: "90 days", value: "90d" as const },
];

type PullRequestListItem = RouterOutputs["github"]["getPullRequests"][number];

function extractPullRequestNumber(url: string): number | undefined {
  const match = /\/pull\/(\d+)(?:\/|$)/.exec(url);
  const value = match?.[1];
  return value ? Number(value) : undefined;
}

const PullRequestCIBadge = memo(function PullRequestCIBadge({
  repoName,
  prNumber,
  initialStatus,
  poll,
}: {
  repoName: string;
  prNumber: number | undefined;
  initialStatus:
    | "ci_passing"
    | "ci_failing"
    | "ci_pending"
    | "ci_unknown"
    | undefined;
  poll: number | false;
}) {
  const ciStatus = api.github.getPullRequestCIStatus.useQuery(
    {
      repoName,
      prNumber: prNumber ?? 1,
    },
    {
      enabled: prNumber !== undefined,
      initialData: initialStatus ?? "ci_unknown",
      refetchInterval: poll,
    },
  );

  return <ActivityBadge variant={ciStatus.data ?? "ci_unknown"} />;
});

const PullRequestRow = memo(function PullRequestRow({
  pr,
  size,
  start,
  poll,
}: {
  pr: PullRequestListItem;
  size: number;
  start: number;
  poll: number | false;
}) {
  return (
    <a
      key={pr.id}
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      className="border-border hover:bg-secondary/50 absolute top-0 left-0 flex w-full items-center gap-2.5 border-b px-1 transition-colors"
      style={{
        height: `${size}px`,
        transform: `translateY(${start}px)`,
      }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
      <span className="min-w-0 flex-1 truncate text-xs">{pr.title}</span>
      {pr.state && (
        <ActivityBadge
          variant={pr.state as "open" | "draft" | "merged" | "closed"}
        />
      )}
      {pr.ageLabel && (
        <ActivityBadge variant={pr.ageLabel as "new" | "existing"} />
      )}
      <PullRequestCIBadge
        repoName={pr.repoName}
        prNumber={extractPullRequestNumber(pr.url)}
        initialStatus={pr.ciStatus}
        poll={poll}
      />
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
});

export default function PullRequestsPage() {
  const [stateFilter, setStateFilter] = useState<
    "all" | "open" | "draft" | "merged" | "closed"
  >("all");
  const [dateRange, setDateRange] = useState<"1d" | "7d" | "30d" | "90d">("7d");
  const parentRef = useRef<HTMLDivElement>(null);

  const poll = usePollInterval();
  const prs = api.github.getPullRequests.useQuery(
    {
      state: stateFilter === "all" ? undefined : stateFilter,
      dateRange,
    },
    {},
  );

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
            <span className="text-muted-foreground shrink-0 text-xs">
              {prs.data.length} pull requests
            </span>
          ) : null}
        </div>

        {prs.isLoading ? (
          <ActivityFeedSkeleton rows={8} />
        ) : prs.data?.length ? (
          <>
            <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
              <div
                className="relative w-full"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const pr = prs.data[virtualRow.index]!;
                  return (
                    <PullRequestRow
                      key={pr.id}
                      pr={pr}
                      size={virtualRow.size}
                      start={virtualRow.start}
                      poll={poll}
                    />
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
