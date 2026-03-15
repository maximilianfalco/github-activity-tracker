import { auth } from "~/server/auth";
import { db } from "~/server/db";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  await Promise.all([
    db.account.updateMany({
      where: {
        userId: session.user.id,
        provider: "github",
      },
      data: {
        access_token: null,
      },
    }),
    db.session.deleteMany({
      where: {
        userId: session.user.id,
      },
    }),
  ]);

  return Response.json({ success: true });
}
