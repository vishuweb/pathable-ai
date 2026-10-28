// Runs the full pipeline (/api/analyze then /api/segment) against the running app and prints the report.
// Usage: npm run dev  (in another terminal), then
//        node scripts/try-analyze.mjs path/to/photo.jpg [http://localhost:3000]
// Note: sends the file as-is; the web app also resizes photos first, so use images ≤1600 px here.
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const [imagePath, baseUrl = "http://localhost:3000"] = process.argv.slice(2);
if (!imagePath) {
  console.error("Usage: node scripts/try-analyze.mjs <image> [baseUrl]");
  process.exit(1);
}

const bytes = await readFile(imagePath);
const mime = { ".png": "image/png", ".webp": "image/webp" }[extname(imagePath).toLowerCase()] ?? "image/jpeg";
const image = `data:${mime};base64,${bytes.toString("base64")}`;
const { width, height } = imageSize(bytes);

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`${path} → HTTP ${res.status}: ${data.error}`);
    process.exit(1);
  }
  return data;
}

const { analysis, model, analysisMs } = await post("/api/analyze", { image });
console.log(`${model} · ${analysisMs} ms · ${analysis.scene_type} · image quality: ${analysis.image_quality}`);
console.log(analysis.scene_summary);
if (!analysis.findings.length) {
  console.log(`\nNo findings: ${analysis.no_findings_reason}`);
  process.exit(0);
}

const targets = analysis.findings.map((f) => ({ findingId: f.id, phrase: f.evidence_phrase, box: f.evidence_box }));
const seg = await post("/api/segment", { image, width, height, targets });
const evidence = new Map(seg.evidence.map((e) => [e.findingId, e]));
console.log(`${seg.model} · ${seg.segmentationMs} ms`);

for (const [i, f] of analysis.findings.entries()) {
  const ev = evidence.get(f.id);
  console.log(`\n#${i + 1} [${f.category}] ${f.title}`);
  console.log(`   impact ${f.potential_impact}, confidence ${f.confidence}`);
  console.log(`   observed: ${f.observed_condition}`);
  console.log(`   why: ${f.why_it_matters}`);
  console.log(`   uncertainty: ${f.uncertainty}`);
  console.log(`   next step: ${f.suggested_next_step}`);
  console.log(`   evidence [${ev.status}] ${ev.note}`);
  for (const r of ev.regions) {
    console.log(`     object ${r.objectId} conf ${r.confidence?.toFixed(2) ?? "?"} box`, r.box);
  }
}

/** Reads width/height from a JPEG or PNG header. */
function imageSize(buf) {
  if (buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  let o = 2;
  while (o < buf.length) {
    const marker = buf.readUInt16BE(o);
    const len = buf.readUInt16BE(o + 2);
    if (marker >= 0xffc0 && marker <= 0xffcf && ![0xffc4, 0xffc8, 0xffcc].includes(marker)) {
      return { height: buf.readUInt16BE(o + 5), width: buf.readUInt16BE(o + 7) };
    }
    o += 2 + len;
  }
  throw new Error("Could not read image size (use JPEG or PNG).");
}
