import type { Session } from "next-auth";
import { db } from "~/server/db";

export async function getSharedLocalSession(): Promise<Session | null> {
  const accounts = await db.account.findMany({
    where: {
      provider: "github",
      access_token: {
        not: null,
      },
    },
    include: {
      user: true,
    },
    orderBy: {
      userId: "asc",
    },
    take: 2,
  });

  if (accounts.length !== 1) {
    return null;
  }

  const account = accounts[0];
  if (!account?.access_token) {
    return null;
  }

  return {
    user: {
      id: account.user.id,
      name: account.user.name,
      email: account.user.email,
      image: account.user.image,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    accessToken: account.access_token,
    githubLogin: null,
  };
}
