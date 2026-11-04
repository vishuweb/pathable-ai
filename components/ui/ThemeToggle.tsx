"use client";

import { useEffect, useState } from "react";

export const THEME_KEY = "pathable.theme";

/** Light or dark. The choice is kept on this device; until one is made, the system setting applies. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const set = document.documentElement.dataset.theme;
    setDark(set ? set === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // Private windows may refuse storage; the theme still changes for this visit.
    }
  };

  return (
    <button type="button" className="icon-button theme-toggle" aria-pressed={dark} onClick={toggle}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        {dark ? (
          <path d="M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        ) : (
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </g>
        )}
      </svg>
      <span className="visually-hidden">Dark theme</span>
    </button>
  );
}
