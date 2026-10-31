// One vocabulary for where a piece of accessibility information comes from and how far it has been
// checked. Every page uses these labels and nothing else, so "verified" always means the same thing.
export const PROVENANCE = [
  "unknown",
  "osm",
  "ai",
  "community",
  "reporter_confirmed",
  "verified",
  "outdated",
  "resolved",
] as const;
export type Provenance = (typeof PROVENANCE)[number];

export const PROVENANCE_INFO: Record<Provenance, { label: string; description: string }> = {
  unknown: { label: "Unknown", description: "Nobody has recorded this yet." },
  osm: {
    label: "Recorded in OpenStreetMap",
    description: "Added by OpenStreetMap volunteers. Not checked by PathAble AI.",
  },
  ai: { label: "Suggested by AI", description: "An AI suggestion from a photo that no person has confirmed." },
  community: {
    label: "Community reported",
    description: "Observed by a visitor. Not yet checked by anyone else.",
  },
  reporter_confirmed: {
    label: "Confirmed by reporter",
    description: "The person who reported it checked the AI's suggestions. Not yet checked by anyone else.",
  },
  verified: { label: "Independently verified", description: "Checked by the project owner, with a recorded reason." },
  outdated: { label: "Outdated", description: "Last observed more than two years ago; it may have changed." },
  resolved: { label: "Resolved, with evidence", description: "Recorded as fixed, with the evidence noted." },
};
