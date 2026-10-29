import "server-only";
import { META_BASE_URL, MissingApiKeyError } from "./meta";

export const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL ?? "muse-voice-transcribe-1.0";
const TIMEOUT_MS = 30_000;

// Biases recognition toward the words reviewers use, which general speech models often mishear.
// Only one spelling of each homophone ("curb", not "kerb"), or the bias flips between them.
const KEYWORDS = [
  "curb ramp",
  "footpath",
  "sidewalk",
  "tactile paving",
  "bollard",
  "wheelchair",
  "mobility scooter",
  "e-scooter",
  "pram",
  "handrail",
  "step-free",
];

export class TranscriptionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TranscriptionError";
  }
}

export interface Transcript {
  text: string;
  audioDurationMs: number;
}

/** Transcribes a short WAV recording with Muse Voice. */
export async function transcribeWav(wav: Uint8Array<ArrayBuffer>, signal?: AbortSignal): Promise<Transcript> {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();

  const form = new FormData();
  const settings = { model: TRANSCRIPTION_MODEL, audioEncoding: "WAV", mode: "PUSH_TO_TALK", keywords: KEYWORDS };
  form.append("request", new Blob([JSON.stringify(settings)], { type: "application/json" }));
  form.append("audio", new Blob([wav], { type: "audio/wav" }), "note.wav");

  const deadline = AbortSignal.timeout(TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${META_BASE_URL}/asr/transcribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      body: form,
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
  } catch (error) {
    if (deadline.aborted) throw new TranscriptionError("The transcription took too long. Please try again.", 504);
    throw error;
  }

  if (!response.ok) {
    console.error("[transcribe] Meta Model API returned", response.status, (await response.text()).slice(0, 300));
    if (response.status === 429) throw new TranscriptionError("The voice service is busy. Please try again shortly.", 503);
    throw new TranscriptionError("The recording could not be transcribed. Please try again.", 502);
  }
  const body = (await response.json()) as { transcript?: unknown; audioDurationMs?: unknown };
  return {
    text: typeof body.transcript === "string" ? body.transcript.trim() : "",
    audioDurationMs: typeof body.audioDurationMs === "number" ? body.audioDurationMs : 0,
  };
}
