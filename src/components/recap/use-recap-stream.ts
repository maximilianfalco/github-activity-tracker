"use client";

import { useEffect, useMemo, useState } from "react";
import { type PRDetailState, type RecapStreamChunk, type RepoTreeItem } from "~/components/recap/recap-shared";

export function useRecapStream({
  includeComments,
  recapInput,
  repoTreeShell,
  selectedWindow,
  streamVersion,
}: {
  includeComments: boolean;
  recapInput: { cutoffIso: string | undefined } | { hours: number };
  repoTreeShell: RepoTreeItem[];
  selectedWindow: string;
  streamVersion: string | number;
}) {
  const [prDetails, setPrDetails] = useState<Record<string, PRDetailState>>({});
  const [isHydratingDetails, setIsHydratingDetails] = useState(false);

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

  const streamKey = useMemo(
    () =>
      [
        selectedWindow,
        includeComments ? "comments:on" : "comments:off",
        streamVersion,
        ...streamPrs.map((pr) => `${pr.id}:${pr.updatedAt.toISOString()}`),
      ].join("|"),
    [includeComments, selectedWindow, streamPrs, streamVersion],
  );

  useEffect(() => {
    if (streamPrs.length === 0) {
      setPrDetails({});
      setIsHydratingDetails(false);
      return;
    }

    const controller = new AbortController();

    setPrDetails(streamInitialDetails);
    setIsHydratingDetails(true);

    void (async () => {
      try {
        const response = await fetch("/api/recap-tree-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: streamRequestBody,
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error("Failed to start recap stream");
        }

        const reader = response.body.getReader();
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
  }, [streamInitialDetails, streamKey, streamPrs.length, streamRequestBody]);

  return {
    isHydratingDetails,
    prDetails,
  };
}
