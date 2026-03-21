"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SparklesIcon,
  Copy01Icon,
  Download04Icon,
  Share01Icon,
  GitPullRequestIcon,
  GitCommitIcon,
  EyeIcon,
} from "@hugeicons/core-free-icons";
import { api, type RouterOutputs } from "~/trpc/react";
import { usePollInterval } from "~/hooks/use-poll-interval";
import { Topbar } from "~/components/dashboard/topbar";
import {
  MetricCard,
  MetricCardSkeleton,
} from "~/components/dashboard/metric-card";
import { ActivityBadge } from "~/components/dashboard/activity-badge";
import {
  ActivityFeedSkeleton,
  timeAgo,
} from "~/components/dashboard/activity-feed";
import { RepoFilter } from "~/components/dashboard/repo-filter";
import { ActivityTypeFilter } from "~/components/dashboard/activity-type-filter";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Card, CardContent } from "~/components/ui/card";

type RecapData = RouterOutputs["github"]["getRecap"];
type RepoTreeItem = RecapData["repoTree"][number];
type PRTreeItem = RepoTreeItem["prs"][number];
type ReviewItem = RecapData["reviews"][number];
type CommitItem = PRTreeItem["commits"][number];

type PRDetailState = {
  status: "loading" | "ready" | "error";
  reviewStatus: PRTreeItem["reviewStatus"];
  commits: CommitItem[];
  message?: string;
};

type RecapStreamChunk =
  | {
      type: "pr_detail";
      prId: string;
      reviewStatus: PRTreeItem["reviewStatus"];
      commits: CommitItem[];
    }
  | {
      type: "pr_error";
      prId: string;
      message: string;
    }
  | {
      type: "done";
    };

function mergeRepoTree(
  repoTree: RepoTreeItem[],
  prDetails: Record<string, PRDetailState>,
): RepoTreeItem[] {
  return repoTree.map((repo) => {
    const prs = repo.prs.map((pr) => {
      const detail = prDetails[pr.id];
      return {
        ...pr,
        reviewStatus: detail?.reviewStatus ?? pr.reviewStatus,
        commits: detail?.status === "ready" ? detail.commits : pr.commits,
      };
    });

    return {
      ...repo,
      commitCount: prs.reduce((sum, pr) => sum + pr.commits.length, 0),
      prs,
    };
  });
}

