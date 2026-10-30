import Link from "next/link";

const AUDIENCES = [
  {
    group: "mobility",
    title: "Moving around",
    text: "Wheelchair users and people with walkers, crutches or prams: blocked ramps, steps, narrow or broken paths.",
  },
  {
    group: "vision",
    title: "Seeing",
    text: "Blind and partially sighted people: obstacles a cane can miss, damaged tactile paving, unreadable signs.",
  },
  {
    group: "hearing",
    title: "Hearing",
    text: "Deaf and hard-of-hearing people: information that is only spoken, with no clear written or visual signs.",
  },
  {
    group: "cognitive",
    title: "Finding the way",
    text: "People who need clear, predictable routes: confusing diversions and missing landmarks or signs.",
  },
  {
    group: "general",
    title: "Comfort and more",
    text: "Older adults, carers and people with temporary injuries: uneven surfaces, nowhere to rest.",
  },
] as const;

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
        <h1 id="hero-title">One world. Different needs. More accessible journeys.</h1>
        <p className="hero-lead">
          A place that works for one person can stop another. Photograph a barrier, let AI point out what it may mean
          for people with different needs, check every suggestion yourself, and share evidence someone can act on.
        </p>
        <div className="cta-row">
          <Link className="button-primary button-large" href="/report">
            Report a barrier
          </Link>
          <Link className="button-secondary" href="/reports">
            Community reports
          </Link>
          <Link className="button-secondary" href="/needs">
            Set my needs
          </Link>
        </div>
      </section>

      <section aria-labelledby="who-title">
        <h2 id="who-title">Built for different needs</h2>
        <p>
          Every barrier is tagged with the needs it may affect, so a blind pedestrian and a wheelchair user can each
          find what matters to them. <Link href="/needs">Choose your needs</Link>; they stay on your device.
        </p>
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

      <section id="verification" aria-labelledby="why-title" className="callout">
        <h2 id="why-title">How information is verified</h2>
        <ul>
          <li>AI can misread a photo, so every suggestion stays &ldquo;unverified&rdquo; until a person decides.</li>
          <li>
            Some things a photo can never show: whether a crossing signal is audible, whether a lift works, or whether
            tactile paving continues out of shot. PathAble AI does not guess them.
          </li>
          <li>A photo cannot measure widths, slopes or step heights, so a report says what to check on site.</li>
          <li>
            A shared report starts as &ldquo;Submitted&rdquo;; later steps such as &ldquo;Verified&rdquo; or
            &ldquo;Resolved&rdquo; are recorded with a date and a reason.
          </li>
          <li>Reports never claim compliance, and no barrier found never means &ldquo;accessible&rdquo;.</li>
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
          It documents barriers in single photos. Searching places, maps, routes suited to your needs and user accounts
          are planned for later and are not available today.
        </p>
      </section>
    </div>
  );
}
