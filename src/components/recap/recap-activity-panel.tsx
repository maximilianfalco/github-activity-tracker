import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  Download04Icon,
  Share01Icon,
} from "@hugeicons/core-free-icons";
import { ActivityFeedSkeleton } from "~/components/dashboard/activity-feed";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { RecapPrTreeSection, type ActivityRepoTreeItem } from "~/components/recap/recap-pr-tree-section";
import { RecapReviewsSection } from "~/components/recap/recap-reviews-section";
import { type RecapViewMode, type ReviewItem } from "~/components/recap/recap-shared";

type RecapActivityPanelProps = {
  hasSelectedActivity: boolean;
  isHydratingDetails: boolean;
  isLoading: boolean;
  rawJson: string;
  repoTree: ActivityRepoTreeItem[];
  showCommits: boolean;
  showPRs: boolean;
  showReviews: boolean;
  showTree: boolean;
  viewMode: RecapViewMode;
  visibleItemCount: number;
  visibleReviews: ReviewItem[];
  windowLabel: string;
  onCopyJson: () => void;
  onDownloadJson: () => void;
  onViewModeChange: (mode: RecapViewMode) => void;
};

export function RecapActivityPanel({
  hasSelectedActivity,
  isHydratingDetails,
  isLoading,
  rawJson,
  repoTree,
  showCommits,
  showPRs,
  showReviews,
  showTree,
  viewMode,
  visibleItemCount,
  visibleReviews,
  windowLabel,
  onCopyJson,
  onDownloadJson,
  onViewModeChange,
}: RecapActivityPanelProps) {
  if (isLoading) {
    return <ActivityFeedSkeleton rows={8} />;
  }

  if (!hasSelectedActivity) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No activity {windowLabel} for the selected filters
      </p>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Activity
          </h3>
          {isHydratingDetails ? (
            <span className="text-muted-foreground text-[11px]">
              Fetching commits and review status...
            </span>
          ) : null}
          <div className="border-border bg-background inline-flex rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange("cards")}
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
              onClick={() => onViewModeChange("json")}
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
              <DropdownMenuItem onClick={onCopyJson}>
                <HugeiconsIcon icon={Copy01Icon} size={14} />
                Copy to clipboard
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDownloadJson}>
                <HugeiconsIcon icon={Download04Icon} size={14} />
                Download JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <span className="text-muted-foreground text-xs">{visibleItemCount} items</span>
      </div>

      {viewMode === "json" ? (
        <div className="border-border bg-muted/20 max-h-[70vh] overflow-y-auto overflow-x-hidden rounded-md border p-3">
          <pre className="text-foreground w-full overflow-x-hidden whitespace-pre-wrap break-words font-mono text-xs">
            {rawJson}
          </pre>
        </div>
      ) : (
        <div className="space-y-6">
          {showTree ? (
            <RecapPrTreeSection
              repoTree={repoTree}
              showCommits={showCommits}
              showPRs={showPRs}
            />
          ) : null}

          {showReviews ? (
            <RecapReviewsSection visibleReviews={visibleReviews} />
          ) : null}
        </div>
      )}
    </>
  );
}
