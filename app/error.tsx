"use client";

import Link from "next/link";

/** Shown when a page fails on the server. No technical detail reaches the visitor. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <section aria-labelledby="error-title">
      <h1 id="error-title">Something went wrong</h1>
      <p className="intro" role="alert">
        This page could not load just now. Nothing you already shared has been lost.
      </p>
      <p>
        <button type="button" className="button-primary" onClick={reset}>
          Try again
        </button>{" "}
        <Link className="button-secondary" href="/">
          Go to the home page
        </Link>
      </p>
    </section>
  );
}
