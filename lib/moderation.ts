// Moderation: what a visitor submits is not public until the owner approves it. Items made before
// moderation existed have no record and count as approved, so nothing already public disappears.
// Shared by browser and server.
export const MODERATION_STATES = ["pending", "approved", "rejected"] as const;
export type ModerationState = (typeof MODERATION_STATES)[number];

export interface ModerationRecord {
  state: ModerationState;
  /** When this state was set. */
  at: string;
  /** Who or why, e.g. "Saved by a reviewer" or the owner's reason for rejecting. */
  note?: string;
}

export interface Moderated {
  moderation?: ModerationRecord;
}

export function moderationState(item: Moderated): ModerationState {
  return item.moderation?.state ?? "approved";
}

/** Whether anyone may see the item. */
export function isPublic(item: Moderated): boolean {
  return moderationState(item) === "approved";
}
