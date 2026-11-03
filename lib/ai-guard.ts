import "server-only";
import { createHash } from "node:crypto";
import { aiUsage } from "./store";

// Keeping Meta API use honest and bounded. Three jobs:
//  - Credits running out stops AI calls and says so. There is no fallback to anything paid, and
//    the rest of the site keeps working.
//  - The same photo sent twice is not paid for twice.
//  - Every call is counted, so usage can be compared with the account's own Usage page.
//
// All of this is per server instance except the usage records, so it reduces spend rather than
// guaranteeing a total. The limit that actually protects the account is on Meta's side.

/** How long AI stays off after the provider says credits or billing are the problem. */
const EXHAUSTED_PAUSE_MS = 60 * 60 * 1000;
let exhaustedUntil = 0;

export const AI_EXHAUSTED_MESSAGE =
  "AI analysis is unavailable right now because this demo's API credit has run out or cannot be used. Nothing was charged. You can still browse places and add observations.";

/** True for errors that mean credits, quota or billing, as opposed to being briefly busy. */
export function isCreditError(error: unknown): boolean {
  const e = error as { status?: number; code?: string; error?: { code?: string; type?: string }; message?: string } | undefined;
  if (!e) return false;
  if (e.status === 402) return true;
  const text = `${e.code ?? ""} ${e.error?.code ?? ""} ${e.error?.type ?? ""} ${e.message ?? ""}`.toLowerCase();
  return /insufficient_quota|billing|credit|quota exceeded|payment/.test(text);
}

export function noteCreditExhausted(now = Date.now()): void {
  exhaustedUntil = now + EXHAUSTED_PAUSE_MS;
  console.error("[ai] the provider reported a credit or billing problem; AI calls are paused for an hour on this instance");
}

export function aiExhausted(now = Date.now()): boolean {
  return now < exhaustedUntil;
}

/** For tests. */
export function resetAiGuard(): void {
  exhaustedUntil = 0;
  cache.clear();
}

// ------------------------------------------------------------------ the same request twice

const MAX_ENTRIES = 100;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

/** How long a result is reused. AI_CACHE_SECONDS=0 turns reuse off. */
function cacheMs(): number {
  const n = Number(process.env.AI_CACHE_SECONDS);
  return (Number.isFinite(n) && n >= 0 && process.env.AI_CACHE_SECONDS !== undefined ? n : 3600) * 1000;
}

export function requestKey(...parts: string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part).update("\0");
  return hash.digest("hex");
}

/**
 * Runs `call`, unless the same request ran recently or is running now, in which case that result is
 * shared. A failure is not kept, so trying again really does try again. `cached` says whether this
 * caller reused an earlier call rather than making one.
 */
export async function once<T>(key: string, call: () => Promise<T>, now = Date.now()): Promise<{ value: T; cached: boolean }> {
  const ttl = cacheMs();
  if (ttl === 0) return { value: await call(), cached: false };
  const hit = cache.get(key);
  if (hit && now - hit.at < ttl) return { value: (await hit.value) as T, cached: true };
  const value = call();
  cache.set(key, { at: now, value });
  value.catch(() => cache.delete(key));
  for (const oldest of cache.keys()) {
    if (cache.size <= MAX_ENTRIES) break;
    cache.delete(oldest);
  }
  return { value: await value, cached: false };
}

export function forget(key: string): void {
  cache.delete(key);
}

// ------------------------------------------------------------------ usage records

export interface ModelUsage {
  calls: number;
  failures: number;
  promptTokens: number;
  completionTokens: number;
  milliseconds: number;
}

export interface UsageDay {
  /** A stable id per day; see dayId. */
  id: string;
  createdAt: string;
  day: string;
  models: Record<string, ModelUsage>;
}

function dayId(day: string): string {
  const h = createHash("sha256").update(`usage:${day}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Adds one call to today's record. Never lets accounting break the request. Two instances writing at
 * the same moment can lose a count, so treat these as a close estimate; the account's Usage page is the truth.
 */
export async function recordUsage(
  model: string,
  outcome: { ok: boolean; promptTokens?: number; completionTokens?: number; milliseconds: number },
  now = new Date(),
): Promise<void> {
  try {
    const day = now.toISOString().slice(0, 10);
    const id = dayId(day);
    const record = (await aiUsage.get(id)) ?? { id, createdAt: now.toISOString(), day, models: {} };
    const entry = record.models[model] ?? { calls: 0, failures: 0, promptTokens: 0, completionTokens: 0, milliseconds: 0 };
    entry.calls++;
    if (!outcome.ok) entry.failures++;
    entry.promptTokens += outcome.promptTokens ?? 0;
    entry.completionTokens += outcome.completionTokens ?? 0;
    entry.milliseconds += Math.round(outcome.milliseconds);
    await aiUsage.update({ ...record, models: { ...record.models, [model]: entry } });
  } catch (error) {
    console.error("[ai] could not record usage", error);
  }
}

/** Runs one model call and counts it, whichever way it ends. A credit error also pauses further calls. */
export async function metered<T>(model: string, call: () => Promise<T>, tokens?: (result: T) => { promptTokens?: number; completionTokens?: number }): Promise<T> {
  const started = Date.now();
  try {
    const result = await call();
    await recordUsage(model, { ok: true, milliseconds: Date.now() - started, ...tokens?.(result) });
    return result;
  } catch (error) {
    if (isCreditError(error)) noteCreditExhausted();
    await recordUsage(model, { ok: false, milliseconds: Date.now() - started });
    throw error;
  }
}
