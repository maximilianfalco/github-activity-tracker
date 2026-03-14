import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { publicProcedure } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  health: publicProcedure.query(() => ({ status: "ok" })),
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
