import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

import { db } from "~/server/db";

async function persistGitHubAccountToken(input: {
  userId?: string;
  provider?: string;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
}) {
  if (
    !input.userId ||
    input.provider !== "github" ||
    !input.access_token
  ) {
    return;
  }

  await db.account.updateMany({
    where: {
      userId: input.userId,
      provider: "github",
    },
    data: {
      access_token: input.access_token,
      refresh_token: input.refresh_token ?? undefined,
      expires_at: input.expires_at ?? undefined,
      token_type: input.token_type ?? undefined,
      scope: input.scope ?? undefined,
    },
  });
}

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
    signIn: async ({ user, account }) => {
      await persistGitHubAccountToken({
        userId: user.id,
        provider: account?.provider,
        access_token: account?.access_token,
        refresh_token: account?.refresh_token,
        expires_at: account?.expires_at,
        token_type: account?.token_type,
        scope: account?.scope,
      });

      return true;
    },
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
  events: {
    linkAccount: async ({ user, account }) => {
      await persistGitHubAccountToken({
        userId: user.id,
        provider: account.provider,
        access_token: account.access_token,
        refresh_token: account.refresh_token,
        expires_at: account.expires_at,
        token_type: account.token_type,
        scope: account.scope,
      });
    },
  },
} satisfies NextAuthConfig;
