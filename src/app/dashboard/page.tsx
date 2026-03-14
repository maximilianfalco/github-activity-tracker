import Link from "next/link";
import { auth } from "~/server/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect("/api/auth/signin");
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Signed in as {session.user.name}</p>
      <Link href="/api/auth/signout">Sign out</Link>
    </main>
  );
}
