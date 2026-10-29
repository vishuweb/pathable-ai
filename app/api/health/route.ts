import { ANALYSIS_MODEL, SEGMENTATION_MODEL, isApiKeyConfigured } from "@/lib/meta";
import { STORAGE } from "@/lib/store";
import { TRANSCRIPTION_MODEL } from "@/lib/transcribe";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    apiKeyConfigured: isApiKeyConfigured(),
    models: { analysis: ANALYSIS_MODEL, segmentation: SEGMENTATION_MODEL, transcription: TRANSCRIPTION_MODEL },
    storage: STORAGE,
  });
}
