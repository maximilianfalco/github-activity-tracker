import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getCachedActivity, refreshCache } from "~/server/services/cache";
import { fetchLogin } from "~/server/services/github";
import { GitHubRateLimitError } from "~/server/services/github.types";

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

  const login = ctx.session.githubLogin ?? await fetchLogin(token);

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

export const githubRouter = createTRPCRouter({
  getOverview: protectedProcedure.query(async ({ ctx }) => {
    const { data, stale } = await getCachedActivity(ctx.db, ctx.session.user.id);

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
      const { data } = await getCachedActivity(ctx.db, ctx.session.user.id, "commit");
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
      const { data } = await getCachedActivity(ctx.db, ctx.session.user.id, "pr");
      const cutoff = daysAgo(input.dateRange);
      return data
        .filter((d) => d.createdAt >= cutoff)
        .filter((d) => !input.state || d.state === input.state);
    }),

  getReviews: protectedProcedure
    .input(z.object({ dateRange: dateRangeSchema }).default({}))
    .query(async ({ ctx, input }) => {
      const { data } = await getCachedActivity(ctx.db, ctx.session.user.id, "review");
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
  data: Array<{ type: string; state: string | null; createdAt: Date }>,
  isStale: boolean,
) {
  const thirtyDaysAgo = daysAgo("30d");
  const recent = data.filter((d) => d.createdAt >= thirtyDaysAgo);

  return {
    commits30d: recent.filter((d) => d.type === "commit").length,
    openPrs: data.filter((d) => d.type === "pr" && d.state === "open").length,
    mergedPrs: recent.filter((d) => d.type === "pr" && d.state === "merged").length,
    reviewsGiven: recent.filter((d) => d.type === "review").length,
    isStale,
  };
}
