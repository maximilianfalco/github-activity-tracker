"use client";

import { api } from "~/trpc/react";
import { Topbar } from "~/components/dashboard/topbar";
import { Skeleton } from "~/components/ui/skeleton";

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-4 w-7 rounded-full transition-colors ${
        checked ? "bg-green-600" : "bg-muted"
      }`}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
          checked ? "left-3.5" : "left-0.5"
        }`}
      />
    </button>
  );
}

function SettingsRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-xs font-medium">{title}</h3>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const utils = api.useUtils();
  const settings = api.settings.get.useQuery();
  const update = api.settings.update.useMutation({
    onSuccess: async () => {
      await utils.settings.get.invalidate();
    },
  });

  if (settings.isLoading) {
    return (
      <>
        <Topbar title="Settings" />
        <div className="space-y-4 p-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </>
    );
  }

  const data = settings.data;
  if (!data) return null;

  return (
    <>
      <Topbar title="Settings" />
      <div className="max-w-lg p-6">
        <SettingsGroup title="Data range">
          <SettingsRow label="Default window">
            <span className="font-mono text-xs">
              {data.defaultWindow} days
            </span>
          </SettingsRow>
          <SettingsRow label="Auto-refresh">
            <Toggle
              checked={data.autoRefresh}
              onChange={(val) => update.mutate({ autoRefresh: val })}
            />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title="Notifications">
          <SettingsRow label="PR review requests">
            <Toggle
              checked={data.notifyReviews}
              onChange={(val) => update.mutate({ notifyReviews: val })}
            />
          </SettingsRow>
          <SettingsRow label="PR status changes">
            <Toggle
              checked={data.notifyStatus}
              onChange={(val) => update.mutate({ notifyStatus: val })}
            />
          </SettingsRow>
        </SettingsGroup>
      </div>
    </>
  );
}
