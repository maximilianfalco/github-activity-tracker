import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { githubRouter } from "~/server/api/routers/github";
import { settingsRouter } from "~/server/api/routers/settings";

export const appRouter = createTRPCRouter({
  github: githubRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
