import { ANALYSIS_MODEL, SEGMENTATION_MODEL, isApiKeyConfigured } from "@/lib/meta";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    apiKeyConfigured: isApiKeyConfigured(),
    models: { analysis: ANALYSIS_MODEL, segmentation: SEGMENTATION_MODEL },
  });
}
