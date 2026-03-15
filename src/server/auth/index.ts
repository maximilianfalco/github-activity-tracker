import NextAuth from "next-auth";
import { cache } from "react";

import { authConfig } from "./config";
import { getSharedLocalSession } from "./shared";

const { auth: uncachedAuth, handlers, signIn, signOut } = NextAuth(authConfig);

const auth = cache(async () => {
  const session = await uncachedAuth();
  if (session) return session;
  return getSharedLocalSession();
});

export { auth, handlers, signIn, signOut };
