import Link from "next/link";
import { NeedGroupChips } from "@/components/NeedGroupChips";
import { CampusOutline } from "@/components/ui/CampusOutline";
import { Icon } from "@/components/ui/Icon";
import { directory } from "@/lib/campus-directory";
import { formatDateTime } from "@/lib/format";
import { publicObservations, publicReports } from "@/lib/moderation-store";
import { placePath } from "@/lib/place";
import { PLACE_CATEGORY_LABEL, type PlaceCategory } from "@/lib/place-categories";
import { PROVENANCE_INFO, type Provenance } from "@/lib/provenance";
import { activeRegion } from "@/lib/region";
import { summarizeReport } from "@/lib/report";
import { STATUS_INFO, currentStatus } from "@/lib/report-status";
import { publicSurveys } from "@/lib/survey-store";

export const dynamic = "force-dynamic";

const ACTIONS = [
  { href: "/places", title: "Explore campus" },
  { href: "/places?focus=search", title: "Check a place" },
  { href: "/report", title: "Report a barrier" },
  { href: "/reports", title: "Community reports" },
];

const CATEGORIES: PlaceCategory[] = ["academic", "lecture", "library", "hostel", "food", "health"];
const LEGEND: Provenance[] = ["unknown", "osm", "ai", "community", "owner_recorded", "verified", "outdated"];

