"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./ui/Icon";

const LINKS: { href: string; label: string; icon: IconName; reviewer?: boolean }[] = [
  { href: "/owner", label: "Overview", icon: "chart" },
  { href: "/reports", label: "Reports", icon: "file" },
  { href: "/owner/moderation", label: "Approvals", icon: "shield" },
  { href: "/review", label: "Review queue", icon: "clipboard", reviewer: true },
  { href: "/owner/survey", label: "Surveys", icon: "pin", reviewer: true },
  { href: "/owner/coverage", label: "Coverage", icon: "layers" },
  { href: "/batch", label: "Batch analyze", icon: "camera" },
  { href: "/results", label: "AI evaluation", icon: "spark", reviewer: true },
  { href: "/owner/ai-usage", label: "AI usage", icon: "clock" },
  { href: "/owner/settings", label: "Settings and privacy", icon: "settings" },
];

/** Navigation inside the workspace, kept apart from the public site's: a sidebar on wide screens, a scrolling strip on phones. */
export function WorkspaceNav({ reviewerOnly = false }: { reviewerOnly?: boolean }) {
  const pathname = usePathname();
  const links = reviewerOnly ? LINKS.filter((l) => l.reviewer) : LINKS;
  return (
    <nav aria-label={reviewerOnly ? "Reviewer workspace" : "Owner workspace"} className="workspace-nav">
      <span className="workspace-label">{reviewerOnly ? "Reviewer workspace" : "Owner workspace"}</span>
      {links.map((link) => {
        const current = link.href === "/review" || link.href === "/owner/survey" ? pathname.startsWith(link.href) : pathname === link.href;
        return (
          <Link key={link.href} href={link.href} aria-current={current ? "page" : undefined}>
            <Icon name={link.icon} size={18} />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
