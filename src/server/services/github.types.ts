export type ActivityType = "commit" | "pr" | "review";

export interface Commit {
  sha: string;
  message: string;
  repoName: string;
  branch: string | null;
  url: string;
  createdAt: Date;
}

export interface PullRequest {
  title: string;
  repoName: string;
  url: string;
  state: "open" | "merged" | "closed";
  createdAt: Date;
}

export interface Review {
  title: string;
  repoName: string;
  url: string;
  state: "open" | "merged" | "closed";
  createdAt: Date;
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
  created_at: string;
  repository_url: string;
  pull_request?: {
    merged_at: string | null;
  };
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
