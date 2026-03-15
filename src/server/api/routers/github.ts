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

  getRecap: protectedProcedure
    .input(z.object({ hours: z.number().int().min(12).max(72).default(24) }).default({}))
    .query(async ({ ctx, input }) => {
    const { data, stale } = await getCachedActivity(ctx.db, ctx.session.user.id);

    let items = data;
    if (stale) {
      try {
        const { token, login } = await getTokenAndLogin(ctx);
        await refreshCache(ctx.db, ctx.session.user.id, token, login);
        const fresh = await getCachedActivity(ctx.db, ctx.session.user.id);
        items = fresh.data;
      } catch {
        // fall through with stale data
      }
    }

    const settings = await ctx.db.userSettings.findUnique({
      where: { userId: ctx.session.user.id },
    });
    const savedRepos = settings?.recapIncludedRepos ?? [];

    const cutoff = new Date(Date.now() - input.hours * 60 * 60 * 1000);
    const allRepoNames = [...new Set(items.map((d) => d.repoName))].toSorted();

    const effectiveDate = (d: (typeof items)[number]) =>
      d.updatedAt ?? d.createdAt;

    const activeRepoNames = [
      ...new Set(
        items.filter((d) => effectiveDate(d) >= cutoff).map((d) => d.repoName),
      ),
    ];

    const effectiveIncluded =
      savedRepos.length > 0 ? savedRepos : activeRepoNames;
    const included = new Set<string>(effectiveIncluded);

    const filtered = items
      .filter((d) => effectiveDate(d) >= cutoff && included.has(d.repoName))
      .toSorted((a, b) => effectiveDate(b).getTime() - effectiveDate(a).getTime());

    const commits = filtered.filter((d) => d.type === "commit");
    const prs = filtered.filter((d) => d.type === "pr");
    const reviews = filtered.filter((d) => d.type === "review");

    const repoMap = new Map<string, number>();
    for (const item of filtered) {
      repoMap.set(item.repoName, (repoMap.get(item.repoName) ?? 0) + 1);
    }

    return {
      commitCount: commits.length,
      prCount: prs.length,
      reviewCount: reviews.length,
      commits,
      prs,
      reviews,
      activeRepos: [...repoMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .toSorted((a, b) => b.count - a.count),
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
    mergedPrs: recent.filter((d) => d.type === "pr" && d.state === "merged").length,
    reviewsGiven: recent.filter((d) => d.type === "review").length,
    recentActivity,
    isStale,
  };
}
