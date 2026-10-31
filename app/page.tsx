import Link from "next/link";
import { NeedGroupChips } from "@/components/NeedGroupChips";
import { directory } from "@/lib/campus-directory";
import { placePath } from "@/lib/place";
import { PROVENANCE_INFO, type Provenance } from "@/lib/provenance";
import { activeRegion } from "@/lib/region";

const ACTIONS = [
  {
    href: "/places",
    title: "Check a place",
    text: "See what is known, and unknown, before you visit.",
    icon: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z M12 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  },
  {
    href: "/reports",
    title: "Find a barrier",
    text: "See problems people have reported around campus.",
    icon: "M12 3 2 20h20L12 3z M12 10v4 M12 17h.01",
  },
  {
    href: "/report",
    title: "Report an issue",
    text: "Share a barrier with photo evidence.",
    icon: "M4 8h3l2-3h6l2 3h3v11H4z M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  },
  {
    href: "/places",
    title: "Improve campus access",
    text: "Add accessibility information that is still missing.",
    icon: "M12 5v14 M5 12h14",
  },
];

const LEGEND: Provenance[] = ["unknown", "osm", "community", "verified", "outdated"];

// Real campus places from the OpenStreetMap directory, used as examples.
const EXAMPLES = [
  "Central Library",
  "New Lecture Hall Complex",
  "Golden Jubilee Lecture Theatre",
  "ISM Health Center",
  "Main Building",
  "Student Activity Center",
];

export default function HomePage() {
  const region = activeRegion();
  const places = directory(region);
  const examples = EXAMPLES.flatMap((name) => places.find((p) => p.name === name) ?? []);
  const suggestions = [
    ...new Set(places.filter((p) => !/^(unnamed|parking|bungalow|residential quarters)/i.test(p.name)).map((p) => p.name)),
  ];

  return (
    <div className="home">
      <section className="home-hero" aria-labelledby="home-title">
        <h1 id="home-title">Explore your campus with confidence.</h1>
        <p className="hero-lead">Find accessibility information about the places you need to visit at {region.name}.</p>

        <form action="/places" method="get" role="search" className="destination-search">
          <label htmlFor="destination">Where do you want to go?</label>
          <div className="destination-row">
            <input
              id="destination"
              name="q"
              type="search"
              list="campus-places"
              autoComplete="off"
              placeholder="Search Central Library, NLHC, a hostel…"
            />
            <button type="submit" className="button-primary">
              Search
            </button>
          </div>
          <datalist id="campus-places">
            {suggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </form>

        <NeedGroupChips />
      </section>

      <section aria-labelledby="actions-title">
        <h2 id="actions-title">What would you like to do?</h2>
        <ul className="action-grid">
          {ACTIONS.map((a) => (
            <li key={a.title}>
              <Link href={a.href} className="action-card">
                <span className="action-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="28" height="28" focusable="false">
                    <path d={a.icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="action-title">{a.title}</span>
                <span className="action-text">{a.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="popular-title">
        <h2 id="popular-title">Popular places on campus</h2>
        <ul className="chip-links">
          {examples.map((p) => (
            <li key={p.name}>
              <Link href={placePath(p)}>{p.name}</Link>
            </li>
          ))}
          <li>
            <Link href="/places?category=hostel">Hostels</Link>
          </li>
          <li>
            <Link href="/places?category=food">Canteens and food</Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="legend-title" className="legend">
        <h2 id="legend-title">What the labels mean</h2>
        <p className="muted">Every detail on a place page carries one of these, so you always know how far to trust it.</p>
        <dl className="legend-list">
          {LEGEND.map((key) => (
            <div key={key}>
              <dt>
                <span className={`provenance provenance-${key}`}>{PROVENANCE_INFO[key].label}</span>
              </dt>
              <dd>{PROVENANCE_INFO[key].description}</dd>
            </div>
          ))}
        </dl>
        <p className="muted">
          There is no overall score, and a place is never called accessible because details are missing. Pilot area:{" "}
          {region.fullName}. Routes are not planned yet. <Link href="/privacy">Privacy</Link>
        </p>
      </section>

      <section id="how" aria-labelledby="how-title" className="how">
        <h2 id="how-title">How it works</h2>
        <ol className="steps">
          <li>
            <h3>Find a place</h3>
            <p>Search the campus directory, built from OpenStreetMap inside the campus boundary.</p>
          </li>
          <li>
            <h3>Check what matters to you</h3>
            <p>Your needs come first on each place page, with the source and date of every detail.</p>
          </li>
          <li>
            <h3>See what is unknown</h3>
            <p>Missing information that could affect your visit is listed, so you can plan or ask ahead.</p>
          </li>
          <li>
            <h3>Add what you see</h3>
            <p>Record a feature you checked, or report a barrier with a photo; AI suggests, you decide.</p>
          </li>
        </ol>
      </section>
    </div>
  );
}
