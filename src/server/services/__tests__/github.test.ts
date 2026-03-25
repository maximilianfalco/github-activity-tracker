import { describe, it, expect } from "vitest";
import {
  parseNextUrl,
  mapPushEventToCommits,
  mapSearchItemToPR,
  mapSearchItemToReview,
  mapSearchCommitToCommit,
  extractRepoName,
  derivePullRequestCIStatus,
  deriveLatestSubmittedReviewAt,
} from "../github";
import { isCacheStale, CACHE_TTL_MS } from "../cache";
import type {
  GitHubEvent,
  GitHubCheckRun,
  GitHubPullRequestReview,
  GitHubSearchItem,
  GitHubSearchCommitItem,
} from "../github.types";

describe("parseNextUrl", () => {
  it("extracts next URL from Link header", () => {
    const link =
      '<https://api.github.com/users/test/events?page=2>; rel="next", <https://api.github.com/users/test/events?page=3>; rel="last"';
    expect(parseNextUrl(link)).toBe(
      "https://api.github.com/users/test/events?page=2",
    );
  });

  it("returns null when no Link header", () => {
    expect(parseNextUrl(null)).toBeNull();
  });

  it("returns null when no next rel", () => {
    const link =
      '<https://api.github.com/users/test/events?page=1>; rel="prev"';
    expect(parseNextUrl(link)).toBeNull();
  });

  it("handles Link header with only next", () => {
    const link =
      '<https://api.github.com/search/issues?q=test&page=3>; rel="next"';
    expect(parseNextUrl(link)).toBe(
      "https://api.github.com/search/issues?q=test&page=3",
    );
  });
});

describe("extractRepoName", () => {
  it("extracts owner/name from repository URL", () => {
    expect(extractRepoName("https://api.github.com/repos/owner/repo")).toBe(
      "owner/repo",
    );
  });

  it("handles nested org/repo paths", () => {
    expect(extractRepoName("https://api.github.com/repos/my-org/my-repo")).toBe(
      "my-org/my-repo",
    );
  });

  it("returns input if /repos/ not found", () => {
    expect(extractRepoName("https://example.com/something")).toBe(
      "https://example.com/something",
    );
  });
});

describe("mapPushEventToCommits", () => {
  const baseEvent: GitHubEvent = {
    type: "PushEvent",
    repo: { name: "owner/repo" },
    created_at: "2024-01-15T10:00:00Z",
    payload: {
      ref: "refs/heads/main",
      commits: [
        {
          sha: "abc123def456",
          message: "fix: resolve bug\n\nDetailed description",
          url: "https://api.github.com/repos/owner/repo/commits/abc123def456",
        },
      ],
    },
  };

  it("maps PushEvent commits correctly", () => {
    const commits = mapPushEventToCommits(baseEvent);
    expect(commits).toHaveLength(1);
    expect(commits[0]).toEqual({
      sha: "abc123def456",
      message: "fix: resolve bug",
      repoName: "owner/repo",
      branch: "main",
      url: "https://github.com/owner/repo/commit/abc123def456",
      createdAt: new Date("2024-01-15T10:00:00Z"),
    });
  });

  it("uses web URL, not API URL from payload", () => {
    const commits = mapPushEventToCommits(baseEvent);
    expect(commits[0]!.url).not.toContain("api.github.com");
    expect(commits[0]!.url).toBe(
      "https://github.com/owner/repo/commit/abc123def456",
    );
  });

  it("takes only first line of multi-line commit message", () => {
    const commits = mapPushEventToCommits(baseEvent);
    expect(commits[0]!.message).toBe("fix: resolve bug");
    expect(commits[0]!.message).not.toContain("Detailed description");
  });

  it("returns empty array for non-PushEvent", () => {
    const event = { ...baseEvent, type: "WatchEvent" };
    expect(mapPushEventToCommits(event)).toEqual([]);
  });

  it("returns empty array when no commits in payload", () => {
    const event = { ...baseEvent, payload: {} };
    expect(mapPushEventToCommits(event)).toEqual([]);
  });

  it("handles multiple commits in single push", () => {
    const event: GitHubEvent = {
      ...baseEvent,
      payload: {
        commits: [
          { sha: "aaa", message: "first", url: "" },
          { sha: "bbb", message: "second", url: "" },
          { sha: "ccc", message: "third", url: "" },
        ],
      },
    };
    const commits = mapPushEventToCommits(event);
    expect(commits).toHaveLength(3);
    expect(commits.map((c) => c.sha)).toEqual(["aaa", "bbb", "ccc"]);
  });
});

