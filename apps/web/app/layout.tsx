import "./globals.css";

import type { Metadata } from "next";
import { Barlow_Condensed, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import Link from "next/link";

import { getCurrentUser } from "@/lib/auth";
import { NavActions } from "@/components/ui/nav-actions";

const brandFont = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-brand"
});

const sansFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans"
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "WalkFlow",
  description: "Capture developer thoughts while walking",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg"
  }
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en" data-theme="dark">
      <body className={`${brandFont.variable} ${sansFont.variable} ${monoFont.variable}`}>
        <header>
          <nav>
            <Link href="/" className="brand-link">
              WALKFLOW
            </Link>
            <NavActions userEmail={user?.email ?? null} />
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
