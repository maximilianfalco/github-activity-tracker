import type { PrismaClient } from "../../../generated/prisma";
import type { ActivityType } from "./github.types";
import { fetchCommits, fetchPullRequests, fetchReviews } from "./github";

export const CACHE_TTL_MS = 15 * 60 * 1000;

export function isCacheStale(
  fetchedAt: Date | null,
  now = new Date(),
): boolean {
  if (!fetchedAt) return true;
  return now.getTime() - fetchedAt.getTime() >= CACHE_TTL_MS;
}

export async function getCachedActivity(
  db: PrismaClient,
  userId: string,
  type?: ActivityType,
) {
  const where = { userId, ...(type ? { type } : {}) };
  const data = await db.activityCache.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const mostRecent = await db.activityCache.findFirst({
    where: { userId },
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true },
  });

  return {
    data,
    stale: isCacheStale(mostRecent?.fetchedAt ?? null),
  };
}

export async function refreshCache(
  db: PrismaClient,
  userId: string,
  token: string,
  login: string,
) {
  const [commits, prs, reviews] = await Promise.all([
    fetchCommits(token, login),
    fetchPullRequests(token, login),
    fetchReviews(token, login),
  ]);

  const cacheEntries = [
    ...commits.map((c) => ({
      userId,
      type: "commit" as const,
      repoName: c.repoName,
      title: c.message,
      url: c.url,
      sha: c.sha,
      state: null as string | null,
      createdAt: c.createdAt,
    })),
    ...prs.map((p) => ({
      userId,
      type: "pr" as const,
      repoName: p.repoName,
      title: p.title,
      url: p.url,
      state: p.state as string | null,
      sha: null as string | null,
      createdAt: p.createdAt,
    })),
    ...reviews.map((r) => ({
      userId,
      type: "review" as const,
      repoName: r.repoName,
      title: r.title,
      url: r.url,
      state: r.state as string | null,
      sha: null as string | null,
      createdAt: r.createdAt,
    })),
  ];

  await db.$transaction([
    db.activityCache.deleteMany({ where: { userId } }),
    db.activityCache.createMany({ data: cacheEntries }),
  ]);

  return { commits, prs, reviews };
}
