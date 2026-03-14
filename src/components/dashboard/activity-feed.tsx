"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ActivityBadge } from "./activity-badge";
import { Skeleton } from "~/components/ui/skeleton";

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  repoName: string;
  url: string;
  state: string | null;
  createdAt: Date;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

const dotColors: Record<string, string> = {
  commit: "bg-green-500",
  pr: "bg-blue-500",
  review: "bg-amber-500",
};

const ROW_HEIGHT = 36;

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No recent activity
      </p>
    );
  }

  return (
    <div
      ref={parentRef}
      className="max-h-[calc(100vh-16rem)] overflow-y-auto"
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index]!;
          return (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute left-0 top-0 flex w-full items-center gap-2.5 border-b border-border px-1 transition-colors hover:bg-secondary/50"
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
              {item.state && (
                <ActivityBadge
                  variant={item.state as "open" | "merged" | "closed"}
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
  );
}

export { timeAgo, ROW_HEIGHT };

export function ActivityFeedSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 border-b border-border px-1 py-2.5 last:border-0"
        >
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
