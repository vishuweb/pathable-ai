import type { NeedGroup } from "./needs";
import type { IssueCategory, Level } from "./types";

/**
 * What each barrier category means, and whose access it may affect. Only conditions a photo can
 * actually show are categories; whether a signal is audible or a lift works never is.
 */
export const CATEGORY_INFO: Record<IssueCategory, { label: string; description: string; needs: NeedGroup[] }> = {
  blocked_curb_ramp: {
    label: "Blocked curb ramp",
    description: "An object or vehicle prevents use of a curb ramp or its landing.",
    needs: ["mobility"],
  },
  obstructed_footpath: {
    label: "Obstructed footpath",
    description: "Objects reduce or block the clear walking path.",
    needs: ["mobility", "vision"],
  },
  damaged_surface: {
    label: "Damaged walking surface",
    description: "Broken, uneven, or missing pavement that may cause trips or stop wheels.",
    needs: ["mobility", "vision", "general"],
  },
  difficult_entrance: {
    label: "Difficult entrance",
    description: "Steps, blocked doors, or missing step-free access at an entrance.",
    needs: ["mobility"],
  },
  tactile_guidance: {
    label: "Tactile guidance problem",
    description:
      "Tactile paving at a crossing, platform edge or route that is visibly damaged, covered, blocked, or absent where the photo shows a crossing point. Whether it continues beyond the photo cannot be judged.",
    needs: ["vision"],
  },
  hard_to_detect_obstacle: {
    label: "Hard-to-detect obstacle",
    description:
      "An obstacle a white cane may not detect, such as something overhanging or protruding at head or chest height, or an unmarked low barrier with no visual contrast.",
    needs: ["vision"],
  },
  crossing_problem: {
    label: "Crossing problem",
    description:
      "A pedestrian crossing with no dropped kerb, a blocked crossing point, or worn crossing markings. Whether signals are audible or visible cannot be judged from a photo.",
    needs: ["mobility", "vision", "cognitive"],
  },
  signage_problem: {
    label: "Signage or wayfinding problem",
    description:
      "A sign that is visibly unreadable, low-contrast, damaged, blocked, or confusing, such as a diversion with no clear alternative route.",
    needs: ["vision", "hearing", "cognitive"],
  },
  other: {
    label: "Other potential barrier",
    description: "A visible condition that may hinder accessible passage but fits no other category.",
    needs: ["general"],
  },
};

export const LEVEL_LABEL: Record<Level, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
