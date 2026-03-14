import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { SidebarProvider, SidebarInset } from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/app-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/api/auth/signin");
  }

  void api.github.getOverview.prefetch();
  void api.github.getCommits.prefetch({ dateRange: "1d" });
  void api.github.getPullRequests.prefetch({ dateRange: "7d" });
  void api.github.getReviews.prefetch({ dateRange: "1d" });
  void api.github.getRepoBreakdown.prefetch();
  void api.github.getRecap.prefetch();
  void api.settings.get.prefetch();

  return (
    <HydrateClient>
      <SidebarProvider>
        <AppSidebar user={session.user} />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </HydrateClient>
  );
}
