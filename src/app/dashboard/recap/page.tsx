"use client";

import { useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SparklesIcon,
  Copy01Icon,
  Download04Icon,
  Share01Icon,
  GitPullRequestIcon,
  GitCommitIcon,
  EyeIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { api, type RouterOutputs } from "~/trpc/react";
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
type DiscussionCommentItem = {
  id: string;
  author: string | null;
  body: string;
  url: string;
  createdAt: Date;
  updatedAt: Date;
};
type HydratedPRTreeItem = PRTreeItem & { comments: DiscussionCommentItem[] };
type HydratedRepoTreeItem = Omit<RepoTreeItem, "prs"> & {
  prs: HydratedPRTreeItem[];
};

type PRDetailState = {
  status: "loading" | "ready" | "error";
  ciStatus: PRTreeItem["ciStatus"];
  reviewStatus: PRTreeItem["reviewStatus"];
  commits: CommitItem[];
  comments: DiscussionCommentItem[];
  message?: string;
};

type RecapStreamChunk =
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

type RecapWindowOption =
  | {
      value: "today";
      label: "Today";
    }
  | {
      value: `${number}h`;
      label: string;
      hours: number;
    };

type RecapSummaryCache = Record<string, string>;
type RecapViewMode = "cards" | "json";

function getRecapIncludeComments(
  settings: unknown,
) {
  if (!settings || typeof settings !== "object") return false;
  if (!("recapIncludeComments" in settings)) return false;
  return Boolean(
    (settings as { recapIncludeComments?: unknown }).recapIncludeComments,
  );
}

function mergeRepoTree(
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

function formatRepoTreeForAI(
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

function formatReviewsForAI(reviews: ReviewItem[]): string {
  if (reviews.length === 0) return "";

  const lines = ["## Reviews"];
  for (const review of reviews) {
    lines.push(
      `- ${review.repoName}: "${review.title}" [${review.state ?? "unknown"}] ${review.url} (${formatTimestampForAI(review.updatedAt ?? review.createdAt)})`,
    );
  }

  return lines.join("\n");
}

const HOUR_OPTIONS = [24, 36, 48, 60, 72] as const;
const RECAP_WINDOW_OPTIONS: RecapWindowOption[] = [
  { value: "today", label: "Today" },
  ...HOUR_OPTIONS.map((hours) => ({
    value: `${hours}h` as const,
    label: `${hours}h`,
    hours,
  })),
];

function getTodayCutoffIso(now = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setHours(6, 0, 0, 0);
  return cutoff.toISOString();
}

function hashString(value: string): string {
  let hash = 5381;

  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }

  return (hash >>> 0).toString(36);
}

function readSummaryCache(storageKey: string): RecapSummaryCache {
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

function writeSummaryCache(
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

export default function RecapPage() {
  const [selectedWindow, setSelectedWindow] =
    useState<RecapWindowOption["value"]>("today");
  const [viewMode, setViewMode] = useState<RecapViewMode>("cards");
  const [includedTypes, setIncludedTypes] = useState(
    () => new Set(["commit", "pr", "review"]),
  );
  const [prDetails, setPrDetails] = useState<Record<string, PRDetailState>>({});
  const [isHydratingDetails, setIsHydratingDetails] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const selectedOption =
    RECAP_WINDOW_OPTIONS.find((option) => option.value === selectedWindow) ??
    RECAP_WINDOW_OPTIONS[1]!;
  const cutoffIso =
    selectedOption.value === "today" ? getTodayCutoffIso() : undefined;
  const hours = "hours" in selectedOption ? selectedOption.hours : 24;
  const recapInput = useMemo(
    () =>
      selectedOption.value === "today"
        ? { cutoffIso }
        : { hours: selectedOption.hours },
    [cutoffIso, selectedOption],
  );
  const windowLabel =
    selectedOption.value === "today"
      ? "since 6am local time"
      : `last ${hours} hours`;
  const recap = api.github.getRecap.useQuery(recapInput);

  const showPRs = includedTypes.has("pr");
  const showCommits = includedTypes.has("commit");
  const showReviews = includedTypes.has("review");
  const showTree = showPRs || showCommits;
  const settings = api.settings.get.useQuery();
  const includeComments = getRecapIncludeComments(settings.data);

  const repoTreeShell = useMemo(() => recap.data?.repoTree ?? [], [recap.data]);
  const visibleReviews = useMemo(
    () => (showReviews ? (recap.data?.reviews ?? []) : []),
    [showReviews, recap.data],
  );
  const repoTree = mergeRepoTree(repoTreeShell, prDetails);
  const streamPrs = useMemo(
    () =>
      repoTreeShell.flatMap((repo) =>
        repo.prs.map((pr) => ({
          id: pr.id,
          repoName: pr.repoName,
          number: pr.number,
          updatedAt: pr.updatedAt,
        })),
      ),
    [repoTreeShell],
  );
  const streamInitialDetails = useMemo(
    () =>
      Object.fromEntries(
        streamPrs.map((pr) => [
          pr.id,
          {
            status: "loading" as const,
            ciStatus: null,
            reviewStatus: null,
            commits: [],
            comments: [],
          },
        ]),
      ),
    [streamPrs],
  );
  const streamRequestBody = useMemo(
    () =>
      JSON.stringify({
        ...recapInput,
        includeComments,
        prs: streamPrs.map(({ id, repoName, number }) => ({
          id,
          repoName,
          number,
        })),
      }),
    [includeComments, recapInput, streamPrs],
  );
  const streamPrCount = streamPrs.length;
  const streamKey = useMemo(
    () =>
      [
        selectedWindow,
        includeComments ? "comments:on" : "comments:off",
        cutoffIso ?? hours,
        ...streamPrs.map((pr) => `${pr.id}:${pr.updatedAt.toISOString()}`),
      ].join("|"),
    [cutoffIso, hours, includeComments, selectedWindow, streamPrs],
  );

  useEffect(() => {
    if (streamPrCount === 0) {
      setPrDetails({});
      setIsHydratingDetails(false);
      return;
    }

    const controller = new AbortController();

    setPrDetails(streamInitialDetails);
    setIsHydratingDetails(true);

    void (async () => {
      try {
        const res = await fetch("/api/recap-tree-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: streamRequestBody,
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
                  ciStatus: chunk.ciStatus,
                  reviewStatus: chunk.reviewStatus,
                  commits: chunk.commits.map((commit) => ({
                    ...commit,
                    createdAt: new Date(commit.createdAt),
                  })),
                  comments: chunk.comments.map((comment) => ({
                    ...comment,
                    createdAt: new Date(comment.createdAt),
                    updatedAt: new Date(comment.updatedAt),
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
                  ciStatus: null,
                  reviewStatus: null,
                  commits: [],
                  comments: [],
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
                    ciStatus: null,
                    reviewStatus: null,
                    commits: [],
                    comments: [],
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
  }, [streamInitialDetails, streamKey, streamPrCount, streamRequestBody]);

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
  const rawJson = useMemo(
    () => JSON.stringify(exportPayload, null, 2),
    [exportPayload],
  );

  const STORAGE_KEY = "recap-summary-cache-v1";
  const [completion, setCompletion] = useState("");
  const selectedTypes = useMemo(
    () => [...includedTypes].toSorted(),
    [includedTypes],
  );
  const recapActivities = useMemo(() => {
    const sections: string[] = [];

    if (showTree) {
      sections.push(
        formatRepoTreeForAI(repoTree, {
          includePRs: showPRs,
          includeCommits: showCommits,
          includeComments,
        }),
      );
    }
    if (showReviews) {
      sections.push(formatReviewsForAI(visibleReviews));
    }

    return sections.filter(Boolean).join("\n\n");
  }, [
    includeComments,
    repoTree,
    showCommits,
    showPRs,
    showReviews,
    showTree,
    visibleReviews,
  ]);
  const recapCacheKey = useMemo(() => {
    const cacheInput = JSON.stringify({
      window: selectedWindow,
      cutoffIso: cutoffIso ?? null,
      hours,
      includedTypes: selectedTypes,
      includedRepos: recap.data?.includedRepos ?? [],
      customRule: settings.data?.recapCustomRule ?? "",
      includeComments,
      activities: recapActivities,
    });

    return hashString(cacheInput);
  }, [
    cutoffIso,
    hours,
    recap.data?.includedRepos,
    recapActivities,
    selectedTypes,
    selectedWindow,
    includeComments,
    settings.data?.recapCustomRule,
  ]);

  useEffect(() => {
    const saved = readSummaryCache(STORAGE_KEY)[recapCacheKey] ?? "";
    setCompletion(saved);
  }, [STORAGE_KEY, recapCacheKey]);
  const [isGenerating, setIsGenerating] = useState(false);

  function showToast(message: string) {
    setToastMessage(message);
    window.clearTimeout((showToast as typeof showToast & { timeoutId?: number }).timeoutId);
    (showToast as typeof showToast & { timeoutId?: number }).timeoutId =
      window.setTimeout(() => setToastMessage(null), 2000);
  }

  async function copyToClipboard(text: string, message: string) {
    await navigator.clipboard.writeText(text);
    showToast(message);
  }

  function updateCompletion(text: string, cacheKey = recapCacheKey) {
    setCompletion(text);
    writeSummaryCache(STORAGE_KEY, (cache) => {
      if (!text) {
        const { [cacheKey]: removedValue, ...rest } = cache;
        void removedValue;
        return rest;
      }

      return {
        ...cache,
        [cacheKey]: text,
      };
    });
  }

  async function handleGenerate() {
    if (!hasSelectedActivity || isHydratingDetails || !recapActivities) return;

    const cachedSummary = readSummaryCache(STORAGE_KEY)[recapCacheKey];
    if (cachedSummary) {
      setCompletion(cachedSummary);
      return;
    }

    setIsGenerating(true);
    setCompletion("");

    const res = await fetch("/api/recap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activities: recapActivities,
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

    updateCompletion(text);
    setIsGenerating(false);
  }

  return (
    <div className="h-full overflow-y-auto">
      <Topbar title="Recap" />
      <div className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <select
            value={selectedWindow}
            onChange={(e) =>
              setSelectedWindow(e.target.value as RecapWindowOption["value"])
            }
            className="border-border bg-background h-6 rounded-md border px-2 text-xs"
          >
            {RECAP_WINDOW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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
                  isHydratingDetails ? "fetching PR details..." : windowLabel
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
                sub={windowLabel}
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
                <div className="border-border bg-background inline-flex rounded-md border p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode("cards")}
                    className={`rounded px-2 py-1 text-[11px] transition-colors ${
                      viewMode === "cards"
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    Cards
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("json")}
                    className={`rounded px-2 py-1 text-[11px] transition-colors ${
                      viewMode === "json"
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    JSON
                  </button>
                </div>
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
                        void copyToClipboard(rawJson, "Copied JSON to clipboard");
                      }}
                    >
                      <HugeiconsIcon icon={Copy01Icon} size={14} />
                      Copy to clipboard
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const blob = new Blob([rawJson], {
                          type: "application/json",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `recap-${selectedWindow}-${new Date().toISOString().slice(0, 10)}.json`;
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

            {viewMode === "json" ? (
              <div className="border-border bg-muted/20 max-h-[70vh] overflow-y-auto overflow-x-hidden rounded-md border p-3">
                <pre className="text-foreground w-full overflow-x-hidden whitespace-pre-wrap break-words font-mono text-xs">
                  {rawJson}
                </pre>
              </div>
            ) : (
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
                              <ActivityBadge variant={review.state} />
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
            )}
          </>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No activity {windowLabel} for the selected filters
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
                  onClick={() =>
                    void copyToClipboard(
                      completion,
                      "Copied recap to clipboard",
                    )
                  }
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

        {toastMessage && (
          <div className="pointer-events-none fixed right-6 bottom-6 z-50 rounded-md border border-border bg-background/95 px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-sm">
            {toastMessage}
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
        {showPRs && <ActivityBadge variant={pr.ageLabel} />}
        {showPRs && pr.ciStatus && <ActivityBadge variant={pr.ciStatus} />}
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
            <div className="text-muted-foreground flex items-center gap-2 px-3 text-[11px]">
              <HugeiconsIcon
                icon={RefreshIcon}
                size={12}
                className="animate-spin"
              />
              <p>Fetching commits...</p>
            </div>
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
