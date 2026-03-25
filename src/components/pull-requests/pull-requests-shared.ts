"use client";

import { type RouterOutputs } from "~/trpc/react";

export const pullRequestStateOptions = [
  { label: "All", value: "all" as const },
  { label: "Open", value: "open" as const },
  { label: "Draft", value: "draft" as const },
  { label: "Merged", value: "merged" as const },
  { label: "Closed", value: "closed" as const },
];

export const pullRequestDateOptions = [
  { label: "1 day", value: "1d" as const },
  { label: "7 days", value: "7d" as const },
  { label: "30 days", value: "30d" as const },
  { label: "90 days", value: "90d" as const },
];

export type PullRequestStateFilter =
  (typeof pullRequestStateOptions)[number]["value"];
export type PullRequestDateRange =
  (typeof pullRequestDateOptions)[number]["value"];
export type PullRequestListItem =
  RouterOutputs["github"]["getPullRequests"][number];

export function extractPullRequestNumber(url: string): number | undefined {
  const match = /\/pull\/(\d+)(?:\/|$)/.exec(url);
  const value = match?.[1];
  return value ? Number(value) : undefined;
}
