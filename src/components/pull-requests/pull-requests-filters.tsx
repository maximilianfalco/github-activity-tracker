"use client";

import { FilterChips } from "~/components/dashboard/filter-chips";
import {
  pullRequestDateOptions,
  pullRequestStateOptions,
  type PullRequestDateRange,
  type PullRequestStateFilter,
} from "~/components/pull-requests/pull-requests-shared";

type PullRequestsFiltersProps = {
  count: number;
  hasResults: boolean;
  dateRange: PullRequestDateRange;
  stateFilter: PullRequestStateFilter;
  onDateRangeChange: (value: PullRequestDateRange) => void;
  onStateFilterChange: (value: PullRequestStateFilter) => void;
};

export function PullRequestsFilters({
  count,
  hasResults,
  dateRange,
  stateFilter,
  onDateRangeChange,
  onStateFilterChange,
}: PullRequestsFiltersProps) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex flex-wrap gap-3">
        <FilterChips
          options={pullRequestStateOptions}
          value={stateFilter}
          onChange={onStateFilterChange}
        />
        <FilterChips
          options={pullRequestDateOptions}
          value={dateRange}
          onChange={onDateRangeChange}
        />
      </div>

      {hasResults ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {count} pull requests
        </span>
      ) : null}
    </div>
  );
}
