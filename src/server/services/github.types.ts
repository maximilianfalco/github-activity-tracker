export type ActivityType = "commit" | "pr" | "review";
export type PullRequestState = "open" | "draft" | "merged" | "closed";
export type PullRequestReviewStatus =
  | "approved"
  | "changes_requested"
  | "review_pending";
export type PullRequestCIStatus =
  | "ci_passing"
  | "ci_failing"
  | "ci_pending"
  | "ci_unknown";

export interface Commit {
  sha: string;
  message: string;
  repoName: string;
  branch: string | null;
  url: string;
  createdAt: Date;
}

export interface PullRequest {
  number?: number;
  title: string;
  repoName: string;
  url: string;
  state: PullRequestState;
  reviewStatus?: PullRequestReviewStatus;
  ciStatus?: PullRequestCIStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Review {
  title: string;
  repoName: string;
  url: string;
  state: "open" | "merged" | "closed";
  createdAt: Date;
  updatedAt: Date;
}

export interface GitHubEvent {
  type: string;
  repo: { name: string };
  created_at: string;
  payload: {
    ref?: string;
    head?: string;
    before?: string;
    commits?: Array<{
      sha: string;
      message: string;
      url: string;
    }>;
  };
}

export interface GitHubRepoCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      date: string;
    };
  };
}

export interface GitHubSearchResponse {
  total_count: number;
  items: GitHubSearchItem[];
}

export interface GitHubSearchItem {
  title: string;
  html_url: string;
  state: string;
  draft?: boolean;
  created_at: string;
  updated_at: string;
  repository_url: string;
  pull_request?: {
    merged_at: string | null;
  };
}

export interface GitHubPullRequestCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      date: string;
    } | null;
    committer: {
      date: string;
    } | null;
  };
}

export interface GitHubPullRequestReview {
  state: string;
  submitted_at: string | null;
  user: {
    login: string;
  } | null;
}

export interface GitHubPullRequestDetails {
  head: {
    sha: string;
  };
}

export interface GitHubCombinedStatus {
  state: string;
  total_count: number;
}

export interface GitHubCheckRun {
  status: string;
  conclusion: string | null;
}

export interface GitHubCheckRunsResponse {
  total_count: number;
  check_runs: GitHubCheckRun[];
}

export interface GitHubSearchCommitItem {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      date: string;
    };
  };
  repository: {
    full_name: string;
  };
}

export interface GitHubSearchCommitResponse {
  total_count: number;
  items: GitHubSearchCommitItem[];
}

export interface GitHubUser {
  login: string;
  id: number;
}

export class GitHubRateLimitError extends Error {
  constructor(public resetAt: Date) {
    super(`GitHub rate limit exceeded. Resets at ${resetAt.toISOString()}`);
    this.name = "GitHubRateLimitError";
  }
}
