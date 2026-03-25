import { HugeiconsIcon } from "@hugeicons/react";
import { GitPullRequestIcon } from "@hugeicons/core-free-icons";
import { Card, CardContent } from "~/components/ui/card";
import { PRTreeCard } from "~/components/recap/pr-tree-card";
import { type HydratedRepoTreeItem, type HydratedPRTreeItem } from "~/components/recap/recap-shared";

export type ActivityPRTreeItem = HydratedPRTreeItem & {
  detailState: "loading" | "ready" | "error";
  detailMessage?: string;
};

export type ActivityRepoTreeItem = Omit<HydratedRepoTreeItem, "prs"> & {
  prs: ActivityPRTreeItem[];
};

export function RecapPrTreeSection({
  repoTree,
  showCommits,
  showPRs,
}: {
  repoTree: ActivityRepoTreeItem[];
  showCommits: boolean;
  showPRs: boolean;
}) {
  return (
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
                    <p className="text-sm font-medium">{repo.name}</p>
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
  );
}
