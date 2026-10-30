"use client";

import Link from "next/link";
import type { PlaceAttribute } from "@/lib/place-attributes";
import { usePreferences } from "@/lib/use-preferences";

/**
 * The attributes that answer the visitor's own needs, read from their saved choices in this
 * browser. It reports what is known and unknown; it never says whether a place suits them.
 */
export function PlaceNeedsSummary({ attributes }: { attributes: PlaceAttribute[] }) {
  const { preferences, loaded } = usePreferences();
  if (!loaded) return null;
  if (!preferences.needs.length) {
    return (
      <p className="callout">
        <Link href="/needs">Choose your needs</Link> to see the information that matters to you first.
      </p>
    );
  }
  const relevant = attributes.filter((a) => a.needIds.some((id) => preferences.needs.includes(id)));
  const known = relevant.filter((a) => a.state === "community");
  return (
    <section className="callout" aria-labelledby="for-you-title">
      <h2 id="for-you-title">For your needs</h2>
      {relevant.length === 0 ? (
        <p>None of the information OpenStreetMap can hold for this kind of place matches your chosen needs.</p>
      ) : (
        <>
          <p>
            {known.length} of {relevant.length} relevant {relevant.length === 1 ? "item is" : "items are"} recorded;
            the rest {relevant.length - known.length === 1 ? "is" : "are"} unknown. PathAble AI does not decide whether
            this place suits you.
          </p>
          <ul>
            {relevant.map((a) => (
              <li key={a.id}>
                <strong>{a.label}:</strong> {a.state === "community" ? a.value : "Unknown"}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
