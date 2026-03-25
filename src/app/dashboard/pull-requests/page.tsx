import { Topbar } from "~/components/dashboard/topbar";
import { PullRequestsWorkspace } from "~/components/pull-requests/pull-requests-workspace";

export default function PullRequestsPage() {
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Pull requests" />
      <PullRequestsWorkspace />
    </div>
  );
}
