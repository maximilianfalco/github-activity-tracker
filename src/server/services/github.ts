import type {
  Commit,
  PullRequest,
  PullRequestCIStatus,
  PullRequestReviewStatus,
  Review,
  GitHubEvent,
  GitHubRepoCommit,
  GitHubSearchResponse,
  GitHubSearchItem,
  GitHubSearchCommitResponse,
  GitHubSearchCommitItem,
  GitHubUser,
  GitHubPullRequestCommit,
  GitHubPullRequestReview,
  GitHubPullRequestDetails,
  GitHubCombinedStatus,
  GitHubCheckRun,
  GitHubCheckRunsResponse,
  GitHubIssueComment,
  GitHubPullRequestReviewComment,
  PullRequestDiscussionComment,
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
  let state: PullRequest["state"];
  if (item.pull_request?.merged_at) {
    state = "merged";
  } else if (item.state === "open" && item.draft) {
    state = "draft";
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
    updatedAt: new Date(item.updated_at),
  };
}

export function mapSearchItemToReview(item: GitHubSearchItem): Review {
  const repoName = extractRepoName(item.repository_url);
  const state = item.pull_request?.merged_at
    ? "merged"
    : item.state === "open"
      ? "open"
      : "closed";

  return {
    title: item.title,
    repoName,
    url: item.html_url,
    state,
    createdAt: new Date(item.created_at),
    updatedAt: new Date(item.updated_at),
  };
}

