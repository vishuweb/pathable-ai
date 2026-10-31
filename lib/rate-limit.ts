import "server-only";
import { ownerKeyRequired, roleOf } from "./owner";

// Limits on what a public visitor can do. Each limit below is in memory, so each server instance
// counts on its own: they slow abuse and bound cost, they do not enforce an exact total. The hard
// bound on stored submissions is the pending-approval backlog cap in lib/moderation-store.ts, which
// is counted from storage.
//
// Limits apply only when the server is public (keys set, or production). In plain local
// development nothing is limited.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_TRACKED = 10_000;

const positiveInteger = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** Requests per visitor per hour on the AI-backed routes, place search and sign-in. */
function hourlyLimit(): number | undefined {
  const configured = Number(process.env.ANALYZE_LIMIT_PER_HOUR);
  if (Number.isInteger(configured) && configured > 0) return configured;
  return ownerKeyRequired() ? 30 : undefined;
}

/** Public submissions (reports, observations) per visitor per hour. */
function submissionLimit(): number | undefined {
  const configured = Number(process.env.SUBMISSION_LIMIT_PER_HOUR);
  if (Number.isInteger(configured) && configured > 0) return configured;
  return ownerKeyRequired() ? 10 : undefined;
}

const hits = new Map<string, number[]>();

interface Options {
  /** Overrides the default hourly limit for this bucket. */
  limit?: number;
  /** Also exempt signed-in reviewers (they save queue reviews). The owner is always exempt. */
  exemptReviewers?: boolean;
}

/** True when the request may go ahead; counts it if so. */
export async function allowRequest(bucket: string, request: Request, options: Options = {}): Promise<boolean> {
  const limit = options.limit ?? hourlyLimit();
  if (limit === undefined) return true;
  const role = roleOf(request);
  if (role === "owner" || (role === "reviewer" && options.exemptReviewers)) return true;

  const now = Date.now();
  const key = `${bucket}:${clientAddress(request)}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
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

const today = () => new Date().toISOString().slice(0, 10);
const daily = { ai: { day: "", used: 0 }, submissions: { day: "", used: 0 } };

function countToday(counter: { day: string; used: number }, cap: number): boolean {
  if (counter.day !== today()) Object.assign(counter, { day: today(), used: 0 });
  if (counter.used >= cap) return false;
  counter.used++;
  return true;
}

/** For the routes that call the Meta API: a refusal, or undefined when the call may go ahead. */
export async function limitAiRequest(bucket: string, request: Request): Promise<{ status: number; error: string } | undefined> {
  if (process.env.AI_PAUSED === "1") {
    return { status: 503, error: "AI analysis is paused on this demo. Please try again later." };
  }
  if (!(await allowRequest(bucket, request))) return { status: 429, error: RATE_LIMITED };
  // A daily cap on all AI calls together (every visitor, including the owner), so a public link
  // cannot run up the API bill.
  const configured = Number(process.env.AI_DAILY_LIMIT);
  const cap = Number.isInteger(configured) && configured > 0 ? configured : ownerKeyRequired() ? 300 : undefined;
  if (cap !== undefined && !countToday(daily.ai, cap)) {
    return { status: 429, error: "This demo has reached today's AI limit. Please try again tomorrow." };
  }
  return undefined;
}

/**
 * For routes that publish a visitor's report or observation: a refusal, or undefined when the
 * submission may go ahead. The owner and signed-in reviewers are not limited.
 */
export async function limitSubmission(kind: "report" | "observation", request: Request): Promise<{ status: number; error: string } | undefined> {
  if (!(await allowRequest(`submit-${kind}`, request, { limit: submissionLimit(), exemptReviewers: true }))) {
    return { status: 429, error: "You have sent several submissions in the last hour. Please try again later." };
  }
  const role = roleOf(request);
  if (!role && ownerKeyRequired()) {
    const cap = positiveInteger(process.env.SUBMISSIONS_PER_DAY, 200);
    if (!countToday(daily.submissions, cap)) {
      return { status: 429, error: "This demo has reached today's submission limit. Please try again tomorrow." };
    }
  }
  return undefined;
}

function clientAddress(request: Request): string {
  // Vercel sets x-forwarded-for itself, so the first entry is the real client.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}
