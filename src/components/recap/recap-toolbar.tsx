import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon } from "@hugeicons/core-free-icons";
import { ActivityTypeFilter, type ActivityTypeSet } from "~/components/dashboard/activity-type-filter";
import { RepoFilter } from "~/components/dashboard/repo-filter";
import { Button } from "~/components/ui/button";
import {
  RECAP_WINDOW_OPTIONS,
  type RecapWindowOption,
} from "~/components/recap/recap-shared";

type RecapToolbarProps = {
  selectedWindow: RecapWindowOption["value"];
  includedTypes: ActivityTypeSet;
  allRepos: string[];
  includedRepos: string[];
  isGenerating: boolean;
  hasSelectedActivity: boolean;
  isHydratingDetails: boolean;
  onIncludedTypesChange: (next: ActivityTypeSet) => void;
  onSelectedWindowChange: (next: RecapWindowOption["value"]) => void;
  onGenerate: () => void;
};

export function RecapToolbar({
  selectedWindow,
  includedTypes,
  allRepos,
  includedRepos,
  isGenerating,
  hasSelectedActivity,
  isHydratingDetails,
  onIncludedTypesChange,
  onSelectedWindowChange,
  onGenerate,
}: RecapToolbarProps) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <select
        value={selectedWindow}
        onChange={(event) =>
          onSelectedWindowChange(event.target.value as RecapWindowOption["value"])
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
        onChange={onIncludedTypesChange}
      />
      <RepoFilter allRepos={allRepos} includedRepos={includedRepos} />
      <Button
        variant="secondary"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={onGenerate}
        disabled={isGenerating || !hasSelectedActivity || isHydratingDetails}
      >
        <HugeiconsIcon
          icon={SparklesIcon}
          size={14}
          className={isGenerating ? "animate-pulse" : ""}
        />
        {isGenerating ? "Generating..." : "Generate Recap"}
      </Button>
    </div>
  );
}
