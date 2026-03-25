"use client";

import { ActivityFeedSkeleton, timeAgo } from "~/components/dashboard/activity-feed";
import { Card, CardContent } from "~/components/ui/card";
import { Markdown } from "~/components/ui/markdown";
import {
  extractPullRequestNumber,
  type DiscussionComment,
  type PullRequestDetails,
  type ReviewListItem,
} from "~/components/reviews/reviews-shared";
import { api } from "~/trpc/react";

export function PullRequestDetailPanel({ review }: { review: ReviewListItem }) {
  const prNumber = extractPullRequestNumber(review.url);
  const details = api.github.getPullRequestDetails.useQuery(
    {
      repoName: review.repoName,
      prNumber: prNumber ?? 1,
    },
    {
      enabled: prNumber !== undefined,
    },
  );

  if (prNumber === undefined) {
    return (
      <DetailMessage message="Unable to load this pull request's details." />
    );
  }

  if (details.isLoading) {
    return <ActivityFeedSkeleton rows={3} />;
  }

  return <PullRequestDetailContent details={details.data} />;
}

function PullRequestDetailContent({
  details,
}: {
  details: PullRequestDetails | undefined;
}) {
  const comments = details?.comments ?? [];
  const hasBody = Boolean(details?.body);

  return (
    <Card
      size="sm"
      className="min-w-0 gap-3 overflow-hidden border border-border/80 bg-card/70 py-3"
    >
      <CardContent className="min-w-0 space-y-4">
        <section className="space-y-2">
          <SectionLabel>PR Description</SectionLabel>
          {hasBody ? (
            <div className="min-w-0 overflow-x-auto rounded-md bg-muted/60 p-3">
              <Markdown content={details?.body ?? ""} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No pull request description provided.
            </p>
          )}
        </section>

        <section className="space-y-2">
          <SectionLabel>Conversations</SectionLabel>
          {comments.length ? (
            <div className="space-y-2">
              {comments.map((comment) => (
                <DiscussionThread key={comment.id} comment={comment} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No conversations found on this pull request.
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function DiscussionThread({
  comment,
  depth = 0,
}: {
  comment: DiscussionComment;
  depth?: number;
}) {
  return (
    <div
      className={depth > 0 ? "ml-4 min-w-0 border-l border-border/70 pl-3" : "min-w-0"}
    >
      <article className="min-w-0 overflow-hidden rounded-md border border-border/80 bg-background/80 p-3">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">
            {comment.author ?? "Unknown"}
          </span>
          <span>{timeAgo(comment.updatedAt)}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]">
            {comment.kind.replaceAll("_", " ")}
          </span>
          <a
            href={comment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            Open on GitHub
          </a>
        </div>
        <Markdown content={comment.body} className="min-w-0" />
      </article>

      {comment.replies.length ? (
        <div className="mt-2 min-w-0 space-y-2">
          {comment.replies.map((reply) => (
            <DiscussionThread
              key={reply.id}
              comment={reply}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DetailMessage({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3 text-xs text-muted-foreground">
      {message}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </div>
  );
}
