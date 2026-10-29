import "server-only";
import { isOwner, ownerKeyRequired } from "./owner";

// Best-effort hourly limit per visitor on the paid Meta API calls, so a public demo link cannot
// drain the API key. In memory, so each server instance counts on its own.
const WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_PUBLIC_LIMIT = 30;
const MAX_TRACKED = 10_000;

const configured = Number(process.env.ANALYZE_LIMIT_PER_HOUR);
const LIMIT = Number.isInteger(configured) && configured > 0 ? configured : ownerKeyRequired() ? DEFAULT_PUBLIC_LIMIT : undefined;

const hits = new Map<string, number[]>();

/** True when the request may go ahead; counts it if so. The owner is never limited. */
export async function allowRequest(bucket: string, request: Request): Promise<boolean> {
  if (LIMIT === undefined || (await isOwner())) return true;
  const now = Date.now();
  const key = `${bucket}:${clientAddress(request)}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.delete(key);
  hits.set(key, recent);
  // Forget the least recently active visitors rather than grow without bound.
  for (const oldest of hits.keys()) {
    if (hits.size <= MAX_TRACKED) break;
    hits.delete(oldest);
  }
  return true;
}

export const RATE_LIMITED = "You have reached this demo's hourly limit. Please try again later.";

function clientAddress(request: Request): string {
  // Vercel sets x-forwarded-for itself, so the first entry is the real client.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}
