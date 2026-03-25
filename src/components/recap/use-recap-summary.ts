"use client";

import { useEffect, useMemo, useState } from "react";
import { hashString, readSummaryCache, writeSummaryCache } from "~/components/recap/recap-shared";

const STORAGE_KEY = "recap-summary-cache-v1";

export function useRecapSummary({
  recapActivities,
  selectedWindow,
  cutoffIso,
  hours,
  includedTypes,
  includedRepos,
  customRule,
  includeComments,
  hasSelectedActivity,
  isHydratingDetails,
}: {
  recapActivities: string;
  selectedWindow: string;
  cutoffIso: string | null;
  hours: number;
  includedTypes: string[];
  includedRepos: string[];
  customRule: string;
  includeComments: boolean;
  hasSelectedActivity: boolean;
  isHydratingDetails: boolean;
}) {
  const [completion, setCompletion] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const recapCacheKey = useMemo(() => {
    const cacheInput = JSON.stringify({
      window: selectedWindow,
      cutoffIso,
      hours,
      includedTypes,
      includedRepos,
      customRule,
      includeComments,
      activities: recapActivities,
    });

    return hashString(cacheInput);
  }, [
    customRule,
    cutoffIso,
    hours,
    includeComments,
    includedRepos,
    includedTypes,
    recapActivities,
    selectedWindow,
  ]);

  useEffect(() => {
    const saved = readSummaryCache(STORAGE_KEY)[recapCacheKey] ?? "";
    setCompletion(saved);
  }, [recapCacheKey]);

  function showToast(message: string) {
    setToastMessage(message);
    window.clearTimeout((showToast as typeof showToast & { timeoutId?: number }).timeoutId);
    (showToast as typeof showToast & { timeoutId?: number }).timeoutId =
      window.setTimeout(() => setToastMessage(null), 2000);
  }

  async function copyToClipboard(text: string, message: string) {
    await navigator.clipboard.writeText(text);
    showToast(message);
  }

  function updateCompletion(text: string, cacheKey = recapCacheKey) {
    setCompletion(text);
    writeSummaryCache(STORAGE_KEY, (cache) => {
      if (!text) {
        const { [cacheKey]: removedValue, ...rest } = cache;
        void removedValue;
        return rest;
      }

      return {
        ...cache,
        [cacheKey]: text,
      };
    });
  }

  async function generateSummary() {
    if (!hasSelectedActivity || isHydratingDetails || !recapActivities) return;

    const cachedSummary = readSummaryCache(STORAGE_KEY)[recapCacheKey];
    if (cachedSummary) {
      setCompletion(cachedSummary);
      return;
    }

    setIsGenerating(true);
    setCompletion("");

    const response = await fetch("/api/recap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activities: recapActivities,
        customRule: customRule || undefined,
      }),
    });

    if (!response.ok || !response.body) {
      setIsGenerating(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      setCompletion(text);
    }

    updateCompletion(text);
    setIsGenerating(false);
  }

  return {
    completion,
    copyToClipboard,
    generateSummary,
    isGenerating,
    toastMessage,
    updateCompletion,
  };
}
