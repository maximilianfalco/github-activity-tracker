"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { GithubIcon } from "@hugeicons/core-free-icons";
import { Button } from "~/components/ui/button";
import {
  DashboardSquare01Icon,
  Clock01Icon,
  GitCommitIcon,
  GitPullRequestIcon,
  EyeIcon,
  Folder01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";

const navItems = [
  { title: "Overview", href: "/dashboard", icon: DashboardSquare01Icon },
  { title: "Recap", href: "/dashboard/recap", icon: Clock01Icon },
  { title: "Commits", href: "/dashboard/commits", icon: GitCommitIcon },
  {
    title: "Pull requests",
    href: "/dashboard/pull-requests",
    icon: GitPullRequestIcon,
  },
  { title: "Reviews", href: "/dashboard/reviews", icon: EyeIcon },
  { title: "Repos", href: "/dashboard/repos", icon: Folder01Icon },
  { title: "Settings", href: "/dashboard/settings", icon: Settings01Icon },
];

export function AppSidebar({
  user,
}: {
  user: { name?: string | null; image?: string | null };
}) {
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    try {
      setIsLoggingOut(true);
      await fetch("/api/shared-logout", {
        method: "POST",
      });
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2 align-middle">
          <span className="text-sm font-medium">GitHub Activity</span>
          <Button variant="ghost" size="icon-sm" asChild>
            <a
              href="https://github.com/maximilianfalco/github-activity-tracker"
              target="_blank"
              rel="noopener noreferrer"
            >
              <HugeiconsIcon icon={GithubIcon} />
            </a>
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.href}>
                        <HugeiconsIcon icon={item.icon} size={16} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={user.image ?? undefined} />
              <AvatarFallback className="text-[10px]">
                {user.name
                  ?.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <span className="text-muted-foreground text-xs">{user.name}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Logging out..." : "Log out everywhere"}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
