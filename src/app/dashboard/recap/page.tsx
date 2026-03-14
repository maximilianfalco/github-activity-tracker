"use client";

import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { api } from "~/trpc/react";
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
  ROW_HEIGHT,
} from "~/components/dashboard/activity-feed";
import { RepoFilter } from "~/components/dashboard/repo-filter";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon, Copy01Icon } from "@hugeicons/core-free-icons";

const dotColors: Record<string, string> = {
  commit: "bg-green-500",
  pr: "bg-blue-500",
  review: "bg-amber-500",
};

interface ActivityItem {
  type: string;
  title: string;
  repoName: string;
  branch: string | null;
  state: string | null;
  createdAt: Date;
}

function formatActivitiesForAI(items: ActivityItem[]): string {
  const repoMap = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const list = repoMap.get(item.repoName) ?? [];
    list.push(item);
    repoMap.set(item.repoName, list);
  }

  const lines: string[] = [];

  for (const [repo, repoItems] of repoMap) {
    lines.push(`## ${repo}`);

    const prs = repoItems.filter((i) => i.type === "pr");
    if (prs.length > 0) {
      lines.push("PRs:");
      for (const p of prs) {
        lines.push(`  - "${p.title}" [${p.state ?? "unknown"}] (${timeAgo(p.createdAt)})`);
      }
    }

    const reviews = repoItems.filter((i) => i.type === "review");
    if (reviews.length > 0) {
      lines.push("Reviews:");
      for (const r of reviews) {
        lines.push(`  - "${r.title}" [${r.state ?? "unknown"}] (${timeAgo(r.createdAt)})`);
      }
    }

    const commits = repoItems.filter((i) => i.type === "commit");
    if (commits.length > 0) {
      const branchMap = new Map<string, ActivityItem[]>();
      for (const c of commits) {
        const branch = c.branch ?? "unknown";
        const list = branchMap.get(branch) ?? [];
        list.push(c);
        branchMap.set(branch, list);
      }

      lines.push("Commits:");
      for (const [branch, branchCommits] of branchMap) {
        lines.push(`  Branch: ${branch}`);
        for (const c of branchCommits) {
          lines.push(`    - "${c.title}" (${timeAgo(c.createdAt)})`);
        }
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

export default function RecapPage() {
  const poll = usePollInterval();
  const recap = api.github.getRecap.useQuery(undefined, {
    refetchInterval: poll,
  });

  const allItems = [
    ...(recap.data?.commits ?? []),
    ...(recap.data?.prs ?? []),
    ...(recap.data?.reviews ?? []),
  ].toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

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

  async function handleGenerate() {
    if (!allItems.length) return;
    setIsGenerating(true);
    updateCompletion("");

    const res = await fetch("/api/recap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activities: formatActivitiesForAI(allItems) }),
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
      <Topbar title="24h Recap" />
      <div className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <RepoFilter
            allRepos={recap.data?.allRepos ?? []}
            includedRepos={recap.data?.includedRepos ?? []}
          />
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={handleGenerate}
            disabled={isGenerating || !allItems.length}
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
                value={recap.data?.commitCount ?? 0}
                sub="last 24 hours"
              />
              <MetricCard
                label="Pull requests"
                value={recap.data?.prCount ?? 0}
                sub="last 24 hours"
              />
              <MetricCard
                label="Reviews"
                value={recap.data?.reviewCount ?? 0}
                sub="last 24 hours"
              />
            </>
          )}
        </div>

        {recap.isLoading ? (
          <ActivityFeedSkeleton rows={8} />
        ) : allItems.length ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Activity
              </h3>
              <span className="text-xs text-muted-foreground">
                {allItems.length} items
              </span>
            </div>
            <div
              ref={parentRef}
              className="h-[550px] overflow-y-auto rounded-md border border-border"
            >
              <div
                className="relative w-full"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const item = allItems[virtualRow.index]!;
                  return (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute left-0 top-0 flex w-full items-center gap-2.5 border-b border-border px-2 transition-colors hover:bg-secondary/50"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${dotColors[item.type] ?? "bg-muted-foreground"}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {item.title}
                      </span>
                      {item.branch && (
                        <code className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {item.branch}
                        </code>
                      )}
                      {item.state && (
                        <ActivityBadge
                          variant={
                            item.state as "open" | "merged" | "closed"
                          }
                        />
                      )}
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {item.repoName} · {timeAgo(item.createdAt)}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No activity in the last 24 hours
          </p>
        )}

        {(completion || isGenerating) && (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                AI Summary
              </h3>
              {completion && !isGenerating && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
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