export function extractPullRequestNumber(url: string): number | undefined {
  const match = /\/pull\/(\d+)(?:\/|$)/.exec(url);
  const value = match?.[1];
  return value ? Number(value) : undefined;
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
  let url: string | null = `${GITHUB_API}/users/${login}/events?per_page=100`;
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
  const reviews = await Promise.all(
    items.map(async (item) => {
      const review = mapSearchItemToReview(item);
      const prNumber = extractPullRequestNumber(item.html_url);
      if (!prNumber) return null;

      const submittedAt = await fetchLatestSubmittedReviewAt(
        token,
        review.repoName,
        prNumber,
        login,
      );
      if (!submittedAt) return null;

      return {
        ...review,
        createdAt: submittedAt,
        updatedAt: submittedAt,
      };
    }),
  );

  return reviews
    .filter((review): review is Review => review !== null)
    .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function fetchCurrentPullRequests(
  token: string,
  login: string,
  repoNames: string[],
): Promise<PullRequest[]> {
  if (repoNames.length === 0) return [];

  const groups = await Promise.all(
    repoNames.map((repoName) =>
      fetchSearchResults(
        token,
        `is:pr is:open author:${login} repo:${repoName} sort:updated`,
      ),
    ),
  );

  return groups
    .flat()
    .map(mapSearchItemToPR)
    .filter(
      (pr): pr is PullRequest & { number: number } => pr.number !== undefined,
    )
    .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function fetchPullRequestCommits(
  token: string,
  repoName: string,
  prNumber: number,
): Promise<Commit[]> {
  const commits: Commit[] = [];
  let url: string | null =
    `${GITHUB_API}/repos/${repoName}/pulls/${prNumber}/commits?per_page=100`;
  let page = 0;

  while (url && page < 5) {
    const response = await githubFetch(token, url);
    const data = (await response.json()) as GitHubPullRequestCommit[];

    for (const item of data) {
      const authoredAt =
        item.commit.author?.date ?? item.commit.committer?.date ?? null;
      if (!authoredAt) continue;

      commits.push({
        sha: item.sha,
        message: item.commit.message.split("\n")[0]!,
        repoName,
        branch: null,
        url: item.html_url,
        createdAt: new Date(authoredAt),
      });
    }

    url = parseNextUrl(response.headers.get("link"));
    page++;
  }

  return commits.toSorted(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

export async function fetchPullRequestReviewStatus(
  token: string,
  repoName: string,
  prNumber: number,
): Promise<PullRequestReviewStatus> {
  const reviews = await fetchPullRequestReviews(token, repoName, prNumber);
  return derivePullRequestReviewStatus(reviews);
}

export async function fetchPullRequestDiscussionComments(
  token: string,
  repoName: string,
  prNumber: number,
): Promise<PullRequestDiscussionComment[]> {
  const [issueComments, reviews, reviewComments] = await Promise.all([
    fetchIssueComments(token, repoName, prNumber),
    fetchPullRequestReviews(token, repoName, prNumber),
    fetchPullRequestReviewComments(token, repoName, prNumber),
  ]);

  const discussionComments = [
    ...issueComments
      .filter((comment) => comment.body.trim().length > 0)
      .map((comment) => ({
        id: `issue-comment:${comment.id}`,
        author: comment.user?.login ?? null,
        body: comment.body.trim(),
        url: comment.html_url,
        createdAt: new Date(comment.created_at),
        updatedAt: new Date(comment.updated_at),
      })),
    ...reviewComments
      .filter((comment) => comment.body.trim().length > 0)
      .map((comment) => ({
        id: `review-comment:${comment.id}`,
        author: comment.user?.login ?? null,
        body: comment.body.trim(),
        url: comment.html_url,
        createdAt: new Date(comment.created_at),
        updatedAt: new Date(comment.updated_at),
      })),
    ...reviews
      .filter((review) => (review.body?.trim().length ?? 0) > 0)
      .filter((review) => review.submitted_at)
      .map((review) => ({
        id: `review:${review.id ?? review.submitted_at}`,
        author: review.user?.login ?? null,
        body: review.body!.trim(),
        url:
          review.html_url ??
          `https://github.com/${repoName}/pull/${prNumber}#pullrequestreview-${review.id ?? ""}`,
        createdAt: new Date(review.submitted_at!),
        updatedAt: new Date(review.updated_at ?? review.submitted_at!),
      })),
  ];

  return discussionComments.toSorted(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
}

async function fetchPullRequestReviews(
  token: string,
  repoName: string,
  prNumber: number,
): Promise<GitHubPullRequestReview[]> {
  const reviews: GitHubPullRequestReview[] = [];
  let url: string | null =
    `${GITHUB_API}/repos/${repoName}/pulls/${prNumber}/reviews?per_page=100`;
  let page = 0;

  while (url && page < 5) {
    const response = await githubFetch(token, url);
    const data = (await response.json()) as GitHubPullRequestReview[];
    reviews.push(...data);
    url = parseNextUrl(response.headers.get("link"));
    page++;
  }

  return reviews;
}

async function fetchIssueComments(
  token: string,
  repoName: string,
  prNumber: number,
): Promise<GitHubIssueComment[]> {
  const comments: GitHubIssueComment[] = [];
  let url: string | null =
    `${GITHUB_API}/repos/${repoName}/issues/${prNumber}/comments?per_page=100`;
  let page = 0;

  while (url && page < 5) {
    const response = await githubFetch(token, url);
    const data = (await response.json()) as GitHubIssueComment[];
    comments.push(...data);
    url = parseNextUrl(response.headers.get("link"));
    page++;
  }

  return comments;
}

async function fetchPullRequestReviewComments(
  token: string,
  repoName: string,
  prNumber: number,
): Promise<GitHubPullRequestReviewComment[]> {
  const comments: GitHubPullRequestReviewComment[] = [];
  let url: string | null =
    `${GITHUB_API}/repos/${repoName}/pulls/${prNumber}/comments?per_page=100`;
  let page = 0;

  while (url && page < 5) {
    const response = await githubFetch(token, url);
    const data = (await response.json()) as GitHubPullRequestReviewComment[];
    comments.push(...data);
    url = parseNextUrl(response.headers.get("link"));
    page++;
  }

  return comments;
}

async function fetchLatestSubmittedReviewAt(
  token: string,
  repoName: string,
  prNumber: number,
  login: string,
): Promise<Date | null> {
  const reviews = await fetchPullRequestReviews(token, repoName, prNumber);
  return deriveLatestSubmittedReviewAt(reviews, login);
}

export function deriveLatestSubmittedReviewAt(
  reviews: GitHubPullRequestReview[],
  login: string,
): Date | null {
  let latestTimestamp: number | null = null;

  for (const review of reviews) {
    if (review.user?.login !== login || !review.submitted_at) continue;

    const submittedAt = new Date(review.submitted_at).getTime();
    if (!Number.isFinite(submittedAt)) continue;

    if (latestTimestamp === null || submittedAt > latestTimestamp) {
      latestTimestamp = submittedAt;
    }
  }

  return latestTimestamp === null ? null : new Date(latestTimestamp);
}

export function derivePullRequestReviewStatus(
  reviews: GitHubPullRequestReview[],
): PullRequestReviewStatus {
  const latestByReviewer = new Map<
    string,
    { state: string; submittedAt: number }
  >();

  for (const review of reviews) {
    const reviewer = review.user?.login;
    if (!reviewer || !review.submitted_at) continue;

    const normalizedState = review.state.toUpperCase();
    if (
      normalizedState !== "APPROVED" &&
      normalizedState !== "CHANGES_REQUESTED" &&
      normalizedState !== "DISMISSED"
    ) {
      continue;
    }

    const submittedAt = new Date(review.submitted_at).getTime();
    const existing = latestByReviewer.get(reviewer);
    if (!existing || submittedAt > existing.submittedAt) {
      latestByReviewer.set(reviewer, {
        state: normalizedState,
        submittedAt,
      });
    }
  }

  const effectiveStates = [...latestByReviewer.values()].map(
    (review) => review.state,
  );

  if (effectiveStates.includes("CHANGES_REQUESTED")) {
    return "changes_requested";
  }

  if (effectiveStates.includes("APPROVED")) {
    return "approved";
  }

  return "review_pending";
}

export function derivePullRequestCIStatus(
  combinedStatusState: string | null | undefined,
  combinedStatusCount: number | null | undefined,
  checkRuns: GitHubCheckRun[],
): PullRequestCIStatus {
  const normalizedCombined = combinedStatusState?.toLowerCase();
  const hasLegacyStatuses = (combinedStatusCount ?? 0) > 0;
  const normalizedChecks = checkRuns.map((checkRun) => ({
    status: checkRun.status.toLowerCase(),
    conclusion: checkRun.conclusion?.toLowerCase() ?? null,
  }));

  if (
    (normalizedCombined === "pending" && hasLegacyStatuses) ||
    normalizedChecks.some((checkRun) =>
      ["queued", "in_progress", "pending", "requested", "waiting"].includes(
        checkRun.status,
      ),
    )
  ) {
    return "ci_pending";
  }

  if (
    normalizedCombined === "failure" ||
    normalizedCombined === "error" ||
    normalizedChecks.some((checkRun) =>
      [
        "failure",
        "failed",
        "timed_out",
        "cancelled",
        "startup_failure",
        "action_required",
        "stale",
      ].includes(checkRun.conclusion ?? ""),
    )
  ) {
    return "ci_failing";
  }

  if (
    normalizedCombined === "success" ||
    normalizedChecks.some((checkRun) =>
      ["success", "neutral", "skipped"].includes(checkRun.conclusion ?? ""),
    )
  ) {
    return "ci_passing";
  }

  return "ci_unknown";
}

export async function fetchPullRequestCIStatus(
  token: string,
  repoName: string,
  prNumber: number,
): Promise<PullRequestCIStatus> {
  const prResponse = await githubFetch(
    token,
    `${GITHUB_API}/repos/${repoName}/pulls/${prNumber}`,
  );
  const pr = (await prResponse.json()) as GitHubPullRequestDetails;
  const headSha = pr.head.sha;

  const [combinedStatusResponse, checkRunsResponse] = await Promise.allSettled([
    githubFetch(
      token,
      `${GITHUB_API}/repos/${repoName}/commits/${headSha}/status`,
    ),
    githubFetch(
      token,
      `${GITHUB_API}/repos/${repoName}/commits/${headSha}/check-runs?per_page=100`,
    ),
  ]);

  const combinedStatus =
    combinedStatusResponse.status === "fulfilled"
      ? ((await combinedStatusResponse.value.json()) as GitHubCombinedStatus)
      : null;
  const checkRuns =
    checkRunsResponse.status === "fulfilled"
      ? ((await checkRunsResponse.value.json()) as GitHubCheckRunsResponse)
          .check_runs
      : [];

  return derivePullRequestCIStatus(
    combinedStatus?.state,
    combinedStatus?.total_count,
    checkRuns,
  );
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
