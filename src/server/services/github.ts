import type {
  Commit,
  PullRequest,
  Review,
  GitHubEvent,
  GitHubSearchResponse,
  GitHubSearchItem,
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
  return event.payload.commits.map((c) => ({
    sha: c.sha,
    message: c.message.split("\n")[0]!,
    repoName: event.repo.name,
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
  const commits: Commit[] = [];
  let url: string | null =
    `${GITHUB_API}/users/${login}/events?per_page=100`;
  let page = 0;

  while (url && page < 3) {
    const response = await githubFetch(token, url);
    const events = (await response.json()) as GitHubEvent[];
    for (const event of events) {
      commits.push(...mapPushEventToCommits(event));
    }
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
