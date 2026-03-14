import { api } from "~/trpc/react";

const POLL_MS = 15 * 60 * 1000;

export function usePollInterval() {
  const settings = api.settings.get.useQuery();
  return settings.data?.autoRefresh ? POLL_MS : false;
}
