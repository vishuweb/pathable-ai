// Okabe–Ito palette: distinguishable with common forms of color blindness.
// Findings are also numbered, so color is never the only cue.
const FINDING_COLORS = ["#E69F00", "#56B4E9", "#009E73", "#D55E00", "#CC79A7", "#0072B2", "#F0E442"];
// Badge number color per palette entry, each at least 4.5:1 against its background.
const FINDING_TEXT_COLORS = ["#111", "#111", "#111", "#111", "#111", "#fff", "#111"];

export function findingColor(index: number): string {
  return FINDING_COLORS[index % FINDING_COLORS.length];
}

export function findingTextColor(index: number): string {
  return FINDING_TEXT_COLORS[index % FINDING_TEXT_COLORS.length];
}
