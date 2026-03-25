import {
  MetricCard,
  MetricCardSkeleton,
} from "~/components/dashboard/metric-card";
import { type HydratedRepoTreeItem, type RecapData } from "~/components/recap/recap-shared";

type RecapMetricsProps = {
  recap: RecapData | undefined;
  repoTree: HydratedRepoTreeItem[];
  isHydratingDetails: boolean;
  isLoading: boolean;
  windowLabel: string;
};

export function RecapMetrics({
  recap,
  repoTree,
  isHydratingDetails,
  isLoading,
  windowLabel,
}: RecapMetricsProps) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {isLoading ? (
        <>
          <MetricCardSkeleton />
          <MetricCardSkeleton />
          <MetricCardSkeleton />
        </>
      ) : (
        <>
          <MetricCard
            label="Commits"
            value={repoTree.reduce((sum, repo) => sum + repo.commitCount, 0)}
            sub={isHydratingDetails ? "fetching PR details..." : windowLabel}
          />
          <MetricCard
            label="Pull requests"
            value={recap?.prCount ?? 0}
            sub="current PRs in active repos"
          />
          <MetricCard
            label="Reviews"
            value={recap?.reviewCount ?? 0}
            sub={windowLabel}
          />
        </>
      )}
    </div>
  );
}
