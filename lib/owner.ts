import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Who may use the owner and reviewer tools.
//
// OWNER_KEY and REVIEWER_KEY are shared secrets. Signing in with one sets a signed session cookie
// that the server checks (signature, role and expiry) on every request, so a stolen or old cookie
// stops working when it expires or when the key is changed.
//
// Access fails closed: outside local development, if the keys are missing nobody can sign in and
// every protected route refuses. Only `next dev` / the test runner, with no keys at all, treats
// the visitor as the owner.

export const OWNER_COOKIE = "pathable_owner";
/** How long a sign-in lasts. The server enforces it; the cookie's own Max-Age is only a hint. */
export const SESSION_SECONDS = 60 * 60 * 24 * 7;

export type Role = "owner" | "reviewer";
export type SessionProblem = "missing" | "invalid" | "expired" | "locked";
export interface Session {
  role?: Role;
  problem?: SessionProblem;
}

export interface AccessConfig {
  ownerKey?: string;
  reviewerKey?: string;
  /** True on Vercel and for any build run with NODE_ENV=production. */
  production: boolean;
}

/** Read from the environment on every call, so configuration changes and tests take effect. */
export function accessConfig(env: NodeJS.ProcessEnv = process.env): AccessConfig {
  return {
    ownerKey: env.OWNER_KEY || undefined,
    reviewerKey: env.REVIEWER_KEY || undefined,
    production: env.NODE_ENV === "production" || env.VERCEL === "1",
  };
}

const TOKEN_RE = /^v1\.(owner|reviewer)\.(\d{10})\.([A-Za-z0-9_-]{43})$/;

function keyFor(role: Role, config: AccessConfig): string | undefined {
  return role === "owner" ? config.ownerKey : config.reviewerKey;
}

function signature(role: Role, expires: number, key: string): string {
  return createHmac("sha256", `pathable-session:${key}`).update(`v1.${role}.${expires}`).digest("base64url");
}

function sameText(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

/** The role and session cookie for a correct key, or undefined for a wrong or unconfigured one. */
export function signIn(
  candidate: string,
  config: AccessConfig = accessConfig(),
  now = Date.now(),
): { role: Role; value: string; maxAge: number } | undefined {
  for (const role of ["owner", "reviewer"] as const) {
    const key = keyFor(role, config);
    if (key !== undefined && sameText(candidate, key)) {
      const expires = Math.floor(now / 1000) + SESSION_SECONDS;
      return { role, value: `v1.${role}.${expires}.${signature(role, expires, key)}`, maxAge: SESSION_SECONDS };
    }
  }
  return undefined;
}

/** Judges a session cookie value. Pure, so every outcome can be tested. */
export function checkSession(cookie: string | undefined, config: AccessConfig = accessConfig(), now = Date.now()): Session {
  if (config.ownerKey === undefined && config.reviewerKey === undefined) {
    // No keys at all: open only for local development, and locked everywhere else.
    return config.production ? { problem: "locked" } : { role: "owner" };
  }
  if (!cookie) return { problem: "missing" };
  const match = TOKEN_RE.exec(cookie);
  if (!match) return { problem: "invalid" };
  const role = match[1] as Role;
  const expires = Number(match[2]);
  const key = keyFor(role, config);
  if (key === undefined || !sameText(signature(role, expires, key), match[3])) return { problem: "invalid" };
  // The signature is checked first, so a forged cookie is "invalid" and only a real one can "expire".
  if (expires * 1000 <= now) return { problem: "expired" };
  return { role };
}

function readCookie(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

/** The session of an API request, from its Cookie header. */
export function sessionFromRequest(request: Request, config: AccessConfig = accessConfig()): Session {
  return checkSession(readCookie(request.headers.get("cookie"), OWNER_COOKIE), config);
}

/** The session of a page render, from the cookie store. */
export async function sessionFromCookies(config: AccessConfig = accessConfig()): Promise<Session> {
  const open = checkSession(undefined, config);
  if (open.role || open.problem === "locked") return open;
  return checkSession((await cookies()).get(OWNER_COOKIE)?.value, config);
}

export async function isOwner(): Promise<boolean> {
  return (await sessionFromCookies()).role === "owner";
}

/** Owners and reviewers may work through the review queue. */
export async function canReview(): Promise<boolean> {
  return Boolean((await sessionFromCookies()).role);
}

/** Why a protected page is closed to this visitor: never signed in, or a session that stopped working. */
export async function sessionProblem(): Promise<SessionProblem | undefined> {
  return (await sessionFromCookies()).problem;
}

/** The role of an API request, if it has a valid session. */
export function roleOf(request: Request): Role | undefined {
  return sessionFromRequest(request).role;
}

/**
 * A refusal for an API request that lacks the needed role, or undefined when it may go ahead.
 * 401: no, invalid or expired session (the cookie is cleared if it is bad). 403: signed in, but not allowed.
 * 503: sign-in is not configured on this server.
 */
export function authFailure(session: Session, needed: Role): Response | undefined {
  const allowed = session.role === "owner" || (needed === "reviewer" && session.role === "reviewer");
  if (allowed) return undefined;

  const respond = (status: number, error: string, clear = false) => {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (clear) headers.append("Set-Cookie", `${OWNER_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    return new Response(JSON.stringify({ error }), { status, headers });
  };
  if (session.role) return respond(403, "Only the project owner can do this.");
  switch (session.problem) {
    case "locked":
      return respond(503, "Sign-in is not set up on this server, so this is closed.");
    case "expired":
      return respond(401, "Your session has expired. Sign in again at /owner.", true);
    case "invalid":
      return respond(401, "Your session is not valid. Sign in again at /owner.", true);
    default:
      return respond(401, needed === "owner" ? "Sign in as the project owner to do this." : "Sign in as a reviewer or the owner to do this.");
  }
}

/** For route handlers: `const denied = requireRole(request, "owner"); if (denied) return denied;` */
export function requireRole(request: Request, needed: Role): Response | undefined {
  return authFailure(sessionFromRequest(request), needed);
}

export function ownerKeyRequired(config: AccessConfig = accessConfig()): boolean {
  return config.ownerKey !== undefined || config.reviewerKey !== undefined || config.production;
}

/** A production server with no owner key: nobody can act as the owner until OWNER_KEY is set. */
export function ownerKeyMissing(config: AccessConfig = accessConfig()): boolean {
  return config.ownerKey === undefined && config.production;
}
