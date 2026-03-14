import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { auth } from "~/server/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { activities } = (await req.json()) as { activities: string };

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: `You are a developer productivity assistant. Summarize the user's GitHub activity from the last 24 hours into a concise daily standup recap. Group by repository. Use markdown with headers and bullet points. Keep it under 300 words. Focus on what was accomplished and what's in progress.`,
    prompt: activities,
  });

  return result.toTextStreamResponse();
}
