"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog } from "./ui/Dialog";
import { Icon } from "./ui/Icon";
import { ThemeToggle } from "./ui/ThemeToggle";

const LINKS = [
  { href: "/places", label: "Explore campus", match: "/places" },
  { href: "/reports", label: "Community reports", match: "/reports" },
  { href: "/needs", label: "My needs", match: "/needs" },
  { href: "/demo", label: "See a demo", match: "/demo" },
];

/** Main navigation: shows the current page, keeps reporting one tap away, and folds into a menu on phones. */
export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = (match: string) => pathname === match || pathname.startsWith(`${match}/`);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <nav aria-label="Main" className="site-nav">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} aria-current={current(link.match) ? "page" : undefined}>
            {link.label}
          </Link>
        ))}
        <ThemeToggle />
        <Link href="/report" className="nav-cta" aria-current={pathname === "/report" ? "page" : undefined}>
          Report a barrier
        </Link>
      </nav>
      <div className="site-nav-compact">
        <ThemeToggle />
        <Link href="/report" className="nav-cta" aria-current={pathname === "/report" ? "page" : undefined}>
          <span>Report</span>
        </Link>
        <button type="button" className="icon-button" onClick={() => setOpen(true)}>
          <Icon name="menu" />
          <span className="visually-hidden">Open the menu</span>
        </button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Menu" variant="drawer">
        <nav aria-label="Menu" className="drawer-nav">
          {[...LINKS, { href: "/report", label: "Report a barrier", match: "/report" }, { href: "/privacy", label: "Privacy and data", match: "/privacy" }].map((link) => (
            <Link key={link.href} href={link.href} aria-current={current(link.match) ? "page" : undefined} onClick={() => setOpen(false)}>
              {link.label}
              <Icon name="chevron" size={18} />
            </Link>
          ))}
        </nav>
      </Dialog>
    </>
  );
}
