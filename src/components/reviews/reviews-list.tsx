"use client";

import { useState } from "react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ActivityBadge } from "~/components/dashboard/activity-badge";
import { ActivityFeedSkeleton, timeAgo } from "~/components/dashboard/activity-feed";
import { PullRequestDetailPanel } from "~/components/reviews/pull-request-detail-panel";
import { type ReviewFilter, type ReviewListItem } from "~/components/reviews/reviews-shared";
import { Button } from "~/components/ui/button";

type ReviewsListProps = {
  expandedReviewId: string | null;
  filter: ReviewFilter;
  isLoading: boolean;
  reviews: ReviewListItem[] | undefined;
  onToggleReview: (reviewId: string) => void;
};

export function ReviewsList({
  expandedReviewId,
  filter,
  isLoading,
  reviews,
  onToggleReview,
}: ReviewsListProps) {
  const [copiedReviewId, setCopiedReviewId] = useState<string | null>(null);

  async function handleCopy(reviewId: string, url: string) {
    await navigator.clipboard.writeText(url);
    setCopiedReviewId(reviewId);
    window.setTimeout(() => {
      setCopiedReviewId((current) => (current === reviewId ? null : current));
    }, 2000);
  }

  if (isLoading) {
    return <ActivityFeedSkeleton rows={8} />;
  }

  if (!reviews?.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {filter === "to_review"
          ? "No open pull requests are currently requesting your review"
          : "No reviews found"}
      </p>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="rounded-lg border border-border bg-card/40">
        {reviews.map((review) => (
          <ReviewRow
            key={review.id}
            review={review}
            expanded={expandedReviewId === review.id}
            copied={copiedReviewId === review.id}
            onCopy={() => void handleCopy(review.id, review.url)}
            onToggle={() => onToggleReview(review.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ReviewRow({
  review,
  expanded,
  copied,
  onCopy,
  onToggle,
}: {
  review: ReviewListItem;
  expanded: boolean;
  copied: boolean;
  onCopy: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-2.5 px-4 py-3 transition-colors hover:bg-secondary/50">
        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          className="shrink-0 p-1"
          onClick={onCopy}
          aria-label={copied ? "Pull request link copied" : "Copy pull request link"}
          title={copied ? "Copied" : "Copy link"}
        >
          <HugeiconsIcon icon={Copy01Icon} size={14} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          className="shrink-0 p-1"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? "Collapse pull request details"
              : "Expand pull request details"
          }
          title={expanded ? "Collapse" : "Expand"}
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={14}
            className={expanded ? "rotate-180 transition-transform" : "transition-transform"}
          />
        </Button>
        <a
          href={review.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <span className="min-w-0 truncate text-xs">{review.title}</span>
          <div className="ml-auto flex shrink-0 items-center justify-end gap-2.5">
            {review.author ? (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                Author: {review.author}
              </span>
            ) : null}
            {review.state ? <ActivityBadge variant={review.state} /> : null}
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {review.repoName} · {timeAgo(review.createdAt)}
            </span>
          </div>
        </a>
      </div>
      {expanded ? (
        <div className="px-3 pb-4 pt-1">
          <PullRequestDetailPanel review={review} />
        </div>
      ) : null}
    </div>
  );
}
