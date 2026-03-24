import type { PrismaClient } from "../../../generated/prisma";
import type { ActivityType } from "./github.types";
import { fetchCommits, fetchPullRequests, fetchReviews } from "./github";

export const CACHE_TTL_MS = 15 * 60 * 1000;
export const RECAP_CACHE_TTL_MS = 2 * 60 * 1000;

export function isCacheStale(
  fetchedAt: Date | null,
  ttlMs = CACHE_TTL_MS,
  now = new Date(),
): boolean {
  if (!fetchedAt) return true;
  return now.getTime() - fetchedAt.getTime() >= ttlMs;
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
    fetchedAt: mostRecent?.fetchedAt ?? null,
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

  const seenSha = new Set<string>();
  const dedupedCommits = commits.filter((c) => {
    if (seenSha.has(c.sha)) return false;
    seenSha.add(c.sha);
    return true;
  });

  const cacheEntries = [
    ...dedupedCommits.map((c) => ({
      userId,
      type: "commit" as const,
      repoName: c.repoName,
      title: c.message,
      url: c.url,
      sha: c.sha,
      branch: c.branch,
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
      branch: null as string | null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    ...reviews.map((r) => ({
      userId,
      type: "review" as const,
      repoName: r.repoName,
      title: r.title,
      url: r.url,
      state: r.state as string | null,
      sha: null as string | null,
      branch: null as string | null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  ];

  await db.$transaction([
    db.activityCache.deleteMany({ where: { userId } }),
    db.activityCache.createMany({ data: cacheEntries }),
  ]);

  return { commits, prs, reviews };
}
