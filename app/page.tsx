import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <section>
      <h1>WalkFlow</h1>
      <p>Phone-first capture flow for developer thoughts.</p>
      <p>
        <Link href="/login">Create account / Login</Link>
      </p>
    </section>
  );
}
