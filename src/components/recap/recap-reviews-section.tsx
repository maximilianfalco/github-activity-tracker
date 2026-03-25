import { HugeiconsIcon } from "@hugeicons/react";
import { EyeIcon } from "@hugeicons/core-free-icons";
import { ActivityBadge } from "~/components/dashboard/activity-badge";
import { timeAgo } from "~/components/dashboard/activity-feed";
import { type ReviewItem } from "~/components/recap/recap-shared";

export function RecapReviewsSection({
  visibleReviews,
}: {
  visibleReviews: ReviewItem[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          icon={EyeIcon}
          size={14}
          className="text-muted-foreground"
        />
        <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          Reviews
        </h3>
      </div>

      {visibleReviews.length ? (
        <div className="space-y-2">
          {visibleReviews.map((review) => (
            <a
              key={review.id}
              href={review.url}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border hover:bg-secondary/50 flex items-center gap-3 rounded-md border px-3 py-2 transition-colors"
            >
              <HugeiconsIcon
                icon={EyeIcon}
                size={14}
                className="shrink-0 text-amber-600"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{review.title}</p>
                <p className="text-muted-foreground text-[11px]">
                  {review.repoName} · {timeAgo(review.updatedAt ?? review.createdAt)}
                </p>
              </div>
              {review.state ? <ActivityBadge variant={review.state} /> : null}
            </a>
          ))}
        </div>
      ) : (
        <p className="border-border text-muted-foreground rounded-md border border-dashed px-4 py-6 text-sm">
          No reviews in the selected timeframe.
        </p>
      )}
    </section>
  );
}
