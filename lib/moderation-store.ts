import "server-only";
import { isPublic, moderationState, type ModerationRecord } from "./moderation";
import type { Observation } from "./observations";
import { roleOf, type Role } from "./owner";
import type { SavedReport } from "./report";
import { observations, reports } from "./store";

/** How many submissions may wait for approval at once; beyond it, new ones are refused. Counted from storage. */
export function maxPending(): number {
  const n = Number(process.env.MAX_PENDING_SUBMISSIONS);
  return Number.isInteger(n) && n > 0 ? n : 100;
}

/** The moderation state a new submission starts in: the owner's and reviewers' are trusted, a visitor's wait. */
export function initialModeration(role: Role | undefined, now = new Date().toISOString()): ModerationRecord {
  return role
    ? { state: "approved", at: now, note: role === "owner" ? "Saved by the owner" : "Saved by a reviewer" }
    : { state: "pending", at: now };
}

export async function countPending(): Promise<number> {
  const [r, o] = await Promise.all([reports.list(), observations.list()]);
  return [...r, ...o].filter((item) => moderationState(item) === "pending").length;
}

/** A refusal when the approval backlog is full, or undefined. Owners and reviewers are never refused. */
export async function backlogFull(request: Request): Promise<{ status: number; error: string } | undefined> {
  if (roleOf(request)) return undefined;
  if ((await countPending()) >= maxPending()) {
    return { status: 503, error: "Too many submissions are waiting for review. Please try again in a few days." };
  }
  return undefined;
}

/** Reports anyone may see. */
export async function publicReports(): Promise<SavedReport[]> {
  return (await reports.list()).filter(isPublic);
}

/** A report if the viewer may see it: public ones for anyone, any for the owner. */
export async function visibleReport(id: string, owner: boolean): Promise<SavedReport | undefined> {
  const report = await reports.get(id);
  return report && (owner || isPublic(report)) ? report : undefined;
}

export async function publicObservations(): Promise<Observation[]> {
  return (await observations.list()).filter(isPublic);
}

export async function visibleObservation(id: string, owner: boolean): Promise<Observation | undefined> {
  const observation = await observations.get(id);
  return observation && (owner || isPublic(observation)) ? observation : undefined;
}
