"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { api } from "~/trpc/react";
import { Topbar } from "~/components/dashboard/topbar";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";

interface SettingsForm {
  defaultWindow: number;
  autoRefresh: boolean;
  notifyReviews: boolean;
  notifyStatus: boolean;
  recapCustomRule: string;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      type="button"
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
  const router = useRouter();
  const utils = api.useUtils();
  const settings = api.settings.get.useQuery();
  const update = api.settings.update.useMutation({
    onSuccess: async () => {
      await utils.settings.get.invalidate();
    },
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<SettingsForm>({
    defaultValues: {
      defaultWindow: 30,
      autoRefresh: true,
      notifyReviews: true,
      notifyStatus: false,
      recapCustomRule: "",
    },
  });

  useEffect(() => {
    if (settings.data) {
      reset({
        defaultWindow: settings.data.defaultWindow,
        autoRefresh: settings.data.autoRefresh,
        notifyReviews: settings.data.notifyReviews,
        notifyStatus: settings.data.notifyStatus,
        recapCustomRule: settings.data.recapCustomRule ?? "",
      });
    }
  }, [settings.data, reset]);

  function onSubmit(values: SettingsForm) {
    update.mutate(values);
  }

  return (
    <>
      <Topbar title="Settings" />
      <div className="max-w-lg p-6">
        {settings.isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : settings.data ? (
          <form onSubmit={handleSubmit(onSubmit)}>
            <SettingsGroup title="Data range">
              <SettingsRow label="Default window">
                <Controller
                  control={control}
                  name="defaultWindow"
                  render={({ field }) => (
                    <span className="font-mono text-xs">
                      {field.value} days
                    </span>
                  )}
                />
              </SettingsRow>
              <SettingsRow label="Auto-refresh">
                <Controller
                  control={control}
                  name="autoRefresh"
                  render={({ field }) => (
                    <Toggle
                      checked={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </SettingsRow>
            </SettingsGroup>

            <SettingsGroup title="AI Recap">
              <Controller
                control={control}
                name="recapCustomRule"
                render={({ field }) => (
                  <div className="space-y-2 py-2">
                    <p className="text-xs text-muted-foreground">
                      Custom instructions for the AI recap — tone, format, styling, etc.
                    </p>
                    <div
                      className="grid max-h-60 overflow-y-auto after:invisible after:whitespace-pre-wrap after:rounded-md after:border after:border-border after:px-3 after:py-2 after:text-xs after:content-[attr(data-value)_'_'] after:[grid-area:1/1/2/2]"
                      data-value={field.value}
                    >
                      <textarea
                        {...field}
                        placeholder="e.g. Use a casual tone, keep it short, use bullet points only, no headers..."
                        rows={2}
                        className="w-full resize-none overflow-hidden rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring [grid-area:1/1/2/2]"
                      />
                    </div>
                  </div>
                )}
              />
            </SettingsGroup>

            <SettingsGroup title="Notifications">
              <SettingsRow label="PR review requests">
                <Controller
                  control={control}
                  name="notifyReviews"
                  render={({ field }) => (
                    <Toggle
                      checked={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </SettingsRow>
              <SettingsRow label="PR status changes">
                <Controller
                  control={control}
                  name="notifyStatus"
                  render={({ field }) => (
                    <Toggle
                      checked={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              </SettingsRow>
            </SettingsGroup>

            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={update.isPending || !isDirty}
              >
                {update.isPending ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => router.push("/dashboard")}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </>
  );
}
