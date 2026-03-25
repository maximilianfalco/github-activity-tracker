"use client";

import { type RouterOutputs } from "~/trpc/react";

export const reviewDateOptions = [
  { label: "1 day", value: "1d" as const },
  { label: "7 days", value: "7d" as const },
  { label: "30 days", value: "30d" as const },
  { label: "90 days", value: "90d" as const },
];

export const reviewFilterOptions = [
  { label: "Reviewed", value: "reviewed" as const },
  { label: "To Review", value: "to_review" as const },
];

export const REVIEWS_TERMINAL_STORAGE_KEY = "reviews_terminal_open";

export type ReviewFilter = (typeof reviewFilterOptions)[number]["value"];
export type ReviewDateRange = (typeof reviewDateOptions)[number]["value"];
export type ReviewListItem = RouterOutputs["github"]["getReviews"][number];
export type PullRequestDetails = RouterOutputs["github"]["getPullRequestDetails"];
export type DiscussionComment = PullRequestDetails["comments"][number];

export function extractPullRequestNumber(url: string): number | undefined {
  const match = /\/pull\/(\d+)(?:\/|$)/.exec(url);
  const value = match?.[1];
  return value ? Number(value) : undefined;
}
