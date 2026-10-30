import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "PathAble AI",
  description:
    "Document accessibility barriers in public spaces: photo evidence, AI suggestions and your own review, in one shareable report.",
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
            <Link href="/report">Report a barrier</Link>
            <Link href="/places">Explore places</Link>
            <Link href="/reports">Community reports</Link>
            <Link href="/needs">My needs</Link>
            <Link href="/#how-it-works">How it works</Link>
          </nav>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <nav aria-label="Footer" className="footer-links">
            <Link href="/privacy">Privacy and data</Link>
            <Link href="/results">Measured results</Link>
            <Link href="/owner">Owner workspace</Link>
            <a href="https://github.com/vishuweb/pathable-ai">Source code</a>
          </nav>
          <p>AI suggestions are checked by the person who reports them. Reports are not compliance assessments.</p>
        </footer>
      </body>
    </html>
  );
}