describe("mapSearchItemToPR", () => {
  const baseItem: GitHubSearchItem = {
    title: "feat: add feature",
    html_url: "https://github.com/owner/repo/pull/42",
    state: "open",
    created_at: "2024-01-15T10:00:00Z",
    updated_at: "2024-01-15T12:00:00Z",
    repository_url: "https://api.github.com/repos/owner/repo",
    pull_request: { merged_at: null },
  };

  it("maps open PR correctly", () => {
    const pr = mapSearchItemToPR(baseItem);
    expect(pr).toEqual({
      number: 42,
      title: "feat: add feature",
      repoName: "owner/repo",
      url: "https://github.com/owner/repo/pull/42",
      state: "open",
      createdAt: new Date("2024-01-15T10:00:00Z"),
      updatedAt: new Date("2024-01-15T12:00:00Z"),
    });
  });

  it("maps merged PR via pull_request.merged_at", () => {
    const item: GitHubSearchItem = {
      ...baseItem,
      state: "closed",
      pull_request: { merged_at: "2024-01-16T10:00:00Z" },
    };
    expect(mapSearchItemToPR(item).state).toBe("merged");
  });

  it("maps closed (not merged) PR correctly", () => {
    const item: GitHubSearchItem = {
      ...baseItem,
      state: "closed",
      pull_request: { merged_at: null },
    };
    expect(mapSearchItemToPR(item).state).toBe("closed");
  });

  it("handles item without pull_request field", () => {
    const item: GitHubSearchItem = {
      ...baseItem,
      state: "closed",
      pull_request: undefined,
    };
    expect(mapSearchItemToPR(item).state).toBe("closed");
  });
});

describe("mapSearchItemToReview", () => {
  it("delegates to mapSearchItemToPR for mapping", () => {
    const item: GitHubSearchItem = {
      title: "reviewed PR",
      html_url: "https://github.com/owner/repo/pull/99",
      state: "closed",
      created_at: "2024-01-15T10:00:00Z",
      updated_at: "2024-01-16T00:00:00Z",
      repository_url: "https://api.github.com/repos/owner/repo",
      pull_request: { merged_at: "2024-01-16T00:00:00Z" },
    };
    const review = mapSearchItemToReview(item);
    expect(review.state).toBe("merged");
    expect(review.repoName).toBe("owner/repo");
  });

  it("maps draft PRs to draft review state", () => {
    const item: GitHubSearchItem = {
      title: "draft PR awaiting review",
      html_url: "https://github.com/owner/repo/pull/100",
      state: "open",
      draft: true,
      created_at: "2024-01-15T10:00:00Z",
      updated_at: "2024-01-16T00:00:00Z",
      repository_url: "https://api.github.com/repos/owner/repo",
      pull_request: { merged_at: null },
    };

    expect(mapSearchItemToReview(item).state).toBe("draft");
  });
});

describe("deriveLatestSubmittedReviewAt", () => {
  it("returns the latest submitted review timestamp for the given reviewer", () => {
    const reviews: GitHubPullRequestReview[] = [
      {
        state: "COMMENTED",
        submitted_at: "2024-01-10T10:00:00Z",
        user: { login: "alice" },
      },
      {
        state: "APPROVED",
        submitted_at: "2024-01-12T15:30:00Z",
        user: { login: "max" },
      },
      {
        state: "CHANGES_REQUESTED",
        submitted_at: "2024-01-11T09:00:00Z",
        user: { login: "max" },
      },
    ];

    expect(deriveLatestSubmittedReviewAt(reviews, "max")).toEqual(
      new Date("2024-01-12T15:30:00Z"),
    );
  });

  it("ignores pending or unrelated reviews", () => {
    const reviews: GitHubPullRequestReview[] = [
      {
        state: "PENDING",
        submitted_at: null,
        user: { login: "max" },
      },
      {
        state: "APPROVED",
        submitted_at: "2024-01-12T15:30:00Z",
        user: { login: "alice" },
      },
    ];

    expect(deriveLatestSubmittedReviewAt(reviews, "max")).toBeNull();
  });
});

