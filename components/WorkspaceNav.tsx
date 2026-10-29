"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/owner", label: "Workspace" },
  { href: "/batch", label: "Batch analyze" },
  { href: "/review", label: "Review queue" },
  { href: "/results", label: "Results" },
];

/** Navigation inside the owner workspace, kept apart from the public site navigation. */
export function WorkspaceNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Owner workspace" className="workspace-nav">
      <span className="workspace-label">Owner workspace</span>
      {LINKS.map((link) => {
        const current = link.href === "/review" ? pathname.startsWith("/review") : pathname === link.href;
        return (
          <Link key={link.href} href={link.href} aria-current={current ? "page" : undefined}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
