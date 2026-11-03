import Link from "next/link";
import { NeedGroupChips } from "@/components/NeedGroupChips";
import { CampusOutline } from "@/components/ui/CampusOutline";
import { Icon, type IconName } from "@/components/ui/Icon";
import { directory } from "@/lib/campus-directory";
import { formatDateTime } from "@/lib/format";
import { publicObservations, publicReports } from "@/lib/moderation-store";
import { NEED_GROUPS, NEED_GROUP_INFO } from "@/lib/needs";
import { placePath } from "@/lib/place";
import { PLACE_FEATURES } from "@/lib/place-attributes";
import { PLACE_CATEGORY_LABEL, type PlaceCategory } from "@/lib/place-categories";
import { PROVENANCE_INFO, type Provenance } from "@/lib/provenance";
import { activeRegion } from "@/lib/region";
import { summarizeReport } from "@/lib/report";
import { STATUS_INFO, currentStatus } from "@/lib/report-status";
import { publicSurveys } from "@/lib/survey-store";

export const dynamic = "force-dynamic";

const ACTIONS: { href: string; title: string; text: string; icon: IconName }[] = [
  { href: "/places", title: "Explore campus", text: "Browse every place in the directory, on a list or the map.", icon: "map" },
  { href: "/places?focus=search", title: "Check a place", text: "See what is known, and unknown, before you visit.", icon: "search" },
  { href: "/report", title: "Report a barrier", text: "Share a photo. AI suggests, and you decide what is true.", icon: "camera" },
  { href: "/reports", title: "Community reports", text: "See barriers people have reported and what happened next.", icon: "users" },
];

