import { Topbar } from "~/components/dashboard/topbar";
import { RecapWorkspace } from "~/components/recap/recap-workspace";

export default function RecapPage() {
  return (
    <div className="h-full overflow-y-auto">
      <Topbar title="Recap" />
      <RecapWorkspace />
    </div>
  );
}
