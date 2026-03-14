import type {
  Commit,
  PullRequest,
  Review,
  GitHubEvent,
  GitHubRepoCommit,
  GitHubSearchResponse,
  GitHubSearchItem,
  GitHubSearchCommitResponse,
  GitHubSearchCommitItem,
  GitHubUser,
} from "./github.types";
import { GitHubRateLimitError } from "./github.types";

const GITHUB_API = "https://api.github.com";

// --- Pure mapping functions (exported for testing) ---

export function parseNextUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = /<([^>]+)>;\s*rel="next"/.exec(linkHeader);
  return match?.[1] ?? null;
}

export function extractRepoName(repositoryUrl: string): string {
  const parts = repositoryUrl.split("/repos/");
  return parts[1] ?? repositoryUrl;
}

export function mapPushEventToCommits(event: GitHubEvent): Commit[] {
  if (event.type !== "PushEvent" || !event.payload.commits) return [];
  const branch = event.payload.ref?.replace("refs/heads/", "") ?? null;
  return event.payload.commits.map((c) => ({
    sha: c.sha,
    message: c.message.split("\n")[0]!,
    repoName: event.repo.name,
    branch,
    url: `https://github.com/${event.repo.name}/commit/${c.sha}`,
    createdAt: new Date(event.created_at),
  }));
}

export function mapSearchItemToPR(item: GitHubSearchItem): PullRequest {
  const repoName = extractRepoName(item.repository_url);
  let state: "open" | "merged" | "closed";
  if (item.pull_request?.merged_at) {
    state = "merged";
  } else if (item.state === "open") {
    state = "open";
  } else {
    state = "closed";
  }
  return {
    title: item.title,
    repoName,
    url: item.html_url,
    state,
    createdAt: new Date(item.created_at),
  };
}

export function mapSearchItemToReview(item: GitHubSearchItem): Review {
  return mapSearchItemToPR(item);
}

export function mapSearchCommitToCommit(
  item: GitHubSearchCommitItem,
  branch?: string,
): Commit {
  return {
    sha: item.sha,
    message: item.commit.message.split("\n")[0]!,
    repoName: item.repository.full_name,
    branch: branch ?? null,
    url: item.html_url,
    createdAt: new Date(item.commit.author.date),
  };
}

// --- API client ---

async function githubFetch(token: string, url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (response.status === 403) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      const resetTimestamp = response.headers.get("x-ratelimit-reset");
      const resetAt = new Date(Number(resetTimestamp) * 1000);
      throw new GitHubRateLimitError(resetAt);
    }
  }

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`,
    );
  }

  return response;
}

// --- Fetch functions ---

export async function fetchLogin(token: string): Promise<string> {
  const response = await githubFetch(token, `${GITHUB_API}/user`);
  const user = (await response.json()) as GitHubUser;
  return user.login;
}

export async function fetchCommits(
  token: string,
  login: string,
): Promise<Commit[]> {
  const [eventCommits, searchCommits] = await Promise.all([
    fetchCommitsFromEvents(token, login),
    fetchCommitsFromSearch(token, login),
  ]);

  const seen = new Set<string>();
  const merged: Commit[] = [];
  for (const commit of [...eventCommits, ...searchCommits]) {
    if (!seen.has(commit.sha)) {
      seen.add(commit.sha);
      merged.push(commit);
    }
  }

  return merged.toSorted(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

async function fetchCommitsFromEvents(
  token: string,
  login: string,
): Promise<Commit[]> {
  const branches = new Map<string, string>();
  let url: string | null =
    `${GITHUB_API}/users/${login}/events?per_page=100`;
  let page = 0;

  while (url && page < 3) {
    const response = await githubFetch(token, url);
    const events = (await response.json()) as GitHubEvent[];
    for (const event of events) {
      if (event.type !== "PushEvent" || !event.payload.ref) continue;
      const branch = event.payload.ref.replace("refs/heads/", "");
      const key = `${event.repo.name}:${branch}`;
      if (!branches.has(key)) {
        branches.set(key, `${event.repo.name}:${branch}`);
      }
    }
    url = parseNextUrl(response.headers.get("link"));
    page++;
  }

  const BASE_BRANCHES = new Set(["main", "master", "next", "develop", "dev"]);
  const branchKeys = [...branches.keys()].toSorted((a, b) => {
    const branchA = splitRepoBranch(a)[1];
    const branchB = splitRepoBranch(b)[1];
    const aBase = BASE_BRANCHES.has(branchA) ? 0 : 1;
    const bBase = BASE_BRANCHES.has(branchB) ? 0 : 1;
    return aBase - bBase;
  });

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const seen = new Set<string>();
  const result: Commit[] = [];

  for (const key of branchKeys) {
    const [repoName, branch] = splitRepoBranch(key);
    try {
      const res = await githubFetch(
        token,
        `${GITHUB_API}/repos/${repoName}/commits?author=${login}&sha=${encodeURIComponent(branch)}&per_page=100&since=${since}`,
      );
      const items = (await res.json()) as GitHubRepoCommit[];
      for (const c of items) {
        if (seen.has(c.sha)) continue;
        seen.add(c.sha);
        result.push({
          sha: c.sha,
          message: c.commit.message.split("\n")[0]!,
          repoName,
          branch,
          url: c.html_url,
          createdAt: new Date(c.commit.author.date),
        });
      }
    } catch {
      // skip branch on error
    }
  }

  return result;
}

function splitRepoBranch(key: string): [string, string] {
  const idx = key.indexOf(":", key.indexOf("/") + 1);
  return [key.slice(0, idx), key.slice(idx + 1)];
}

async function fetchCommitsFromSearch(
  token: string,
  login: string,
): Promise<Commit[]> {
  const commits: Commit[] = [];
  let url: string | null =
    `${GITHUB_API}/search/commits?q=${encodeURIComponent(`author:${login}`)}&sort=author-date&order=desc&per_page=100`;
  let page = 0;

  while (url && page < 3) {
    const response = await githubFetch(token, url);
    const data = (await response.json()) as GitHubSearchCommitResponse;
    commits.push(...data.items.map((item) => mapSearchCommitToCommit(item)));
    url = parseNextUrl(response.headers.get("link"));
    page++;
  }

  return commits;
}

export async function fetchPullRequests(
  token: string,
  login: string,
): Promise<PullRequest[]> {
  const items = await fetchSearchResults(
    token,
    `is:pr author:${login} sort:updated`,
  );
  return items.map(mapSearchItemToPR);
}

export async function fetchReviews(
  token: string,
  login: string,
): Promise<Review[]> {
  const items = await fetchSearchResults(
    token,
    `is:pr reviewed-by:${login} -author:${login} sort:updated`,
  );
  return items.map(mapSearchItemToReview);
}

async function fetchSearchResults(
  token: string,
  query: string,
): Promise<GitHubSearchItem[]> {
  const items: GitHubSearchItem[] = [];
  let url: string | null =
    `${GITHUB_API}/search/issues?q=${encodeURIComponent(query)}&per_page=100`;
  let page = 0;

  while (url && page < 10) {
    const response = await githubFetch(token, url);
    const data = (await response.json()) as GitHubSearchResponse;
    items.push(...data.items);
    url = parseNextUrl(response.headers.get("link"));
    page++;
  }

  return items;
}