export default async function HomePage() {
  const region = activeRegion();
  const places = directory(region);
  const [reports, observations, surveys] = await Promise.all([publicReports(), publicObservations(), publicSurveys()]);
  const starters = (region.startPlaces ?? []).flatMap((name) => places.find((p) => p.name === name) ?? []);
  const suggestions = [...new Set(places.filter((p) => !/^(unnamed|parking|bungalow|residential quarters)/i.test(p.name)).map((p) => p.name))];
  // Photos from the evaluation batches are not reports from the community, so they are not featured here.
  const community = reports.filter((r) => !r.source);
  const recent = [...community].reverse().slice(0, 3);
  const countIn = (category: PlaceCategory) => places.filter((p) => p.category === category).length;

  return (
    <div className="landing">
      <section className="hero" aria-labelledby="home-title">
        <div>
          <h1 id="home-title">Explore your campus with confidence.</h1>
          <p className="hero-lead">Discover places, understand accessibility information relevant to your needs, and help create a more inclusive campus.</p>
          <form action="/places" method="get" role="search" className="destination-search">
            <label htmlFor="destination" className="visually-hidden">
              Where do you want to go?
            </label>
            <div className="destination-row">
              <input id="destination" name="q" type="search" list="campus-places" autoComplete="off" placeholder="Where do you want to go?" />
              <button type="submit" className="button-primary">
                Search
              </button>
            </div>
            <datalist id="campus-places">
              {suggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <p className="destination-note">Searching {region.name} only.</p>
          </form>
          <ul className="action-grid">
            {ACTIONS.map((a) => (
              <li key={a.title}>
                <Link href={a.href}>{a.title}</Link>
              </li>
            ))}
          </ul>
        </div>
        <figure className="hero-map">
          <CampusOutline region={region} points={places} label={`Outline of the ${region.name} campus with ${places.length} places from the directory marked`} />
          <figcaption>The real campus boundary and {places.length} places from OpenStreetMap. Being on this map does not mean a place has been checked.</figcaption>
        </figure>
      </section>

      <section aria-labelledby="needs-title" className="home-section home-rule home-needs">
        <div>
          <h2 id="needs-title">What matters to you?</h2>
          <p className="muted">Places then show your details first. Nothing is hidden, and no diagnosis is ever asked for.</p>
        </div>
        <NeedGroupChips heading="Choose any that apply" headingLevel={3} />
      </section>

      <section aria-labelledby="explore-title" className="home-section home-rule">
        <div className="home-head">
          <h2 id="explore-title">Explore {region.name}</h2>
          <p>
            <Link href="/places" className="arrow-link">
              All {places.length} places <Icon name="arrow" size={16} />
            </Link>
          </p>
        </div>
        <ul className="index-list">
          {CATEGORIES.filter((c) => countIn(c) > 0).map((c) => (
            <li key={c}>
              <Link href={`/places?category=${c}`}>
                <span>{PLACE_CATEGORY_LABEL[c]}</span>
                <span>{countIn(c)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="home-counts">
          So far: {community.length} community {community.length === 1 ? "report" : "reports"}, {observations.length} visitor {observations.length === 1 ? "observation" : "observations"}, {surveys.length} published field {surveys.length === 1 ? "survey" : "surveys"}. The project is early, and most details are still unknown.
        </p>
        <h3 className="subhead">Places to explore</h3>
        <ul className="chip-links">
          {starters.map((p) => (
            <li key={p.name}>
              <Link href={placePath(p)}>{p.name}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="how" aria-labelledby="how-title" className="home-section home-rule">
        <div className="home-head">
          <h2 id="how-title">How PathAble works</h2>
        </div>
        <ol className="text-columns">
          {[
            ["Find a place", "Search the campus directory, built from OpenStreetMap inside the campus boundary."],
            ["Check what matters to you", "Your needs come first on each place page, with the source and date of every detail."],
            ["See what is unknown", "Missing information is listed, so you can plan or ask ahead."],
            ["Add what you see", "Record what you checked, or report a barrier with a photo."],
          ].map(([title, text], i) => (
            <li key={title}>
              <span className="number" aria-hidden="true">
                {i + 1}
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {recent.length > 0 && (
      <section aria-labelledby="recent-title" className="home-section home-rule">
        <div className="home-head">
          <h2 id="recent-title">Recent community reports</h2>
          <p>
            <Link href="/reports" className="arrow-link">
              All reports <Icon name="arrow" size={16} />
            </Link>
          </p>
        </div>
          <ul className="recent-grid">
            {recent.map((r) => {
              const s = summarizeReport(r);
              const status = currentStatus(r).status;
              return (
                <li key={r.id} className="recent-card">
                  {/* eslint-disable-next-line @next/next/no-img-element -- served by our own API route */}
                  <img src={`/api/reports/${r.id}/image`} alt="" width={360} height={200} loading="lazy" />
                  <h3>
                    <Link href={`/reports/${r.id}`}>{r.location?.place?.name ?? r.location?.label ?? "Report with no place given"}</Link>
                  </h3>
                  <p className="muted">
                    {s.verified} confirmed by the reporter · {formatDateTime(r.createdAt)}
                  </p>
                  <span className={`chip status-${status}`}>{STATUS_INFO[status].label}</span>
                </li>
              );
            })}
          </ul>
      </section>
      )}

      <div className="two-panels home-section home-rule">
        <section aria-labelledby="ai-title">
          <h2 id="ai-title">How AI helps</h2>
          <ol className="tick-list">
            <li>Muse Spark looks at your photo and suggests possible barriers.</li>
            <li>SAM 3.1 outlines the evidence in the picture, so you can see what it means.</li>
            <li>You confirm, correct or reject each suggestion. Nothing is reported until you have.</li>
          </ol>
          <p className="muted">AI cannot establish measurements, whether a lift works, or compliance with any standard.</p>
        </section>
        <section aria-labelledby="verify-title">
          <h2 id="verify-title">How information is verified</h2>
          <p className="muted">Every detail carries one of these labels, so you know how far to trust it.</p>
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
        </section>
      </div>

      <section aria-labelledby="contribute-title" className="home-section home-rule">
        <div className="home-head">
          <h2 id="contribute-title">Ways to contribute</h2>
        </div>
        <ul className="text-columns">
          <li>
            <h3>Fill a gap</h3>
            <p>Find a place where nothing is recorded yet and add what you saw.</p>
            <Link href="/places?show=gaps" className="arrow-link">
              Places with gaps <Icon name="arrow" size={16} />
            </Link>
          </li>
          <li>
            <h3>Report a barrier</h3>
            <p>A photo and a few minutes. It is checked before it goes public.</p>
            <Link href="/report" className="arrow-link">
              Start a report <Icon name="arrow" size={16} />
            </Link>
          </li>
          <li>
            <h3>See how it works first</h3>
            <p>Try four example journeys with illustrative data, kept apart from real records.</p>
            <Link href="/demo" className="arrow-link">
              Open the demo <Icon name="arrow" size={16} />
            </Link>
          </li>
        </ul>
      </section>

      <div className="landing-foot">
        <p>
          There is no overall score, and a place is never called accessible because details are missing. Pilot area: {region.fullName}. Routes are not planned yet.
        </p>
      </div>
    </div>
  );
}
