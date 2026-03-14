import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

import { db } from "~/server/db";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession["user"];
    accessToken: string | null;
    githubLogin: string | null;
  }
}

export const authConfig = {
  providers: [
    GitHubProvider({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      authorization: {
        params: { scope: "repo read:user read:org" },
      },
    }),
  ],
  adapter: PrismaAdapter(db),
  callbacks: {
    session: async ({ session, user }) => {
      const account = await db.account.findFirst({
        where: { userId: user.id, provider: "github" },
      });

      return {
        ...session,
        user: {
          ...session.user,
          id: user.id,
        },
        accessToken: account?.access_token ?? null,
        githubLogin: null,
      };
    },
  },
} satisfies NextAuthConfig;