function formatRepoTreeForAI(
  repoTree: RepoTreeItem[],
  options: {
    includePRs: boolean;
    includeCommits: boolean;
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
        `- ${prLabel} #${pr.number}: "${pr.title}" [${pr.state}; review: ${pr.reviewStatus ?? "unknown"}] ${pr.url} (updated ${timeAgo(pr.updatedAt)})`,
      );

      if (!options.includeCommits) continue;

      if (pr.commits.length === 0) {
        lines.push("  - No commits from the selected timeframe.");
        continue;
      }

      lines.push("  - Commits:");
      for (const commit of pr.commits) {
        lines.push(
          `    - "${commit.title}" ${commit.url} (${timeAgo(commit.createdAt)})`,
        );
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

function formatReviewsForAI(reviews: ReviewItem[]): string {
  if (reviews.length === 0) return "";

  const lines = ["## Reviews"];
  for (const review of reviews) {
    lines.push(
      `- ${review.repoName}: "${review.title}" [${review.state ?? "unknown"}] ${review.url} (${timeAgo(review.updatedAt ?? review.createdAt)})`,
    );
  }

  return lines.join("\n");
}

const HOUR_OPTIONS = [24, 36, 48, 60, 72] as const;

export default function RecapPage() {
  const [hours, setHours] = useState(24);
  const [includedTypes, setIncludedTypes] = useState(
    () => new Set(["commit", "pr", "review"]),
  );
  const [prDetails, setPrDetails] = useState<Record<string, PRDetailState>>({});
  const [isHydratingDetails, setIsHydratingDetails] = useState(false);

  const poll = usePollInterval();
  const recap = api.github.getRecap.useQuery(
    { hours },
    { refetchInterval: poll },
  );

  const showPRs = includedTypes.has("pr");
  const showCommits = includedTypes.has("commit");
  const showReviews = includedTypes.has("review");
  const showTree = showPRs || showCommits;

  const repoTreeShell = recap.data?.repoTree ?? [];
  const repoTree = mergeRepoTree(repoTreeShell, prDetails);
  const visibleReviews = showReviews ? (recap.data?.reviews ?? []) : [];
  const streamPrs = repoTreeShell.flatMap((repo) =>
    repo.prs.map((pr) => ({
      id: pr.id,
      repoName: pr.repoName,
      number: pr.number,
      updatedAt: pr.updatedAt,
    })),
  );
  const streamKey = [
    hours,
    ...streamPrs.map((pr) => `${pr.id}:${pr.updatedAt.toISOString()}`),
  ].join("|");

  useEffect(() => {
    if (streamPrs.length === 0) {
      setPrDetails({});
      setIsHydratingDetails(false);
      return;
    }

    const controller = new AbortController();

    setPrDetails(
      Object.fromEntries(
        streamPrs.map((pr) => [
          pr.id,
          {
            status: "loading" as const,
            reviewStatus: null,
            commits: [],
          },
        ]),
      ),
    );
    setIsHydratingDetails(true);

    void (async () => {
      try {
        const res = await fetch("/api/recap-tree-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hours,
            prs: streamPrs.map(({ id, repoName, number }) => ({
              id,
              repoName,
              number,
            })),
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error("Failed to start recap stream");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const chunk = JSON.parse(line) as RecapStreamChunk;

            if (chunk.type === "pr_detail") {
              setPrDetails((prev) => ({
                ...prev,
                [chunk.prId]: {
                  status: "ready",
                  reviewStatus: chunk.reviewStatus,
                  commits: chunk.commits.map((commit) => ({
                    ...commit,
                    createdAt: new Date(commit.createdAt),
                  })),
                },
              }));
              continue;
            }

            if (chunk.type === "pr_error") {
              setPrDetails((prev) => ({
                ...prev,
                [chunk.prId]: {
                  status: "error",
                  reviewStatus: null,
                  commits: [],
                  message: chunk.message,
                },
              }));
              continue;
            }

            if (chunk.type === "done") {
              setIsHydratingDetails(false);
            }
          }
        }

        setIsHydratingDetails(false);
      } catch (error) {
        if (controller.signal.aborted) return;

        setPrDetails((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([prId, detail]) => [
              prId,
              detail.status === "ready"
                ? detail
                : {
                    status: "error" as const,
                    reviewStatus: null,
                    commits: [],
                    message:
                      error instanceof Error
                        ? error.message
                        : "Failed to fetch PR details.",
                  },
            ]),
          ),
        );
        setIsHydratingDetails(false);
      }
    })();

    return () => controller.abort();
  }, [hours, streamKey]);

  const treeItemCount = repoTree.reduce((sum, repo) => {
    const prCount = showPRs ? repo.prs.length : 0;
    const commitCount = showCommits
      ? repo.prs.reduce((repoSum, pr) => repoSum + pr.commits.length, 0)
      : 0;

    return sum + prCount + commitCount;
  }, 0);
  const visibleItemCount = treeItemCount + visibleReviews.length;
  const hasSelectedActivity =
    visibleItemCount > 0 || (showTree && repoTree.length > 0);

  const exportPayload = {
    repoTree: showTree ? repoTree : [],
    reviews: visibleReviews,
  };

  const STORAGE_KEY = "recap-summary";
  const [completion, setCompletion] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setCompletion(saved);
  }, []);
  const [isGenerating, setIsGenerating] = useState(false);

  function updateCompletion(text: string) {
    setCompletion(text);
    if (text) {
      localStorage.setItem(STORAGE_KEY, text);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const settings = api.settings.get.useQuery();

  async function handleGenerate() {
    if (!hasSelectedActivity || isHydratingDetails) return;
    setIsGenerating(true);
    updateCompletion("");

    const sections: string[] = [];
    if (showTree) {
      sections.push(
        formatRepoTreeForAI(repoTree, {
          includePRs: showPRs,
          includeCommits: showCommits,
        }),
      );
    }
    if (showReviews) {
      sections.push(formatReviewsForAI(visibleReviews));
    }

    const res = await fetch("/api/recap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activities: sections.filter(Boolean).join("\n\n"),
        customRule: settings.data?.recapCustomRule ?? undefined,
      }),
    });

    if (!res.ok || !res.body) {
      setIsGenerating(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      setCompletion(text);
    }

    localStorage.setItem(STORAGE_KEY, text);
    setIsGenerating(false);
  }

  return (
    <div className="h-full overflow-y-auto">
      <Topbar title="Recap" />
      <div className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="border-border bg-background h-6 rounded-md border px-2 text-xs"
          >
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </select>
          <ActivityTypeFilter
            included={includedTypes}
            onChange={setIncludedTypes}
          />
          <RepoFilter
            allRepos={recap.data?.allRepos ?? []}
            includedRepos={recap.data?.includedRepos ?? []}
          />
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={handleGenerate}
            disabled={
              isGenerating || !hasSelectedActivity || isHydratingDetails
            }
          >
            <HugeiconsIcon
              icon={SparklesIcon}
              size={14}
              className={isGenerating ? "animate-pulse" : ""}
            />
            {isGenerating ? "Generating..." : "Generate Recap"}
          </Button>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {recap.isLoading ? (
            <>
              <MetricCardSkeleton />
              <MetricCardSkeleton />
              <MetricCardSkeleton />
            </>
          ) : (
            <>
              <MetricCard
                label="Commits"
                value={repoTree.reduce(
                  (sum, repo) => sum + repo.commitCount,
                  0,
                )}
                sub={
                  isHydratingDetails
                    ? "fetching PR details..."
                    : `last ${hours} hours`
                }
              />
              <MetricCard
                label="Pull requests"
                value={recap.data?.prCount ?? 0}
                sub="current PRs in active repos"
              />
              <MetricCard
                label="Reviews"
                value={recap.data?.reviewCount ?? 0}
                sub={`last ${hours} hours`}
              />
            </>
          )}
        </div>

        {recap.isLoading ? (
          <ActivityFeedSkeleton rows={8} />
        ) : hasSelectedActivity ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                  Activity
                </h3>
                {isHydratingDetails && (
                  <span className="text-muted-foreground text-[11px]">
                    Fetching commits and review status...
                  </span>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground h-5 gap-1 px-1.5 text-[11px]"
                    >
                      <HugeiconsIcon icon={Share01Icon} size={12} />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onClick={() => {
                        const json = JSON.stringify(exportPayload, null, 2);
                        void navigator.clipboard.writeText(json);
                      }}
                    >
                      <HugeiconsIcon icon={Copy01Icon} size={14} />
                      Copy to clipboard
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const json = JSON.stringify(exportPayload, null, 2);
                        const blob = new Blob([json], {
                          type: "application/json",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `recap-${hours}h-${new Date().toISOString().slice(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <HugeiconsIcon icon={Download04Icon} size={14} />
                      Download JSON
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <span className="text-muted-foreground text-xs">
                {visibleItemCount} items
              </span>
            </div>

            <div className="space-y-6">
              {showTree && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon
                      icon={GitPullRequestIcon}
                      size={14}
                      className="text-muted-foreground"
                    />
                    <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                      PR Activity Tree
                    </h3>
                  </div>

                  {repoTree.length ? (
                    <div className="space-y-3">
                      {repoTree.map((repo) => (
                        <Card key={repo.name} className="gap-3 py-3">
                          <CardContent className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">
                                  {repo.name}
                                </p>
                                <p className="text-muted-foreground text-[11px]">
                                  {repo.prCount} current PR
                                  {repo.prCount !== 1 ? "s" : ""}
                                  {" · "}
                                  {repo.commitCount} commit
                                  {repo.commitCount !== 1 ? "s" : ""} in range
                                </p>
                              </div>
                            </div>

                            {repo.prs.length ? (
                              <div className="space-y-3">
                                {repo.prs.map((pr) => (
                                  <PRTreeCard
                                    key={pr.id}
                                    pr={pr}
                                    detailState={
                                      prDetails[pr.id]?.status ?? "loading"
                                    }
                                    detailMessage={prDetails[pr.id]?.message}
                                    showPRs={showPRs}
                                    showCommits={showCommits}
                                  />
                                ))}
                              </div>
                            ) : (
                              <p className="text-muted-foreground text-xs">
                                No current pull requests in this repo.
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="border-border text-muted-foreground rounded-md border border-dashed px-4 py-6 text-sm">
                      No active repositories matched this recap window.
                    </p>
                  )}
                </section>
              )}

              {showReviews && (
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
                            <p className="truncate text-xs font-medium">
                              {review.title}
                            </p>
                            <p className="text-muted-foreground text-[11px]">
                              {review.repoName} ·{" "}
                              {timeAgo(review.updatedAt ?? review.createdAt)}
                            </p>
                          </div>
                          {review.state && (
                            <ActivityBadge
                              variant={
                                review.state as "open" | "merged" | "closed"
                              }
                            />
                          )}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="border-border text-muted-foreground rounded-md border border-dashed px-4 py-6 text-sm">
                      No reviews in the selected timeframe.
                    </p>
                  )}
                </section>
              )}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No activity in the last {hours} hours for the selected filters
          </p>
        )}

        {(completion || isGenerating) && (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                AI Summary
              </h3>
              {completion && !isGenerating && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground h-6 gap-1 px-2 text-[11px]"
                  onClick={() => void navigator.clipboard.writeText(completion)}
                >
                  <HugeiconsIcon icon={Copy01Icon} size={12} />
                  Copy
                </Button>
              )}
            </div>
            <Textarea
              value={completion}
              onChange={(e) => updateCompletion(e.target.value)}
              className="min-h-[200px] font-mono text-xs"
              placeholder="Generating summary..."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PRTreeCard({
  pr,
  detailState,
  detailMessage,
  showPRs,
  showCommits,
}: {
  pr: PRTreeItem;
  detailState: "loading" | "ready" | "error";
  detailMessage?: string;
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
        {showPRs && <ActivityBadge variant={pr.state} />}
        {showPRs && pr.reviewStatus && (
          <ActivityBadge variant={pr.reviewStatus} />
        )}
        <span className="text-muted-foreground text-[11px]">
          #{pr.number} · updated {timeAgo(pr.updatedAt)}
        </span>
      </div>

      {showCommits && (
        <div className="border-border/70 border-t px-1 py-3">
          {detailState === "loading" ? (
            <p className="text-muted-foreground px-3 text-[11px]">
              Fetching commits...
            </p>
          ) : detailState === "error" ? (
            <p className="text-muted-foreground px-3 text-[11px]">
              {detailMessage ?? "Failed to fetch commits for this PR."}
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
      )}
    </div>
  );
}
