import { HugeiconsIcon } from "@hugeicons/react";
import {
  GitCommitIcon,
  GitPullRequestIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { ActivityBadge } from "~/components/dashboard/activity-badge";
import { timeAgo } from "~/components/dashboard/activity-feed";
import { type ActivityPRTreeItem } from "~/components/recap/recap-pr-tree-section";

export function PRTreeCard({
  pr,
  showPRs,
  showCommits,
}: {
  pr: ActivityPRTreeItem;
  showPRs: boolean;
  showCommits: boolean;
}) {
  return (
    <div className="border-border/80 bg-background/60 rounded-md border">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <HugeiconsIcon
          icon={GitPullRequestIcon}
          size={14}
          className="shrink-0 text-blue-600"
        />
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate text-xs font-medium hover:underline"
        >
          {showPRs ? pr.title : `PR #${pr.number}: ${pr.title}`}
        </a>
        {showPRs ? <ActivityBadge variant={pr.state} /> : null}
        {showPRs ? <ActivityBadge variant={pr.ageLabel} /> : null}
        {showPRs && pr.ciStatus ? <ActivityBadge variant={pr.ciStatus} /> : null}
        {showPRs && pr.reviewStatus ? (
          <ActivityBadge variant={pr.reviewStatus} />
        ) : null}
        <span className="text-muted-foreground text-[11px]">
          #{pr.number} · updated {timeAgo(pr.updatedAt)}
        </span>
      </div>

      {showCommits ? (
        <div className="border-border/70 border-t px-1 py-3">
          {pr.detailState === "loading" ? (
            <div className="text-muted-foreground flex items-center gap-2 px-3 text-[11px]">
              <HugeiconsIcon icon={RefreshIcon} size={12} className="animate-spin" />
              <p>Fetching commits...</p>
            </div>
          ) : pr.detailState === "error" ? (
            <p className="text-muted-foreground px-3 text-[11px]">
              {pr.detailMessage ?? "Failed to fetch commits for this PR."}
            </p>
          ) : pr.commits.length ? (
            <div className="space-y-2">
              {pr.commits.map((commit) => (
                <a
                  key={commit.id}
                  href={commit.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:bg-secondary/40 flex items-center gap-2 rounded-sm px-1 py-1 transition-colors"
                >
                  <HugeiconsIcon
                    icon={GitCommitIcon}
                    size={14}
                    className="shrink-0 text-green-600"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {commit.title}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-[11px]">
                    {timeAgo(commit.createdAt)}
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground px-3 text-[11px]">
              No commits landed in the selected timeframe for this PR.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
