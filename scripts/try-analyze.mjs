// Sends a photo to the running app's /api/analyze route and prints the findings.
// Usage: npm run dev  (in another terminal), then
//        node scripts/try-analyze.mjs path/to/photo.jpg [http://localhost:3000]
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const [imagePath, baseUrl = "http://localhost:3000"] = process.argv.slice(2);
if (!imagePath) {
  console.error("Usage: node scripts/try-analyze.mjs <image> [baseUrl]");
  process.exit(1);
}

const mime = { ".png": "image/png", ".webp": "image/webp" }[extname(imagePath).toLowerCase()] ?? "image/jpeg";
const image = `data:${mime};base64,${(await readFile(imagePath)).toString("base64")}`;

const res = await fetch(`${baseUrl}/api/analyze`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ image }),
});
const body = await res.json();
if (!res.ok) {
  console.error(`HTTP ${res.status}:`, body.error);
  process.exit(1);
}

const { analysis, model, analysisMs } = body;
console.log(`${model} · ${analysisMs} ms · ${analysis.scene_type} · image quality: ${analysis.image_quality}`);
console.log(analysis.scene_summary);
if (!analysis.findings.length) console.log(`\nNo findings: ${analysis.no_findings_reason}`);
for (const [i, f] of analysis.findings.entries()) {
  const b = f.evidence_box;
  console.log(`\n#${i + 1} [${f.category}] ${f.title}`);
  console.log(`   impact ${f.potential_impact}, confidence ${f.confidence}`);
  console.log(`   evidence: "${f.evidence_phrase}" box (${b.x_min},${b.y_min})-(${b.x_max},${b.y_max})`);
  console.log(`   observed: ${f.observed_condition}`);
  console.log(`   why: ${f.why_it_matters}`);
  console.log(`   uncertainty: ${f.uncertainty}`);
  console.log(`   next step: ${f.suggested_next_step}`);
}