const CATEGORY_TILES: { category: PlaceCategory; icon: IconName }[] = [
  { category: "academic", icon: "file" },
  { category: "lecture", icon: "users" },
  { category: "library", icon: "layers" },
  { category: "hostel", icon: "pin" },
  { category: "food", icon: "general" },
  { category: "health", icon: "shield" },
];

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
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="hero-eyebrow">{region.name} pilot</p>
            <h1 id="home-title">Explore your campus with confidence.</h1>
            <p className="hero-lead">Discover places, understand accessibility information relevant to your needs, and help create a more inclusive campus.</p>
            <form action="/places" method="get" role="search" className="destination-search">
              <label htmlFor="destination">Where do you want to go?</label>
              <div className="destination-row">
                <input id="destination" name="q" type="search" list="campus-places" autoComplete="off" placeholder={`Search ${region.searchExample ?? "a place"}…`} />
                <button type="submit" className="button-primary">
                  <Icon name="search" size={18} />
                  Search
                </button>
              </div>
              <datalist id="campus-places">
                {suggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <p className="destination-note">Only places inside the {region.name} campus are searched.</p>
            </form>
          </div>
          <figure className="hero-map">
            <CampusOutline region={region} points={places} label={`Outline of the ${region.name} campus with ${places.length} places from the directory marked`} />
            <figcaption>
              The real campus boundary and {places.length} places from OpenStreetMap. A place on this map has not necessarily been checked for accessibility.
            </figcaption>
          </figure>
        </div>
      </section>

      <div className="landing-body">
        <section aria-labelledby="actions-title">
          <h2 id="actions-title" className="visually-hidden">
            What would you like to do?
          </h2>
          <ul className="action-grid">
            {ACTIONS.map((a) => (
              <li key={a.title}>
                <Link href={a.href} className="action-card">
                  <span className="action-icon">
                    <Icon name={a.icon} size={22} />
                  </span>
                  <span className="action-title">{a.title}</span>
                  <span className="action-text">{a.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="needs-title" className="landing-panel">
          <div className="section-head">
            <h2 id="needs-title">Tell us what matters to you</h2>
            <p>Places then show your details first. Nothing is hidden, and no diagnosis is ever asked for.</p>
          </div>
          <NeedGroupChips heading="What matters to you?" variant="cards" />
        </section>

        <section aria-labelledby="explore-title">
          <div className="section-head">
            <h2 id="explore-title">Explore {region.name}</h2>
            <p>
              <Link href="/places">
                See all {places.length} places <Icon name="arrow" size={16} />
              </Link>
            </p>
          </div>
          <ul className="category-grid">
            {CATEGORY_TILES.filter((t) => countIn(t.category) > 0).map((t) => (
              <li key={t.category}>
                <Link href={`/places?category=${t.category}`} className="category-tile">
                  <Icon name={t.icon} />
                  <span>{PLACE_CATEGORY_LABEL[t.category]}</span>
                  <strong>{countIn(t.category)}</strong>
                </Link>
              </li>
            ))}
          </ul>
          <h3 className="subhead">Places to explore</h3>
          <ul className="chip-links">
            {starters.map((p) => (
              <li key={p.name}>
                <Link href={placePath(p)}>{p.name}</Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="state-title" className="landing-panel">
          <div className="section-head">
            <h2 id="state-title">What is recorded so far</h2>
            <p>Live counts from this site. The project is early: most details are still unknown, and we say so.</p>
          </div>
          <dl className="fact-row">
            <div>
              <dt>Places in the directory</dt>
              <dd>{places.length}</dd>
            </div>
            <div>
              <dt>Community reports</dt>
              <dd>{community.length}</dd>
            </div>
            <div>
              <dt>Visitor observations</dt>
              <dd>{observations.length}</dd>
            </div>
            <div>
              <dt>Published field surveys</dt>
              <dd>{surveys.length}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="features-title">
          <div className="section-head">
            <h2 id="features-title">What a place page can tell you</h2>
            <p>One question at a time, for each kind of need, rather than one score.</p>
          </div>
          <ul className="info-grid">
            {NEED_GROUPS.map((group) => (
              <li key={group} className="info-card">
                <span className="info-icon">
                  <Icon name={group} />
                </span>
                <h3>{NEED_GROUP_INFO[group].label}</h3>
                <p>
                  {PLACE_FEATURES.filter((f) => f.group === group && !f.crossingOnly)
                    .slice(0, 4)
                    .map((f) => f.label)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section id="how" aria-labelledby="how-title">
          <div className="section-head">
            <h2 id="how-title">How PathAble works</h2>
          </div>
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
              <p>Missing information is listed, so you can plan or ask ahead.</p>
            </li>
            <li>
              <h3>Add what you see</h3>
              <p>Record what you checked, or report a barrier with a photo.</p>
            </li>
          </ol>
        </section>

        <section aria-labelledby="recent-title">
          <div className="section-head">
            <h2 id="recent-title">Recent community reports</h2>
            <p>
              <Link href="/reports">
                All reports <Icon name="arrow" size={16} />
              </Link>
            </p>
          </div>
          {recent.length === 0 ? (
            <p className="empty-state">
              No community reports yet. That does not mean there are no barriers. <Link href="/report">Report the first one</Link>.
            </p>
          ) : (
            <ul className="recent-grid">
              {recent.map((r) => {
                const s = summarizeReport(r);
                const status = currentStatus(r).status;
                return (
                  <li key={r.id} className="recent-card">
                    {/* eslint-disable-next-line @next/next/no-img-element -- served by our own API route */}
                    <img src={`/api/reports/${r.id}/image`} alt="" width={360} height={200} loading="lazy" />
                    <div>
                      <h3>
                        <Link href={`/reports/${r.id}`}>{r.location?.place?.name ?? r.location?.label ?? "Report with no place given"}</Link>
                      </h3>
                      <p className="muted">
                        {s.verified} confirmed by the reporter · {formatDateTime(r.createdAt)}
                      </p>
                      <span className={`chip status-${status}`}>{STATUS_INFO[status].label}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="two-panels">
          <section aria-labelledby="ai-title" className="landing-panel">
            <h2 id="ai-title">
              <Icon name="spark" /> How AI helps
            </h2>
            <ol className="tick-list">
              <li>Muse Spark looks at your photo and suggests possible barriers.</li>
              <li>SAM 3.1 outlines the evidence in the picture, so you can see what it means.</li>
              <li>You confirm, correct or reject each suggestion. Nothing is reported until you have.</li>
            </ol>
            <p className="muted">AI cannot establish measurements, whether a lift works, or compliance with any standard.</p>
          </section>
          <section aria-labelledby="verify-title" className="landing-panel">
            <h2 id="verify-title">
              <Icon name="shield" /> How information is verified
            </h2>
            <p>Every detail carries one of these labels, so you always know how far to trust it.</p>
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

        <section aria-labelledby="contribute-title">
          <div className="section-head">
            <h2 id="contribute-title">Ways to contribute</h2>
          </div>
          <ul className="info-grid">
            <li className="info-card">
              <span className="info-icon">
                <Icon name="plus" />
              </span>
              <h3>Fill a gap</h3>
              <p>Find a place where nothing is recorded yet and add what you saw.</p>
              <Link href="/places?show=gaps">
                See places with gaps <Icon name="arrow" size={16} />
              </Link>
            </li>
            <li className="info-card">
              <span className="info-icon">
                <Icon name="camera" />
              </span>
              <h3>Report a barrier</h3>
              <p>A photo and a few minutes. It is checked before it goes public.</p>
              <Link href="/report">
                Start a report <Icon name="arrow" size={16} />
              </Link>
            </li>
            <li className="info-card">
              <span className="info-icon">
                <Icon name="play" />
              </span>
              <h3>See how it works first</h3>
              <p>Try four example journeys with illustrative data, kept apart from real records.</p>
              <Link href="/demo">
                Open the demo <Icon name="arrow" size={16} />
              </Link>
            </li>
          </ul>
        </section>

        <p className="muted landing-foot">
          There is no overall score, and a place is never called accessible because details are missing. Pilot area: {region.fullName}. Routes are not planned yet. <Link href="/privacy">Privacy</Link>
        </p>
      </div>
    </div>
  );
}
