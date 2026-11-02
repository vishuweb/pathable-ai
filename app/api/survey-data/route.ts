import { parseCsv, toCsv } from "@/lib/csv";
import { jsonResponse, readBody } from "@/lib/http";
import { requireRole } from "@/lib/owner";
import { allowRequest } from "@/lib/rate-limit";
import { sublocations, surveys } from "@/lib/store";
import { FULL_COLUMNS, PUBLIC_COLUMNS, surveyRows } from "@/lib/survey-data";
import { MAX_IMPORT_ROWS, commitImport, planImport } from "@/lib/survey-import";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Export. ?scope=public (anyone): approved surveys and public fields only. ?scope=full (owner only): everything,
 * as a backup, including drafts and private notes. &format=csv or json.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "full" ? "full" : "public";
  if (scope === "full") {
    const denied = requireRole(request, "owner");
    if (denied) return denied;
  } else if (!(await allowRequest("survey-export", request))) {
    return jsonResponse<ApiError>({ error: "You have reached this demo's hourly limit. Please try again later." }, 429);
  }
  const rows = surveyRows(await surveys.list(), await sublocations.list(), scope);
  const name = `pathable-survey-${scope}`;
  const headers = { "Cache-Control": "private, no-store" };
  if (url.searchParams.get("format") === "csv") {
    const columns = scope === "full" ? FULL_COLUMNS : PUBLIC_COLUMNS;
    return new Response(toCsv(columns, rows), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
    });
  }
  return new Response(JSON.stringify({ scope, rows }, null, 2), {
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.json"` },
  });
}

/**
 * Import, owner only. The body is CSV (text/csv) or JSON ({ rows: [...] }). Without ?commit=1 it is a preview and
 * stores nothing. With it, a file with any error is refused whole, and nothing existing is ever changed.
 */
export async function POST(request: Request) {
  const denied = requireRole(request, "owner");
  if (denied) return denied;
  const body = await readBody(request, 4 * 1024 * 1024);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);
  const raw = Buffer.from(body.value).toString("utf8");

  let rows: Record<string, unknown>[];
  if ((request.headers.get("content-type") ?? "").includes("text/csv")) {
    const parsed = parseCsv(raw);
    if ("error" in parsed) return jsonResponse<ApiError>({ error: parsed.error }, 400);
    rows = parsed.rows;
  } else {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return jsonResponse<ApiError>({ error: "The file is not valid JSON." }, 400);
    }
    const list = (value as { rows?: unknown } | null)?.rows;
    if (!Array.isArray(list) || list.some((r) => typeof r !== "object" || r === null)) {
      return jsonResponse<ApiError>({ error: "Expected { rows: [...] }, one object per recorded attribute." }, 400);
    }
    rows = list as Record<string, unknown>[];
  }
  if (rows.length > MAX_IMPORT_ROWS) return jsonResponse<ApiError>({ error: `Import at most ${MAX_IMPORT_ROWS} rows at a time.` }, 400);

  const plan = await planImport(rows);
  const preview = {
    rows: plan.rows,
    errors: plan.errors,
    surveys: plan.surveys.map((s) => ({
      place: s.place.name,
      target: s.sublocation ? `${s.sublocation.type}: ${s.sublocation.name}` : "The whole place",
      checklist: s.checklistId,
      observedOn: s.observedOn,
      source: s.source,
      answers: Object.keys(s.answers).length,
      duplicateOf: s.duplicateOf,
      conflictsWith: s.conflictsWith,
    })),
  };
  if (new URL(request.url).searchParams.get("commit") !== "1") return jsonResponse({ ...preview, committed: false });
  if (plan.errors.length) return jsonResponse({ ...preview, committed: false, error: "Fix the errors first. Nothing was imported." }, 400);
  return jsonResponse({ ...preview, committed: true, created: await commitImport(plan) });
}
