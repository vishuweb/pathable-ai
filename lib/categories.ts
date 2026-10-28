import type { IssueCategory, Level } from "./types";

export const CATEGORY_INFO: Record<IssueCategory, { label: string; description: string }> = {
  blocked_curb_ramp: {
    label: "Blocked curb ramp",
    description: "An object or vehicle prevents use of a curb ramp or its landing.",
  },
  obstructed_footpath: {
    label: "Obstructed footpath",
    description: "Objects reduce or block the clear walking path.",
  },
  damaged_surface: {
    label: "Damaged walking surface",
    description: "Broken, uneven, or missing pavement that may cause trips or stop wheels.",
  },
  difficult_entrance: {
    label: "Difficult entrance",
    description: "Steps, blocked doors, or missing step-free access at an entrance.",
  },
  other: {
    label: "Other potential barrier",
    description: "A visible condition that may hinder accessible passage but fits no other category.",
  },
};

export const LEVEL_LABEL: Record<Level, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
