import { jsonResponse, readBody } from "@/lib/http";
import { MissingApiKeyError } from "@/lib/meta";
import { limitAiRequest } from "@/lib/rate-limit";
import { TRANSCRIPTION_MODEL, TranscriptionError, transcribeWav } from "@/lib/transcribe";
import type { ApiError, TranscribeResponse } from "@/lib/types";
import { MAX_VOICE_NOTE_SECONDS, readWavInfo } from "@/lib/wav";

export const runtime = "nodejs";
export const maxDuration = 60;

// A full-length note at 24 kHz, 16-bit mono, plus some slack.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Turns a recorded voice note (16-bit PCM WAV) into text for a review field. */
export async function POST(request: Request) {
  const limited = await limitAiRequest("transcribe", request);
  if (limited) return jsonResponse<ApiError>({ error: limited.error }, limited.status);
  const body = await readBody(request, MAX_BODY_BYTES);
  if (!body.ok) return jsonResponse<ApiError>({ error: "The recording is too long." }, 413);
  const audio = body.value;

  const info = readWavInfo(audio);
  if ("error" in info) return jsonResponse<ApiError>(info, 400);
  if (info.channels !== 1 || ![16_000, 24_000].includes(info.sampleRate) || info.bitsPerSample !== 16) {
    return jsonResponse<ApiError>({ error: "The audio must be 16-bit mono WAV at 16 or 24 kHz." }, 400);
  }
  if (info.durationMs < 300) return jsonResponse<ApiError>({ error: "The recording is too short." }, 400);
  if (info.durationMs > (MAX_VOICE_NOTE_SECONDS + 1) * 1000) {
    return jsonResponse<ApiError>({ error: "The recording is too long." }, 413);
  }

  const started = Date.now();
  try {
    const transcript = await transcribeWav(audio, request.signal);
    return jsonResponse<TranscribeResponse>({
      text: transcript.text,
      model: TRANSCRIPTION_MODEL,
      audioDurationMs: transcript.audioDurationMs,
      transcriptionMs: Date.now() - started,
    });
  } catch (error) {
    if (error instanceof MissingApiKeyError) return jsonResponse<ApiError>({ error: error.message }, 500);
    if (error instanceof TranscriptionError) return jsonResponse<ApiError>({ error: error.message }, error.status);
    if (!request.signal.aborted) console.error("[transcribe] request failed", error);
    return jsonResponse<ApiError>({ error: "The recording could not be transcribed. Please try again." }, 502);
  }
}
