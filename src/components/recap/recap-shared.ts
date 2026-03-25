import { type RouterOutputs } from "~/trpc/react";

export type RecapData = RouterOutputs["github"]["getRecap"];
export type RepoTreeItem = RecapData["repoTree"][number];
export type PRTreeItem = RepoTreeItem["prs"][number];
export type ReviewItem = RecapData["reviews"][number];
export type CommitItem = PRTreeItem["commits"][number];
export type DiscussionCommentItem = {
  id: string;
  author: string | null;
  body: string;
  url: string;
  createdAt: Date;
  updatedAt: Date;
};
export type HydratedPRTreeItem = PRTreeItem & { comments: DiscussionCommentItem[] };
export type HydratedRepoTreeItem = Omit<RepoTreeItem, "prs"> & {
  prs: HydratedPRTreeItem[];
};

export type PRDetailState = {
  status: "loading" | "ready" | "error";
  ciStatus: PRTreeItem["ciStatus"];
  reviewStatus: PRTreeItem["reviewStatus"];
  commits: CommitItem[];
  comments: DiscussionCommentItem[];
  message?: string;
};

export type RecapStreamChunk =
  | {
      type: "pr_detail";
      prId: string;
      ciStatus: PRTreeItem["ciStatus"];
      reviewStatus: PRTreeItem["reviewStatus"];
      commits: CommitItem[];
      comments: DiscussionCommentItem[];
    }
  | {
      type: "pr_error";
      prId: string;
      message: string;
    }
  | {
      type: "done";
    };

export type RecapWindowOption =
  | {
      value: "today";
      label: "Today";
    }
  | {
      value: `${number}h`;
      label: string;
      hours: number;
    };

export type RecapSummaryCache = Record<string, string>;
export type RecapViewMode = "cards" | "json";

const HOUR_OPTIONS = [24, 36, 48, 60, 72] as const;

export const RECAP_WINDOW_OPTIONS: RecapWindowOption[] = [
  { value: "today", label: "Today" },
  ...HOUR_OPTIONS.map((hours) => ({
    value: `${hours}h` as const,
    label: `${hours}h`,
    hours,
  })),
];

export function getRecapIncludeComments(settings: unknown) {
  if (!settings || typeof settings !== "object") return false;
  if (!("recapIncludeComments" in settings)) return false;
  return Boolean(
    (settings as { recapIncludeComments?: unknown }).recapIncludeComments,
  );
}

export function mergeRepoTree(
  repoTree: RepoTreeItem[],
  prDetails: Record<string, PRDetailState>,
): HydratedRepoTreeItem[] {
  return repoTree.map((repo) => {
    const prs = repo.prs.map((pr) => {
      const detail = prDetails[pr.id];
      return {
        ...pr,
        ciStatus: detail?.ciStatus ?? pr.ciStatus,
        reviewStatus: detail?.reviewStatus ?? pr.reviewStatus,
        commits: detail?.status === "ready" ? detail.commits : pr.commits,
        comments: detail?.status === "ready" ? detail.comments : [],
      };
    });

    return {
      ...repo,
      commitCount: prs.reduce((sum, pr) => sum + pr.commits.length, 0),
      prs,
    };
  });
}

function formatTimestampForAI(date: Date): string {
  return date.toISOString();
}

export function formatRepoTreeForAI(
  repoTree: HydratedRepoTreeItem[],
  options: {
    includePRs: boolean;
    includeCommits: boolean;
    includeComments: boolean;
  },
): string {
  const lines: string[] = [];

  for (const repo of repoTree) {
    lines.push(`## ${repo.name}`);

    if (repo.prs.length === 0) {
      lines.push("- No current PRs in this active repo.");
      lines.push("");
      continue;
    }

    for (const pr of repo.prs) {
      const prLabel = options.includePRs ? "PR" : "PR context";
      lines.push(
        `- ${prLabel} #${pr.number}: "${pr.title}" [${pr.state}; ${pr.ageLabel}; ci: ${pr.ciStatus ?? "unknown"}; review: ${pr.reviewStatus ?? "unknown"}] ${pr.url} (updated ${formatTimestampForAI(pr.updatedAt)})`,
      );

      if (options.includeCommits) {
        if (pr.commits.length === 0) {
          lines.push("  - No commits from the selected timeframe.");
        } else {
          lines.push("  - Commits:");
          for (const commit of pr.commits) {
            lines.push(
              `    - "${commit.title}" ${commit.url} (${formatTimestampForAI(commit.createdAt)})`,
            );
          }
        }
      }

      if (!options.includeComments) continue;

      if (pr.comments.length === 0) {
        lines.push("  - Recent discussion: none in the selected timeframe.");
        continue;
      }

      lines.push("  - Recent discussion:");
      for (const comment of pr.comments) {
        lines.push(
          `    - ${(comment.author ?? "unknown")}: "${comment.body}" ${comment.url} (${formatTimestampForAI(comment.updatedAt)})`,
        );
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

export function formatReviewsForAI(reviews: ReviewItem[]): string {
  if (reviews.length === 0) return "";

  const lines = ["## Reviews"];
  for (const review of reviews) {
    lines.push(
      `- ${review.repoName}: "${review.title}" [${review.state ?? "unknown"}] ${review.url} (${formatTimestampForAI(review.updatedAt ?? review.createdAt)})`,
    );
  }

  return lines.join("\n");
}

export function getTodayCutoffIso(now = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setHours(6, 0, 0, 0);
  return cutoff.toISOString();
}

export function hashString(value: string): string {
  let hash = 5381;

  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }

  return (hash >>> 0).toString(36);
}

export function readSummaryCache(storageKey: string): RecapSummaryCache {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function writeSummaryCache(
  storageKey: string,
  updater: (cache: RecapSummaryCache) => RecapSummaryCache,
) {
  const nextCache = updater(readSummaryCache(storageKey));

  if (Object.keys(nextCache).length === 0) {
    localStorage.removeItem(storageKey);
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify(nextCache));
}
