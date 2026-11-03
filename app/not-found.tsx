import Link from "next/link";

export default function NotFound() {
  return (
    <section aria-labelledby="not-found-title">
      <h1 id="not-found-title">We could not find that page</h1>
      <p className="intro">It may have been removed, may not be public yet, or the link may be wrong.</p>
      <ul className="chip-links">
        <li>
          <Link href="/places">Check a place</Link>
        </li>
        <li>
          <Link href="/reports">Community reports</Link>
        </li>
        <li>
          <Link href="/">Home</Link>
        </li>
      </ul>
    </section>
  );
}
