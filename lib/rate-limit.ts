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

const RATE_LIMITED = "You have reached this demo's hourly limit. Please try again later.";

// A daily cap on all paid AI calls together (every visitor, including the owner), so a public link
// cannot run up the API bill. AI_PAUSED=1 stops AI calls entirely. Like the hourly limit, the count
// is kept in memory on each server instance, so it bounds cost rather than enforcing an exact total.
const DEFAULT_PUBLIC_DAILY_LIMIT = 300;
const configuredDaily = Number(process.env.AI_DAILY_LIMIT);
const DAILY_LIMIT =
  Number.isInteger(configuredDaily) && configuredDaily > 0
    ? configuredDaily
    : ownerKeyRequired()
      ? DEFAULT_PUBLIC_DAILY_LIMIT
      : undefined;
const daily = { day: "", used: 0 };

/** For the routes that call the Meta API: a refusal, or undefined when the call may go ahead. */
export async function limitAiRequest(bucket: string, request: Request): Promise<{ status: number; error: string } | undefined> {
  if (process.env.AI_PAUSED === "1") {
    return { status: 503, error: "AI analysis is paused on this demo. Please try again later." };
  }
  if (!(await allowRequest(bucket, request))) return { status: 429, error: RATE_LIMITED };
  if (DAILY_LIMIT === undefined) return undefined;
  const today = new Date().toISOString().slice(0, 10);
  if (daily.day !== today) Object.assign(daily, { day: today, used: 0 });
  if (daily.used >= DAILY_LIMIT) {
    return { status: 429, error: "This demo has reached today's AI limit. Please try again tomorrow." };
  }
  daily.used++;
  return undefined;
}

function clientAddress(request: Request): string {
  // Vercel sets x-forwarded-for itself, so the first entry is the real client.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}
