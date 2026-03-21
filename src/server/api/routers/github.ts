import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getCachedActivity, refreshCache } from "~/server/services/cache";
import {
  extractPullRequestNumber,
  fetchLogin,
  fetchPullRequestReviewStatus,
} from "~/server/services/github";
import {
  GitHubRateLimitError,
  type PullRequestReviewStatus,
} from "~/server/services/github.types";

const dateRangeSchema = z.enum(["1d", "7d", "30d", "90d"]).default("30d");

function daysAgo(range: "1d" | "7d" | "30d" | "90d"): Date {
  const days = { "1d": 2, "7d": 7, "30d": 30, "90d": 90 }[range];
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function getTokenAndLogin(ctx: {
  session: { accessToken: string | null; githubLogin: string | null };
  db: Parameters<typeof getCachedActivity>[0];
}) {
  const token = ctx.session.accessToken;
  if (!token) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No GitHub access token found. Please re-authenticate.",
    });
  }

  const login = ctx.session.githubLogin ?? (await fetchLogin(token));

  return { token, login };
}

function handleGitHubError(error: unknown): never {
  if (error instanceof GitHubRateLimitError) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: error.message,
    });
  }
  throw error;
}

type CachedActivityItem = Awaited<
  ReturnType<typeof getCachedActivity>
>["data"][number];

type RecapCommitItem = {
  id: string;
  type: "commit";
  title: string;
  url: string;
  repoName: string;
  branch: string | null;
  state: null;
  sha: string | null;
  createdAt: Date;
};

type RecapPRItem = {
  id: string;
  type: "pr";
  number: number;
  title: string;
  url: string;
  repoName: string;
  branch: null;
  state: "open" | "merged" | "closed";
  reviewStatus: PullRequestReviewStatus | null;
  createdAt: Date;
  updatedAt: Date;
  commits: RecapCommitItem[];
};

type RecapRepoTreeItem = {
  name: string;
  prCount: number;
  commitCount: number;
  prs: RecapPRItem[];
};

type RecapReviewItem = {
  id: string;
  type: "review";
  title: string;
  url: string;
  repoName: string;
  branch: string | null;
  state: "open" | "merged" | "closed" | null;
  createdAt: Date;
  updatedAt: Date | null;
};

