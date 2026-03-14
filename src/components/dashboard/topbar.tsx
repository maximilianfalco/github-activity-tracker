import { SidebarTrigger } from "~/components/ui/sidebar";
import { RefreshButton } from "./refresh-button";

export function Topbar({ title }: { title: string }) {
  return (
    <header className="border-border flex h-12 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <h1 className="text-sm font-medium">{title}</h1>

      <div className="ml-auto">
        <RefreshButton />
      </div>
    </header>
  );
}
