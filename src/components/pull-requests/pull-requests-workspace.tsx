"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { usePollInterval } from "~/hooks/use-poll-interval";
import { PullRequestsFilters } from "~/components/pull-requests/pull-requests-filters";
import { PullRequestsList } from "~/components/pull-requests/pull-requests-list";
import {
  type PullRequestDateRange,
  type PullRequestStateFilter,
} from "~/components/pull-requests/pull-requests-shared";

export function PullRequestsWorkspace() {
  const [stateFilter, setStateFilter] = useState<PullRequestStateFilter>("all");
  const [dateRange, setDateRange] = useState<PullRequestDateRange>("7d");
  const poll = usePollInterval();
  const pullRequests = api.github.getPullRequests.useQuery(
    {
      state: stateFilter === "all" ? undefined : stateFilter,
      dateRange,
    },
    {},
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      <PullRequestsFilters
        count={pullRequests.data?.length ?? 0}
        hasResults={Boolean(pullRequests.data?.length)}
        dateRange={dateRange}
        stateFilter={stateFilter}
        onDateRangeChange={setDateRange}
        onStateFilterChange={setStateFilter}
      />

      <PullRequestsList
        poll={poll}
        pullRequests={pullRequests.data}
        isLoading={pullRequests.isLoading}
      />
    </div>
  );
}
