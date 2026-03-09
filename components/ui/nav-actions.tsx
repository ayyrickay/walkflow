"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavActionsProps = {
  userEmail: string | null;
};

export function NavActions({ userEmail }: NavActionsProps) {
  const pathname = usePathname();

  if (userEmail) {
    return (
      <div className="nav-actions">
        <span className="nav-meta">{userEmail}</span>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="nav-logout-button">
            Logout
          </button>
        </form>
      </div>
    );
  }

  if (pathname === "/" || pathname === "/login") {
    return null;
  }

  return (
    <div className="nav-actions">
      <Link href="/login">Login</Link>
    </div>
  );
}
