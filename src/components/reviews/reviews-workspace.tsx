"use client";

import { useEffect, useState } from "react";
import { api } from "~/trpc/react";
import { usePollInterval } from "~/hooks/use-poll-interval";
import { useIsMobile } from "~/hooks/use-mobile";
import { ReviewsFilters } from "~/components/reviews/reviews-filters";
import { ReviewsList } from "~/components/reviews/reviews-list";
import {
  REVIEWS_TERMINAL_STORAGE_KEY,
  type ReviewDateRange,
  type ReviewFilter,
} from "~/components/reviews/reviews-shared";
import { ReviewsTerminalDrawer } from "~/components/reviews/reviews-terminal-drawer";
import { ReviewsTerminalPanel } from "~/components/reviews/reviews-terminal-panel";
import { cn } from "~/lib/utils";

export function ReviewsWorkspace() {
  const [filter, setFilter] = useState<ReviewFilter>("reviewed");
  const [dateRange, setDateRange] = useState<ReviewDateRange>("1d");
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return (
      window.localStorage.getItem(REVIEWS_TERMINAL_STORAGE_KEY) === "true"
    );
  });
  const poll = usePollInterval();
  const isMobile = useIsMobile();
  const reviews = api.github.getReviews.useQuery(
    { dateRange, filter },
    {
      refetchInterval: poll,
    },
  );

  useEffect(() => {
    setExpandedReviewId(null);
  }, [filter, dateRange]);

  useEffect(() => {
    window.localStorage.setItem(
      REVIEWS_TERMINAL_STORAGE_KEY,
      isTerminalOpen ? "true" : "false",
    );
  }, [isTerminalOpen]);

  const handleToggleReview = (reviewId: string) => {
    setExpandedReviewId((current) => (current === reviewId ? null : reviewId));
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 overflow-hidden p-6">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col",
              !isMobile && isTerminalOpen ? "pr-4" : "",
            )}
          >
            <ReviewsFilters
              dateRange={dateRange}
              filter={filter}
              hasResults={Boolean(reviews.data?.length)}
              isTerminalOpen={isTerminalOpen}
              resultCount={reviews.data?.length ?? 0}
              onDateRangeChange={setDateRange}
              onFilterChange={setFilter}
              onToggleTerminal={() =>
                setIsTerminalOpen((current) => !current)
              }
            />

            <ReviewsList
              expandedReviewId={expandedReviewId}
              filter={filter}
              isLoading={reviews.isLoading}
              reviews={reviews.data}
              onToggleReview={handleToggleReview}
            />
          </div>

          {!isMobile && (
            <div
              className={cn(
                "min-h-0 shrink-0 overflow-hidden self-stretch border-l border-transparent transition-[width,opacity] duration-200 ease-out",
                isTerminalOpen ? "w-[460px] opacity-100" : "w-0 opacity-0",
              )}
            >
              {isTerminalOpen ? (
                <ReviewsTerminalPanel
                  onCollapse={() => setIsTerminalOpen(false)}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>

      {isMobile ? (
        <ReviewsTerminalDrawer
          isOpen={isTerminalOpen}
          onOpenChange={setIsTerminalOpen}
        />
      ) : null}
    </>
  );
}
