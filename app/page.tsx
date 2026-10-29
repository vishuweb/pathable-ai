import Link from "next/link";

const AUDIENCES = [
  {
    title: "People who need step-free routes",
    text: "Wheelchair users, people using walkers or mobility scooters, and anyone for whom a blocked ramp means turning back.",
  },
  {
    title: "Parents, carers and older adults",
    text: "Prams, shopping trolleys and unsteady footing all depend on a clear, even footpath.",
  },
  {
    title: "Volunteers and advocates",
    text: "Document problems consistently, with the photo and the reasoning in one place.",
  },
  {
    title: "Maintenance teams",
    text: "Receive a specific, photographed, person-checked report instead of a vague complaint.",
  },
];

const STEPS = [
  {
    title: "Take a photo",
    text: "Of a footpath, curb ramp, crossing or entrance. Your phone's location and camera details are removed before upload.",
  },
  {
    title: "AI suggests possible barriers",
    text: "Meta's Muse Spark model lists what it sees, why it may matter, and what the photo cannot show. These are suggestions, not conclusions.",
  },
  {
    title: "The evidence is outlined",
    text: "Meta's SAM 3.1 model outlines the object behind each suggestion. When it cannot, you see an approximate box and a warning instead.",
  },
  {
    title: "You decide",
    text: "Confirm, correct or reject every suggestion, add anything the AI missed, and type or dictate a note.",
  },
  {
    title: "Share the report",
    text: "It gets a public page and a downloadable maintenance request, with a status that records what happens next.",
  },
];

export default function HomePage() {
  return (
    <div className="landing">
      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">PathAble AI</p>
        <h1 id="hero-title">Report accessibility barriers with photo evidence</h1>
        <p className="hero-lead">
          A scooter across the footpath, a blocked curb ramp, a broken paving slab: photograph it, let AI point out
          possible barriers, check each one yourself, and share a clear report that someone can act on.
        </p>
        <div className="cta-row">
          <Link className="button-primary button-large" href="/report">
            Report a barrier
          </Link>
          <Link className="button-secondary" href="/reports">
            See shared reports
          </Link>
        </div>
      </section>

      <section aria-labelledby="who-title">
        <h2 id="who-title">Who it is for</h2>
        <ul className="card-grid">
          {AUDIENCES.map((a) => (
            <li key={a.title} className="card">
              <h3>{a.title}</h3>
              <p>{a.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="how-it-works" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
        <figure className="example">
          {/* eslint-disable-next-line @next/next/no-img-element -- a static sample photo */}
          <img
            src="/samples/scooter-blocking-sidewalk.jpg"
            alt="A fallen electric scooter lying across a concrete sidewalk next to a utility pole."
            width={1280}
            height={1707}
            loading="lazy"
          />
          <figcaption>
            Example photo: a fallen scooter on a sidewalk. You can try the whole process with it on the{" "}
            <Link href="/report">report page</Link>, under &ldquo;No photo handy?&rdquo;. Photo: City Dweller 2, Wikimedia
            Commons, CC BY-SA 4.0.
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="why-title" className="callout">
        <h2 id="why-title">Why a person checks every finding</h2>
        <ul>
          <li>AI can misread a photo, so every suggestion stays &ldquo;unverified&rdquo; until you decide.</li>
          <li>A photo cannot show widths, slopes or step heights, so a report describes what to check on site.</li>
          <li>Reports never claim that a place complies with an accessibility standard.</li>
          <li>A photo with no barrier found does not mean a place is accessible.</li>
        </ul>
      </section>

      <section aria-labelledby="share-title">
        <h2 id="share-title">What happens when you share a report</h2>
        <ul className="plain-list">
          <li>
            <strong>It is public.</strong> Anyone can see the photo, the suggestions, your decisions and notes, and the
            location if you added one. You confirm this before saving.
          </li>
          <li>
            <strong>It starts as &ldquo;Submitted&rdquo;.</strong> Later changes, such as &ldquo;Verified&rdquo; or
            &ldquo;Resolved&rdquo;, are recorded with a date and the reason, so a report is never shown as fixed
            without one.
          </li>
          <li>
            <strong>It can be removed.</strong> Ask for removal or correction at any time; see{" "}
            <Link href="/privacy">privacy and data</Link>.
          </li>
        </ul>
        <p>
          How accurate are the suggestions? The project measures that from reviewed photos on the{" "}
          <Link href="/results">measured results</Link> page.
        </p>
      </section>

      <section aria-labelledby="scope-title" className="scope">
        <h2 id="scope-title">What PathAble AI does not do yet</h2>
        <p>
          It documents barriers in single photos. Searching places, maps, step-free route planning and user accounts
          are planned for later and are not available today.
        </p>
      </section>
    </div>
  );
}
