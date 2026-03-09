import { redirect } from "next/navigation";

import { AuthScreen } from "@/components/auth/auth-screen";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return <AuthScreen />;
}
