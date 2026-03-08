import "./globals.css";

import type { Metadata } from "next";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "WalkFlow",
  description: "Capture developer thoughts while walking"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en" data-theme="dark">
      <body>
        <header>
          <nav>
            <Link href="/">WalkFlow</Link>
            <span>{user ? `Signed in as ${user.email}` : "Not signed in"}</span>
            <div>
              {user ? <Link href="/dashboard">Dashboard</Link> : <Link href="/login">Login</Link>}
            </div>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
