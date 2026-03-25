"use client";

import { FilterChips } from "~/components/dashboard/filter-chips";
import { Button } from "~/components/ui/button";
import {
  reviewDateOptions,
  reviewFilterOptions,
  type ReviewDateRange,
  type ReviewFilter,
} from "~/components/reviews/reviews-shared";

type ReviewsFiltersProps = {
  dateRange: ReviewDateRange;
  filter: ReviewFilter;
  hasResults: boolean;
  isTerminalOpen: boolean;
  resultCount: number;
  onDateRangeChange: (value: ReviewDateRange) => void;
  onFilterChange: (value: ReviewFilter) => void;
  onToggleTerminal: () => void;
};

export function ReviewsFilters({
  dateRange,
  filter,
  hasResults,
  isTerminalOpen,
  resultCount,
  onDateRangeChange,
  onFilterChange,
  onToggleTerminal,
}: ReviewsFiltersProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChips
          options={reviewFilterOptions}
          value={filter}
          onChange={onFilterChange}
        />
        {filter === "reviewed" ? (
          <FilterChips
            options={reviewDateOptions}
            value={dateRange}
            onChange={onDateRangeChange}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {hasResults ? (
          <span className="text-xs text-muted-foreground">
            {resultCount} {filter === "to_review" ? "pull requests" : "reviews"}
          </span>
        ) : null}
        <Button
          variant={isTerminalOpen ? "secondary" : "outline"}
          size="sm"
          onClick={onToggleTerminal}
        >
          {isTerminalOpen ? "Hide terminal" : "Terminal"}
        </Button>
      </div>
    </div>
  );
}
