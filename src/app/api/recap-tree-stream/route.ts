import { auth } from "~/server/auth";
import {
  fetchPullRequestCommits,
  fetchPullRequestReviewStatus,
} from "~/server/services/github";
import { GitHubRateLimitError } from "~/server/services/github.types";

type RecapStreamRequest = {
  hours: number;
  prs: Array<{
    id: string;
    repoName: string;
    number: number;
  }>;
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || !session.accessToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { hours, prs } = (await req.json()) as RecapStreamRequest;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (payload: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));

      try {
        for (const pr of prs) {
          if (req.signal.aborted) break;

          try {
            const [commits, reviewStatus] = await Promise.all([
              fetchPullRequestCommits(
                session.accessToken!,
                pr.repoName,
                pr.number,
              ),
              fetchPullRequestReviewStatus(
                session.accessToken!,
                pr.repoName,
                pr.number,
              ),
            ]);

            write({
              type: "pr_detail",
              prId: pr.id,
              reviewStatus,
              commits: commits
                .filter((commit) => commit.createdAt >= cutoff)
                .map((commit) => ({
                  id: `commit:${commit.sha}`,
                  type: "commit" as const,
                  title: commit.message,
                  url: commit.url,
                  repoName: commit.repoName,
                  branch: commit.branch,
                  state: null,
                  sha: commit.sha,
                  createdAt: commit.createdAt,
                })),
            });
          } catch (error) {
            write({
              type: "pr_error",
              prId: pr.id,
              message:
                error instanceof GitHubRateLimitError
                  ? error.message
                  : "Failed to fetch PR details.",
            });
          }
        }

        write({ type: "done" });
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      req.signal.throwIfAborted?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
