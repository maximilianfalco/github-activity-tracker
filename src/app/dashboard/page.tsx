import { Topbar } from "~/components/dashboard/topbar";
import { OverviewContent } from "~/components/dashboard/overview-content";

export default function DashboardPage() {
  return (
    <>
      <Topbar title="Overview" />
      <OverviewContent />
    </>
  );
}
