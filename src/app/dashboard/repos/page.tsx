import { Topbar } from "~/components/dashboard/topbar";
import { ReposContent } from "~/components/repos/repos-content";

export default function ReposPage() {
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Repos" />
      <ReposContent />
    </div>
  );
}
