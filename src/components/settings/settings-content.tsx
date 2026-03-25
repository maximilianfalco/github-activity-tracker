"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";

interface SettingsForm {
  defaultWindow: number;
  autoRefresh: boolean;
  notifyReviews: boolean;
  notifyStatus: boolean;
  recapCustomRule: string;
  recapIncludeComments: boolean;
}

function getRecapIncludeComments(settings: unknown) {
  if (!settings || typeof settings !== "object") return false;
  if (!("recapIncludeComments" in settings)) return false;
  return Boolean(
    (settings as { recapIncludeComments?: unknown }).recapIncludeComments,
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

export function SettingsContent() {
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
      recapIncludeComments: false,
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
        recapIncludeComments: getRecapIncludeComments(settings.data),
      });
    }
  }, [settings.data, reset]);

  function onSubmit(values: SettingsForm) {
    update.mutate(values);
  }

  return (
    <div className="max-w-lg p-6">
      {settings.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
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
                  <span className="font-mono text-xs">{field.value} days</span>
                )}
              />
            </SettingsRow>
            <SettingsRow label="Auto-refresh">
                <Controller
                  control={control}
                  name="autoRefresh"
                  render={({ field }) => (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="AI Recap">
            <SettingsRow label="Include recent PR discussions">
              <Controller
                control={control}
                name="recapIncludeComments"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </SettingsRow>
            <Controller
              control={control}
              name="recapCustomRule"
              render={({ field }) => (
                <div className="space-y-2 py-2">
                  <p className="text-xs text-muted-foreground">
                    Custom instructions for the AI recap - tone, format,
                    styling, etc.
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
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </SettingsRow>
            <SettingsRow label="PR status changes">
              <Controller
                control={control}
                name="notifyStatus"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
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
  );
}