describe("derivePullRequestCIStatus", () => {
  it("returns pending when checks are still running", () => {
    const checkRuns: GitHubCheckRun[] = [
      { status: "queued", conclusion: null },
      { status: "completed", conclusion: "success" },
    ];

    expect(derivePullRequestCIStatus("success", 1, checkRuns)).toBe(
      "ci_pending",
    );
  });

  it("returns failing when a completed check failed", () => {
    const checkRuns: GitHubCheckRun[] = [
      { status: "completed", conclusion: "failure" },
    ];

    expect(derivePullRequestCIStatus("success", 1, checkRuns)).toBe(
      "ci_failing",
    );
  });

  it("returns passing when checks succeeded", () => {
    const checkRuns: GitHubCheckRun[] = [
      { status: "completed", conclusion: "success" },
    ];

    expect(derivePullRequestCIStatus("success", 1, checkRuns)).toBe(
      "ci_passing",
    );
  });

  it("returns unknown when no signal is available", () => {
    expect(derivePullRequestCIStatus(null, 0, [])).toBe("ci_unknown");
  });

  it("ignores empty combined pending when check runs have passed", () => {
    const checkRuns: GitHubCheckRun[] = [
      { status: "completed", conclusion: "success" },
    ];

    expect(derivePullRequestCIStatus("pending", 0, checkRuns)).toBe(
      "ci_passing",
    );
  });
});

describe("mapSearchCommitToCommit", () => {
  const baseItem: GitHubSearchCommitItem = {
    sha: "abc123def456",
    html_url: "https://github.com/owner/repo/commit/abc123def456",
    commit: {
      message: "feat: add new feature\n\nDetailed body here",
      author: { date: "2024-01-15T10:00:00Z" },
    },
    repository: { full_name: "owner/repo" },
  };

  it("maps search commit item correctly", () => {
    const commit = mapSearchCommitToCommit(baseItem);
    expect(commit).toEqual({
      sha: "abc123def456",
      message: "feat: add new feature",
      repoName: "owner/repo",
      branch: null,
      url: "https://github.com/owner/repo/commit/abc123def456",
      createdAt: new Date("2024-01-15T10:00:00Z"),
    });
  });

  it("takes only first line of multi-line commit message", () => {
    const commit = mapSearchCommitToCommit(baseItem);
    expect(commit.message).toBe("feat: add new feature");
    expect(commit.message).not.toContain("Detailed body");
  });

  it("handles single-line commit message", () => {
    const item: GitHubSearchCommitItem = {
      ...baseItem,
      commit: { ...baseItem.commit, message: "simple fix" },
    };
    expect(mapSearchCommitToCommit(item).message).toBe("simple fix");
  });
});

describe("isCacheStale", () => {
  it("returns true when fetchedAt is null", () => {
    expect(isCacheStale(null)).toBe(true);
  });

  it("returns false when cache is fresh (5 min old)", () => {
    const now = new Date("2024-01-15T10:05:00Z");
    const fetchedAt = new Date("2024-01-15T10:00:00Z");
    expect(isCacheStale(fetchedAt, undefined, now)).toBe(false);
  });

  it("returns true when cache exceeds TTL (20 min old)", () => {
    const now = new Date("2024-01-15T10:20:00Z");
    const fetchedAt = new Date("2024-01-15T10:00:00Z");
    expect(isCacheStale(fetchedAt, undefined, now)).toBe(true);
  });

  it("returns true at exact TTL boundary (15 min)", () => {
    const now = new Date("2024-01-15T10:15:00Z");
    const fetchedAt = new Date("2024-01-15T10:00:00Z");
    expect(isCacheStale(fetchedAt, undefined, now)).toBe(true);
  });

  it("returns false 1ms before TTL", () => {
    const fetchedAt = new Date("2024-01-15T10:00:00.000Z");
    const now = new Date(fetchedAt.getTime() + CACHE_TTL_MS - 1);
    expect(isCacheStale(fetchedAt, undefined, now)).toBe(false);
  });
});
