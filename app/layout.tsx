import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "PathAble AI",
  description:
    "Turn photos of public spaces into evidence-backed, human-verified reports of potential accessibility barriers.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <header className="site-header">
          <Link href="/" className="brand">
            PathAble <span>AI</span>
          </Link>
          <nav aria-label="Main">
            <Link href="/">New report</Link>
            <Link href="/reports">Saved reports</Link>
          </nav>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
