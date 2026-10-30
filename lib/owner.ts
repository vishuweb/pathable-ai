import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// On a public deployment, OWNER_KEY reserves the evaluation tools (batch analysis and the review
// queue) for the project owner. Without it, everyone is the owner in local development, but a
// Vercel deployment fails closed: the tools stay locked until a key is set.
const OWNER_KEY = process.env.OWNER_KEY || undefined;
// REVIEWER_KEY lets a helper work through the review queue without the owner's other powers
// (batch analysis, status changes, deleting reports).
const REVIEWER_KEY = process.env.REVIEWER_KEY || undefined;
const DEPLOYED = process.env.VERCEL === "1";

export const OWNER_COOKIE = "pathable_owner";
export const OWNER_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export type Role = "owner" | "reviewer";

/** The cookie holds a digest of the key and role, never the key itself. */
function token(key: string, role: Role = "owner"): string {
  return createHash("sha256").update(`pathable-${role}:${key}`).digest("hex");
}

export function ownerKeyRequired(): boolean {
  return OWNER_KEY !== undefined || DEPLOYED;
}

/** A deployment with no owner key: nobody can sign in until OWNER_KEY is set. */
export function ownerKeyMissing(): boolean {
  return OWNER_KEY === undefined && DEPLOYED;
}

/** The role and cookie value for a correct owner or reviewer key, or undefined for a wrong one. */
export function signInToken(candidate: string): { role: Role; value: string } | undefined {
  if (OWNER_KEY !== undefined && sameText(token(candidate), token(OWNER_KEY))) {
    return { role: "owner", value: token(OWNER_KEY) };
  }
  if (REVIEWER_KEY !== undefined && sameText(token(candidate, "reviewer"), token(REVIEWER_KEY, "reviewer"))) {
    return { role: "reviewer", value: token(REVIEWER_KEY, "reviewer") };
  }
  return undefined;
}

/** Owners and reviewers may work through the review queue. */
export async function canReview(): Promise<boolean> {
  if (await isOwner()) return true;
  if (REVIEWER_KEY === undefined) return false;
  const value = (await cookies()).get(OWNER_COOKIE)?.value;
  return value !== undefined && sameText(value, token(REVIEWER_KEY, "reviewer"));
}

export async function isOwner(): Promise<boolean> {
  if (OWNER_KEY === undefined) return !DEPLOYED;
  const value = (await cookies()).get(OWNER_COOKIE)?.value;
  return value !== undefined && sameText(value, token(OWNER_KEY));
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
