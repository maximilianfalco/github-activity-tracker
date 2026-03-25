"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ActivityBadge } from "~/components/dashboard/activity-badge";
import {
  ActivityFeedSkeleton,
  ROW_HEIGHT,
  timeAgo,
} from "~/components/dashboard/activity-feed";
import {
  extractPullRequestNumber,
  type PullRequestListItem,
} from "~/components/pull-requests/pull-requests-shared";
import { api } from "~/trpc/react";

type PullRequestsListProps = {
  poll: number | false;
  pullRequests: PullRequestListItem[] | undefined;
  isLoading: boolean;
};

export function PullRequestsList({
  poll,
  pullRequests,
  isLoading,
}: PullRequestsListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: pullRequests?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  if (isLoading) {
    return <ActivityFeedSkeleton rows={8} />;
  }

  if (!pullRequests?.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No pull requests found
      </p>
    );
  }

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const pullRequest = pullRequests[virtualRow.index];
          if (!pullRequest) {
            return null;
          }

          return (
            <PullRequestRow
              key={pullRequest.id}
              pullRequest={pullRequest}
              size={virtualRow.size}
              start={virtualRow.start}
              poll={poll}
            />
          );
        })}
      </div>
    </div>
  );
}

function PullRequestRow({
  pullRequest,
  size,
  start,
  poll,
}: {
  pullRequest: PullRequestListItem;
  size: number;
  start: number;
  poll: number | false;
}) {
  return (
    <a
      href={pullRequest.url}
      target="_blank"
      rel="noopener noreferrer"
      className="absolute left-0 top-0 flex w-full items-center gap-2.5 border-b border-border px-1 transition-colors hover:bg-secondary/50"
      style={{
        height: `${size}px`,
        transform: `translateY(${start}px)`,
      }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
      <span className="min-w-0 flex-1 truncate text-xs">
        {pullRequest.title}
      </span>
      {pullRequest.state ? (
        <ActivityBadge
          variant={pullRequest.state as "open" | "draft" | "merged" | "closed"}
        />
      ) : null}
      {pullRequest.ageLabel ? (
        <ActivityBadge variant={pullRequest.ageLabel as "new" | "existing"} />
      ) : null}
      <PullRequestCIBadge
        repoName={pullRequest.repoName}
        prNumber={extractPullRequestNumber(pullRequest.url)}
        initialStatus={pullRequest.ciStatus}
        poll={poll}
      />
      {pullRequest.reviewStatus ? (
        <ActivityBadge
          variant={
            pullRequest.reviewStatus as
              | "approved"
              | "changes_requested"
              | "review_pending"
          }
        />
      ) : null}
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {pullRequest.repoName} · {timeAgo(pullRequest.createdAt)}
      </span>
    </a>
  );
}

function PullRequestCIBadge({
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
}
