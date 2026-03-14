"use client";

import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "~/trpc/react";
import { usePollInterval } from "~/hooks/use-poll-interval";
import { Topbar } from "~/components/dashboard/topbar";
import { FilterChips } from "~/components/dashboard/filter-chips";
import { ActivityBadge } from "~/components/dashboard/activity-badge";
import { ActivityFeedSkeleton, timeAgo, ROW_HEIGHT } from "~/components/dashboard/activity-feed";

const dateOptions = [
  { label: "1 day", value: "1d" as const },
  { label: "7 days", value: "7d" as const },
  { label: "30 days", value: "30d" as const },
  { label: "90 days", value: "90d" as const },
];

export default function ReviewsPage() {
  const [dateRange, setDateRange] = useState<"1d" | "7d" | "30d" | "90d">("1d");
  const poll = usePollInterval();
  const reviews = api.github.getReviews.useQuery({ dateRange }, {
    refetchInterval: poll,
  });
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: reviews.data?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  return (
    <>
      <Topbar title="Reviews" />
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <FilterChips
            options={dateOptions}
            value={dateRange}
            onChange={setDateRange}
          />
          {reviews.data?.length ? (
            <span className="text-xs text-muted-foreground">
              {reviews.data.length} reviews
            </span>
          ) : null}
        </div>

        {reviews.isLoading ? (
          <ActivityFeedSkeleton rows={8} />
        ) : reviews.data?.length ? (
          <>
            <div
              ref={parentRef}
              className="max-h-[calc(100vh-16rem)] overflow-y-auto"
            >
              <div
                className="relative w-full"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const review = reviews.data[virtualRow.index]!;
                  return (
                    <a
                      key={review.id}
                      href={review.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute left-0 top-0 flex w-full items-center gap-2.5 border-b border-border px-1 transition-colors hover:bg-secondary/50"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {review.title}
                      </span>
                      {review.state && (
                        <ActivityBadge
                          variant={review.state as "open" | "merged" | "closed"}
                        />
                      )}
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {review.repoName} · {timeAgo(review.createdAt)}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No reviews found
          </p>
        )}
      </div>
    </>
  );
}
