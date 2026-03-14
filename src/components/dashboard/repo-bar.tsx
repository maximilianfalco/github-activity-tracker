interface RepoBarProps {
  repoName: string;
  commits: number;
  prs: number;
  maxTotal: number;
}

export function RepoBar({ repoName, commits, prs, maxTotal }: RepoBarProps) {
  const total = commits + prs;
  const widthPercent = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

  return (
    <a
      href={`https://github.com/${repoName}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 border-b border-border py-2.5 transition-colors last:border-0 hover:bg-secondary/50"
    >
      <span className="w-36 shrink-0 truncate font-mono text-xs font-medium">
        {repoName}
      </span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${widthPercent}%` }}
        />
      </div>
      <div className="flex shrink-0 gap-3">
        <span className="text-[11px] text-muted-foreground">
          {commits} commits
        </span>
        <span className="text-[11px] text-muted-foreground">{prs} PRs</span>
      </div>
    </a>
  );
}