function buildReviewItem(item: CachedActivityItem): RecapReviewItem {
  return {
    id: item.id,
    type: "review",
    title: item.title,
    url: item.url,
    repoName: item.repoName,
    branch: item.branch,
    state: item.state as "open" | "merged" | "closed" | null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function buildFallbackTree(
  items: CachedActivityItem[],
  repoNames: string[],
  cutoff: Date,
): RecapRepoTreeItem[] {
  const openPrs = items
    .filter((item) => item.type === "pr" && item.state === "open")
    .filter((item) => (item.updatedAt ?? item.createdAt) >= cutoff)
    .filter((item) => repoNames.includes(item.repoName));

  const repoMap = new Map<string, RecapPRItem[]>();
  for (const item of openPrs) {
    const prNumber = extractPullRequestNumber(item.url);
    if (!prNumber) continue;

    const repoItems = repoMap.get(item.repoName) ?? [];
    repoItems.push({
      id: item.id,
      type: "pr",
      number: prNumber,
      title: item.title,
      url: item.url,
      repoName: item.repoName,
      branch: null,
      state: "open",
      reviewStatus: null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt ?? item.createdAt,
      commits: [],
    });
    repoMap.set(item.repoName, repoItems);
  }

  return repoNames.map((repoName) => {
    const prs = (repoMap.get(repoName) ?? []).toSorted(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );

    return {
      name: repoName,
      prCount: prs.length,
      commitCount: 0,
      prs,
    };
  });
}

export const githubRouter = createTRPCRouter({
  getOverview: protectedProcedure.query(async ({ ctx }) => {
    const { data, stale } = await getCachedActivity(
      ctx.db,
      ctx.session.user.id,
    );

    if (stale) {
      try {
        const { token, login } = await getTokenAndLogin(ctx);
        await refreshCache(ctx.db, ctx.session.user.id, token, login);
        const fresh = await getCachedActivity(ctx.db, ctx.session.user.id);
        return buildOverview(fresh.data, false);
      } catch (error) {
        if (data.length > 0) return buildOverview(data, true);
        handleGitHubError(error);
      }
    }

    return buildOverview(data, stale);
  }),

  getCommits: protectedProcedure
    .input(z.object({ dateRange: dateRangeSchema }).default({}))
    .query(async ({ ctx, input }) => {
      const { data } = await getCachedActivity(
        ctx.db,
        ctx.session.user.id,
        "commit",
      );
      const cutoff = daysAgo(input.dateRange);
      return data.filter((d) => d.createdAt >= cutoff);
    }),

  getPullRequests: protectedProcedure
    .input(
      z
        .object({
          state: z.enum(["open", "merged", "closed"]).optional(),
          dateRange: dateRangeSchema,
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const { data } = await getCachedActivity(
        ctx.db,
        ctx.session.user.id,
        "pr",
      );
      const cutoff = daysAgo(input.dateRange);
      const filtered = data
        .filter((d) => d.createdAt >= cutoff)
        .filter((d) => !input.state || d.state === input.state);

      try {
        const { token } = await getTokenAndLogin(ctx);
        return await Promise.all(
          filtered.map(async (pr) => {
            const prNumber = extractPullRequestNumber(pr.url);
            if (!prNumber) {
              return { ...pr, reviewStatus: "review_pending" as const };
            }

            const reviewStatus = await fetchPullRequestReviewStatus(
              token,
              pr.repoName,
              prNumber,
            );

            return { ...pr, reviewStatus };
          }),
        );
      } catch {
        return filtered.map((pr) => ({
          ...pr,
          reviewStatus: "review_pending" as const,
        }));
      }
    }),

  getReviews: protectedProcedure
    .input(z.object({ dateRange: dateRangeSchema }).default({}))
    .query(async ({ ctx, input }) => {
      const { data } = await getCachedActivity(
        ctx.db,
        ctx.session.user.id,
        "review",
      );
      const cutoff = daysAgo(input.dateRange);
      return data.filter((d) => d.createdAt >= cutoff);
    }),

  getRepoBreakdown: protectedProcedure.query(async ({ ctx }) => {
    const { data } = await getCachedActivity(ctx.db, ctx.session.user.id);
    const repoMap = new Map<
      string,
      { commits: number; prs: number; lastActivityAt: Date }
    >();

    for (const entry of data) {
      const existing = repoMap.get(entry.repoName) ?? {
        commits: 0,
        prs: 0,
        lastActivityAt: new Date(0),
      };
      if (entry.type === "commit") existing.commits++;
      if (entry.type === "pr") existing.prs++;
      if (entry.createdAt > existing.lastActivityAt) {
        existing.lastActivityAt = entry.createdAt;
      }
      repoMap.set(entry.repoName, existing);
    }

    return Array.from(repoMap.entries())
      .map(([repoName, stats]) => ({
        repoName,
        commits: stats.commits,
        prs: stats.prs,
        total: stats.commits + stats.prs,
        lastActivityAt: stats.lastActivityAt,
      }))
      .toSorted((a, b) => b.total - a.total);
  }),

  getRecap: protectedProcedure
    .input(
      z
        .object({ hours: z.number().int().min(12).max(72).default(24) })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const { data } = await getCachedActivity(ctx.db, ctx.session.user.id);

      const settings = await ctx.db.userSettings.findUnique({
        where: { userId: ctx.session.user.id },
      });
      const savedRepos = settings?.recapIncludedRepos ?? [];

      const cutoff = new Date(Date.now() - input.hours * 60 * 60 * 1000);
      const allRepoNames = [...new Set(data.map((d) => d.repoName))].toSorted();

      const effectiveDate = (d: CachedActivityItem) =>
        d.updatedAt ?? d.createdAt;
      const activeRepoNames = [
        ...new Set(
          data.filter((d) => effectiveDate(d) >= cutoff).map((d) => d.repoName),
        ),
      ].toSorted();

      const effectiveIncluded =
        savedRepos.length > 0 ? savedRepos : activeRepoNames;
      const included = new Set<string>(effectiveIncluded);
      const includedActiveRepoNames = activeRepoNames.filter((repoName) =>
        included.has(repoName),
      );

      const reviews = data
        .filter((item) => item.type === "review")
        .filter(
          (item) =>
            effectiveDate(item) >= cutoff && included.has(item.repoName),
        )
        .map(buildReviewItem)
        .toSorted(
          (a, b) =>
            (b.updatedAt ?? b.createdAt).getTime() -
            (a.updatedAt ?? a.createdAt).getTime(),
        );

      const repoTree = buildFallbackTree(data, includedActiveRepoNames, cutoff);

      return {
        commitCount: 0,
        prCount: repoTree.reduce((sum, repo) => sum + repo.prCount, 0),
        reviewCount: reviews.length,
        repoTree,
        reviews,
        allRepos: allRepoNames,
        includedRepos: effectiveIncluded,
      };
    }),

  refresh: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      const { token, login } = await getTokenAndLogin(ctx);
      await refreshCache(ctx.db, ctx.session.user.id, token, login);
      return { success: true };
    } catch (error) {
      handleGitHubError(error);
    }
  }),
});

function buildOverview(
  data: Array<{
    id: string;
    type: string;
    title: string;
    repoName: string;
    url: string;
    state: string | null;
    createdAt: Date;
  }>,
  isStale: boolean,
) {
  const thirtyDaysAgo = daysAgo("30d");
  const recent = data.filter((d) => d.createdAt >= thirtyDaysAgo);

  const recentActivity = data
    .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 15);

  return {
    commits30d: recent.filter((d) => d.type === "commit").length,
    openPrs: data.filter((d) => d.type === "pr" && d.state === "open").length,
    mergedPrs: recent.filter((d) => d.type === "pr" && d.state === "merged")
      .length,
    reviewsGiven: recent.filter((d) => d.type === "review").length,
    recentActivity,
    isStale,
  };
}
