import type { Metadata, Viewport } from "next";
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
          <a href="/" className="brand">
            PathAble <span>AI</span>
          </a>
        </header>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
