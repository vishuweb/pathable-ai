import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { ToastProvider } from "@/components/ui/Toast";
import "./styles.css";

// Designed by the Braille Institute so similar letters stay distinct for low-vision readers.
// Served from this site at build time, so no visitor's request goes to a font service.
// No fallback size data exists for this newer font, so none is generated.
const font = Atkinson_Hyperlegible_Next({ subsets: ["latin"], display: "swap", variable: "--font-sans", adjustFontFallback: false });

export const metadata: Metadata = {
  title: "PathAble AI",
  description: "Discover places, understand accessibility information relevant to your needs, and help create a more inclusive campus.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={font.variable}>
      <body>
        <ToastProvider>
          <header className="site-header">
            <a className="skip-link" href="#main">
              Skip to main content
            </a>
            <div className="site-header-inner">
              <Link href="/" className="brand">
                <span className="brand-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="15" height="15" focusable="false">
                    <path d="M12 3v18 M12 5h6l3 3-3 3h-6 M12 11H6l-3 3 3 3h6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                PathAble <span>AI</span>
              </Link>
              <SiteNav />
            </div>
          </header>
          <main id="main">{children}</main>
          <footer className="site-footer">
            <div className="site-footer-inner">
              <p>
                <span className="footer-brand">PathAble AI.</span> One World. Different Needs. More Accessible Journeys.
              </p>
              <nav aria-label="Footer" className="footer-links">
                <Link href="/privacy">Privacy and data</Link>
                <Link href="/results">Measured results</Link>
                <Link href="/demo">Demo</Link>
                <Link href="/owner">Owner workspace</Link>
                <a href="https://github.com/vishuweb/pathable-ai">Source code</a>
              </nav>
            </div>
            <p className="footer-note">AI suggestions are checked by the person who reports them. Reports are not compliance assessments.</p>
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
