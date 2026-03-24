import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const settingsRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.userSettings.findUnique({
      where: { userId: ctx.session.user.id },
    });

    return (
      settings ?? {
        defaultWindow: 30,
        autoRefresh: true,
        notifyReviews: true,
        notifyStatus: false,
        recapIncludedRepos: [] as string[],
        recapCustomRule: "",
        recapIncludeComments: false,
      }
    );
  }),

  update: protectedProcedure
    .input(
      z.object({
        defaultWindow: z.number().int().min(1).max(90).optional(),
        autoRefresh: z.boolean().optional(),
        notifyReviews: z.boolean().optional(),
        notifyStatus: z.boolean().optional(),
        recapIncludedRepos: z.array(z.string()).optional(),
        recapCustomRule: z.string().optional(),
        recapIncludeComments: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.userSettings.upsert({
        where: { userId: ctx.session.user.id },
        create: { userId: ctx.session.user.id, ...input },
        update: input,
      });
    }),
});
