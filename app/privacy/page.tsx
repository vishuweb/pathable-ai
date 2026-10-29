import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy and data · PathAble AI" };

export default function PrivacyPage() {
  return (
    <article className="prose" aria-labelledby="privacy-title">
      <h1 id="privacy-title">Privacy and data</h1>
      <p className="intro">
        PathAble AI is a hackathon project, not a commercial service. This page describes exactly what it does with
        your photos and reports. It is not a legal privacy policy.
      </p>

      <h2>When you analyze a photo</h2>
      <ul>
        <li>
          Your browser re-encodes the photo before upload (at most 1600 pixels, JPEG). This removes GPS and other
          camera metadata.
        </li>
        <li>
          The photo is sent to Meta&apos;s Model API (Muse Spark and SAM 3.1) for analysis. Meta processes it under
          its own developer terms; PathAble AI does not control how Meta retains API data.
        </li>
        <li>Nothing is stored by PathAble AI until you choose to save a report.</li>
      </ul>

      <h2>When you save a report</h2>
      <ul>
        <li>
          The report is stored and <strong>listed publicly</strong> on Saved reports: the photo, the AI findings and
          outlines, your review decisions and notes, and the location if you added one.
        </li>
        <li>
          You confirm before saving that you may share the photo and that it does not clearly show anyone&apos;s
          face or number plate. PathAble AI does not use facial recognition and does not try to identify anyone.
        </li>
        <li>The time you gave that confirmation is stored with the report.</li>
        <li>
          Location is never added automatically. It is saved only if you type a place or press &ldquo;Use my
          current location&rdquo;.
        </li>
      </ul>

      <h2>Voice notes</h2>
      <p>
        A recording is sent to Meta&apos;s Muse Voice Transcribe model and turned into text. PathAble AI does not
        store the recording; only the text you keep in a note is saved, and only if you save the report.
      </p>

      <h2>What is not collected</h2>
      <ul>
        <li>No accounts, advertising, analytics or tracking.</li>
        <li>
          One cookie is used only for the project owner&apos;s sign-in. Visitors get no cookies.
        </li>
        <li>
          To limit misuse of the AI, the server counts requests per IP address in memory for up to an hour. These
          counts are never written to storage.
        </li>
      </ul>

      <h2>Storage, deletion and correction</h2>
      <ul>
        <li>
          Reports are kept in a private storage area of the hosting provider (Vercel) and are served only through
          this app. The hosting provider also keeps short-lived server logs.
        </li>
        <li>
          Reports are kept until they are deleted. The project owner can delete any report, for example spam or a
          photo that shows a person.
        </li>
        <li>
          To ask for a report to be removed or corrected, open an issue on the project&apos;s{" "}
          <a href="https://github.com/vishuweb/pathable-ai/issues">GitHub page</a> with a link to the report. Do not
          include personal details in the issue, because GitHub issues are public.
        </li>
      </ul>

      <h2>What the reports are not</h2>
      <p>
        Findings are AI-generated candidates checked by one person. They are not an accessibility compliance
        assessment, and the absence of a report does not mean a place is accessible.
      </p>

      <p>
        <Link href="/">Back to a new report</Link>
      </p>
    </article>
  );
}
