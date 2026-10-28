// Okabe–Ito palette: distinguishable with common forms of color blindness.
// Findings are also numbered, so color is never the only cue.
const FINDING_COLORS = ["#E69F00", "#56B4E9", "#009E73", "#D55E00", "#CC79A7", "#0072B2", "#F0E442"];

export function findingColor(index: number): string {
  return FINDING_COLORS[index % FINDING_COLORS.length];
}
