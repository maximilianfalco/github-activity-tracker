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
        {overview.isLoading ? (
          <ActivityFeedSkeleton />
        ) : (
          <ActivityFeed items={overview.data?.recentActivity ?? []} />
        )}
      </div>
    </>
  );
}
