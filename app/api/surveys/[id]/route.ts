import { jsonResponse, readJsonBody } from "@/lib/http";
import { requireRole, sessionFromRequest } from "@/lib/owner";
import { surveyPhotos, surveys } from "@/lib/store";
import { SURVEY_ACTIONS, actionProblem, applyAction, parseAnswers, submitProblems, type StaffRole } from "@/lib/survey";
import { findChecklist } from "@/lib/survey-taxonomy";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** One survey in full, for the team. */
export async function GET(request: Request, { params }: Params) {
  const denied = requireRole(request, "reviewer");
  if (denied) return denied;
  const survey = await surveys.get((await params).id);
  if (!survey) return jsonResponse<ApiError>({ error: "Survey not found." }, 404);
  return jsonResponse(survey);
}

/**
 * Either saves answers and notes on a draft ({ answers, notes, privateNotes, observedOn }; owner only),
 * or moves it through review ({ action, note }; the workflow rules are in lib/survey.ts).
 */
export async function PATCH(request: Request, { params }: Params) {
  const denied = requireRole(request, "reviewer");
  if (denied) return denied;
  const role = sessionFromRequest(request).role as StaffRole;
  const survey = await surveys.get((await params).id);
  if (!survey) return jsonResponse<ApiError>({ error: "Survey not found." }, 404);
  const body = await readJsonBody(request, 64 * 1024);
  if (!body.ok) return jsonResponse<ApiError>({ error: body.error }, body.status);
  const input = (body.value ?? {}) as Record<string, unknown>;
  const at = new Date().toISOString();

  if (input.action !== undefined) {
    const action = SURVEY_ACTIONS.find((a) => a === input.action);
    if (!action) return jsonResponse<ApiError>({ error: "That is not something a survey can do." }, 400);
    const note = typeof input.note === "string" ? input.note.trim().slice(0, 1000) : "";
    const problem = actionProblem(survey, action, role, note);
    if (problem) return jsonResponse<ApiError>({ error: problem }, role === "reviewer" && (action === "submit" || action === "withdraw") ? 403 : 400);
    if (action === "submit") {
      const problems = submitProblems(survey);
      if (problems.length) return jsonResponse<ApiError & { problems: string[] }>({ error: problems[0], problems }, 400);
    }
    const updated = applyAction(survey, action, role, note, at);
    await surveys.update(updated);
    return jsonResponse(updated);
  }

  // Saving: only the owner, only while it is theirs to change. A public survey is not edited in place.
  if (role !== "owner") return jsonResponse<ApiError>({ error: "Only the project owner can change a survey." }, 403);
  if (survey.state !== "draft" && survey.state !== "returned") {
    return jsonResponse<ApiError>({ error: "This survey can no longer be changed. Start a new survey to replace it." }, 400);
  }
  const checklist = findChecklist(survey.checklistId);
  if (!checklist) return jsonResponse<ApiError>({ error: "This survey's checklist no longer exists." }, 400);
  const answers = input.answers === undefined ? survey.answers : parseAnswers(checklist, input.answers);
  if ("error" in answers) return jsonResponse<ApiError>({ error: String(answers.error) }, 400);
  // A photo can only be cited as evidence if it belongs to this survey.
  for (const answer of Object.values(answers)) {
    if (answer.photoIds?.some((id) => !survey.photoIds.includes(id))) return jsonResponse<ApiError>({ error: "That photo is not part of this survey." }, 400);
  }
  const text = (value: unknown, fallback: string, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : fallback);
  const observedOn = typeof input.observedOn === "string" ? input.observedOn : survey.observedOn;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observedOn) || Number.isNaN(Date.parse(observedOn))) return jsonResponse<ApiError>({ error: "Give the day you were there." }, 400);
  const updated = {
    ...survey,
    answers,
    observedOn,
    notes: text(input.notes, survey.notes, 2000),
    privateNotes: text(input.privateNotes, survey.privateNotes, 2000),
    updatedAt: at,
  };
  await surveys.update(updated);
  return jsonResponse(updated);
}

/** Owner only: deletes a survey and its photos. */
export async function DELETE(request: Request, { params }: Params) {
  const denied = requireRole(request, "owner");
  if (denied) return denied;
  const survey = await surveys.get((await params).id);
  if (!survey) return jsonResponse<ApiError>({ error: "Survey not found." }, 404);
  await Promise.all(survey.photoIds.map((id) => surveyPhotos.remove(id)));
  await surveys.remove(survey.id);
  return new Response(null, { status: 204 });
}
