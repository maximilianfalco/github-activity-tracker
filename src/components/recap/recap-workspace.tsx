"use client";

import { useMemo, useState } from "react";
import { ActivityFeedSkeleton } from "~/components/dashboard/activity-feed";
import { RECAP_WINDOW_OPTIONS } from "~/components/recap/recap-shared";
import { RecapActivityPanel } from "~/components/recap/recap-activity-panel";
import { RecapMetrics } from "~/components/recap/recap-metrics";
import {
  formatRepoTreeForAI,
  formatReviewsForAI,
  getRecapIncludeComments,
  getTodayCutoffIso,
  mergeRepoTree,
  type RecapViewMode,
  type RecapWindowOption,
} from "~/components/recap/recap-shared";
import { RecapSummaryPanel } from "~/components/recap/recap-summary-panel";
import { RecapToolbar } from "~/components/recap/recap-toolbar";
import { useRecapStream } from "~/components/recap/use-recap-stream";
import { useRecapSummary } from "~/components/recap/use-recap-summary";
import { api } from "~/trpc/react";

export function RecapWorkspace() {
  const [selectedWindow, setSelectedWindow] =
    useState<RecapWindowOption["value"]>("today");
  const [viewMode, setViewMode] = useState<RecapViewMode>("cards");
  const [includedTypes, setIncludedTypes] = useState(
    () => new Set(["commit", "pr", "review"]),
  );

  const selectedOption = useMemo(
    () =>
      RECAP_WINDOW_OPTIONS.find((option) => option.value === selectedWindow) ??
      RECAP_WINDOW_OPTIONS[1]!,
    [selectedWindow],
  );
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
  const settings = api.settings.get.useQuery();
  const includeComments = getRecapIncludeComments(settings.data);

  const showPRs = includedTypes.has("pr");
  const showCommits = includedTypes.has("commit");
  const showReviews = includedTypes.has("review");
  const showTree = showPRs || showCommits;

  const repoTreeShell = useMemo(() => recap.data?.repoTree ?? [], [recap.data]);
  const visibleReviews = useMemo(
    () => (showReviews ? (recap.data?.reviews ?? []) : []),
    [recap.data, showReviews],
  );
  const { isHydratingDetails, prDetails } = useRecapStream({
    includeComments,
    recapInput,
    repoTreeShell,
    selectedWindow,
    streamVersion: cutoffIso ?? hours,
  });
  const repoTree = useMemo(
    () => mergeRepoTree(repoTreeShell, prDetails),
    [prDetails, repoTreeShell],
  );

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

  const rawJson = useMemo(
    () =>
      JSON.stringify(
        {
          repoTree: showTree
            ? repoTree.map((repo) => ({
                ...repo,
                prs: repo.prs.map((pr) => ({
                  ...pr,
                  detailState: prDetails[pr.id]?.status ?? "loading",
                  detailMessage: prDetails[pr.id]?.message,
                })),
              }))
            : [],
          reviews: visibleReviews,
        },
        null,
        2,
      ),
    [prDetails, repoTree, showTree, visibleReviews],
  );

  const selectedTypes = useMemo(() => [...includedTypes].toSorted(), [includedTypes]);
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
  }, [includeComments, repoTree, showCommits, showPRs, showReviews, showTree, visibleReviews]);
  const {
    completion,
    copyToClipboard,
    generateSummary,
    isGenerating,
    toastMessage,
    updateCompletion,
  } = useRecapSummary({
    recapActivities,
    selectedWindow,
    cutoffIso: cutoffIso ?? null,
    hours,
    includedTypes: selectedTypes,
    includedRepos: recap.data?.includedRepos ?? [],
    customRule: settings.data?.recapCustomRule ?? "",
    includeComments,
    hasSelectedActivity,
    isHydratingDetails,
  });

  function downloadJson() {
    const blob = new Blob([rawJson], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `recap-${selectedWindow}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const activityRepoTree = useMemo(
    () =>
      showTree
        ? repoTree.map((repo) => ({
            ...repo,
            prs: repo.prs.map((pr) => ({
              ...pr,
              detailState: prDetails[pr.id]?.status ?? "loading",
              detailMessage: prDetails[pr.id]?.message,
            })),
          }))
        : [],
    [prDetails, repoTree, showTree],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6">
        <RecapToolbar
          selectedWindow={selectedWindow}
          includedTypes={includedTypes}
          allRepos={recap.data?.allRepos ?? []}
          includedRepos={recap.data?.includedRepos ?? []}
          isGenerating={isGenerating}
          hasSelectedActivity={hasSelectedActivity}
          isHydratingDetails={isHydratingDetails}
          onIncludedTypesChange={setIncludedTypes}
          onSelectedWindowChange={setSelectedWindow}
          onGenerate={() => void generateSummary()}
        />

        <RecapMetrics
          recap={recap.data}
          repoTree={repoTree}
          isHydratingDetails={isHydratingDetails}
          isLoading={recap.isLoading}
          windowLabel={windowLabel}
        />

        {recap.isLoading ? (
          <ActivityFeedSkeleton rows={8} />
        ) : (
          <RecapActivityPanel
            hasSelectedActivity={hasSelectedActivity}
            isHydratingDetails={isHydratingDetails}
            isLoading={recap.isLoading}
            rawJson={rawJson}
            repoTree={activityRepoTree}
            showCommits={showCommits}
            showPRs={showPRs}
            showReviews={showReviews}
            showTree={showTree}
            viewMode={viewMode}
            visibleItemCount={visibleItemCount}
            visibleReviews={visibleReviews}
            windowLabel={windowLabel}
            onCopyJson={() => {
              void copyToClipboard(rawJson, "Copied JSON to clipboard");
            }}
            onDownloadJson={downloadJson}
            onViewModeChange={setViewMode}
          />
        )}

        <RecapSummaryPanel
          completion={completion}
          isGenerating={isGenerating}
          onChange={updateCompletion}
          onCopy={() => {
            void copyToClipboard(completion, "Copied recap to clipboard");
          }}
        />

        {toastMessage ? (
          <div className="pointer-events-none fixed right-6 bottom-6 z-50 rounded-md border border-border bg-background/95 px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-sm">
            {toastMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}
