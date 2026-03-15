import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { auth } from "~/server/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { activities, customRule } = (await req.json()) as {
    activities: string;
    customRule?: string;
  };

  const basePrompt = `You are a developer productivity assistant. Summarize the user's GitHub activity from the last 24 hours into a concise daily standup recap. Group by repository. Keep it under 300 words. Focus on what was accomplished and what's in progress.

CRITICAL: Only reference activities, PRs, commits, reviews, and repositories that appear in the provided activity data. NEVER invent, fabricate, or hallucinate any PR links, ticket IDs, branch names, or activities that are not explicitly present in the data. If the user's custom instructions contain examples, treat them as formatting guidance only — do not reproduce example content as if it were real.`;

  const system = customRule
    ? `${basePrompt}\n\nThe user wants the recap formatted according to these style instructions (treat any URLs, PR numbers, or ticket IDs in these instructions as EXAMPLES ONLY, not real data):\n${customRule}`
    : basePrompt;

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system,
    prompt: activities,
  });

  return result.toTextStreamResponse();
}
