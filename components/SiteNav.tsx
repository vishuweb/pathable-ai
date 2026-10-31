"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/places", label: "Check a place", match: "/places" },
  { href: "/reports", label: "Community reports", match: "/reports" },
  { href: "/needs", label: "My needs", match: "/needs" },
];

/** Main navigation: shows the current page, and makes reporting the one standout action. */
export function SiteNav() {
  const pathname = usePathname();
  const current = (match: string) => pathname === match || pathname.startsWith(`${match}/`);
  return (
    <nav aria-label="Main" className="site-nav">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} aria-current={current(link.match) ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
      <Link href="/report" className="nav-cta" aria-current={pathname === "/report" ? "page" : undefined}>
        Report a barrier
      </Link>
    </nav>
  );
}
