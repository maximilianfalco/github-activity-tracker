"use client";

import { api } from "~/trpc/react";
import { usePollInterval } from "~/hooks/use-poll-interval";
import { Topbar } from "~/components/dashboard/topbar";
import {
  MetricCard,
  MetricCardSkeleton,
} from "~/components/dashboard/metric-card";
import {
  ActivityFeed,
  ActivityFeedSkeleton,
} from "~/components/dashboard/activity-feed";

export default function DashboardPage() {
  const poll = usePollInterval();
  const overview = api.github.getOverview.useQuery(undefined, {
    refetchInterval: poll,
  });
  const commits = api.github.getCommits.useQuery(
    { dateRange: "30d" },
    { refetchInterval: poll },
  );
  const prs = api.github.getPullRequests.useQuery(
    { dateRange: "30d" },
    { refetchInterval: poll },
  );
  const reviews = api.github.getReviews.useQuery(
    { dateRange: "30d" },
    { refetchInterval: poll },
  );

  const recentActivity = [
    ...(commits.data?.map((d) => ({ ...d, type: "commit" as const })) ?? []),
    ...(prs.data?.map((d) => ({ ...d, type: "pr" as const })) ?? []),
    ...(reviews.data?.map((d) => ({ ...d, type: "review" as const })) ?? []),
  ]
    .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20);

  return (
    <>
      <Topbar title="Overview" />
      <div className="p-6">
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {overview.isLoading ? (
            <>
              <MetricCardSkeleton />
              <MetricCardSkeleton />
              <MetricCardSkeleton />
            </>
          ) : overview.data ? (
            <>
              <MetricCard
                label="Commits (30d)"
                value={overview.data.commits30d}
                sub={`${overview.data.openPrs} open PRs`}
              />
              <MetricCard
                label="Pull requests"
                value={overview.data.openPrs + overview.data.mergedPrs}
                sub={`${overview.data.openPrs} open · ${overview.data.mergedPrs} merged`}
              />
              <MetricCard
                label="Reviews given"
                value={overview.data.reviewsGiven}
                sub="last 30 days"
              />
            </>
          ) : null}
        </div>

        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Recent activity
        </h2>
        {commits.isLoading ? (
          <ActivityFeedSkeleton />
        ) : (
          <ActivityFeed items={recentActivity} />
        )}
      </div>
    </>
  );
}
