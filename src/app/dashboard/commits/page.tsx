import { Topbar } from "~/components/dashboard/topbar";
import { CommitsContent } from "~/components/commits/commits-content";

export default function CommitsPage() {
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Commits" />
      <CommitsContent />
    </div>
  );
}
