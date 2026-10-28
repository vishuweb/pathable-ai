// Smoke test: segments one noun phrase in a photo with SAM 3.1 and prints the parsed instances.
// Usage: node --env-file=.env.local scripts/smoke-sam.mjs path/to/photo.jpg "electric scooter"
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import OpenAI from "openai";
import { decodeMaskToSVGPath, parseImageStream, recordsOfKind } from "@meta-sam/parser";

const [imagePath, phrase = "scooter"] = process.argv.slice(2);
if (!imagePath || !process.env.MODEL_API_KEY) {
  console.error('Usage: node --env-file=.env.local scripts/smoke-sam.mjs <image> "<noun phrase>"');
  process.exit(1);
}

const mime = { ".png": "image/png", ".webp": "image/webp" }[extname(imagePath).toLowerCase()] ?? "image/jpeg";
const dataUrl = `data:${mime};base64,${(await readFile(imagePath)).toString("base64")}`;

const client = new OpenAI({
  apiKey: process.env.MODEL_API_KEY,
  baseURL: process.env.META_API_BASE_URL ?? "https://api.meta.ai/v1",
});

const started = Date.now();
const stream = await client.responses.create({
  model: process.env.SEGMENTATION_MODEL ?? "sam-3.1",
  input: [
    {
      role: "user",
      content: [
        { type: "input_text", text: phrase },
        { type: "input_image", image_url: dataUrl },
      ],
    },
  ],
  metadata: { include_confidence: "true", mask_encoding: "one_bit" },
  stream: true,
});

const result = await parseImageStream(stream).finalResult;
console.log(`"${phrase}" · ${Date.now() - started} ms · outcome ${result.outcome.status}`);
for (const d of result.diagnostics) console.log(`  diagnostic ${d.severity} ${d.code}: ${d.message}`);

const boxes = recordsOfKind(result.records, "box");
for (const m of recordsOfKind(result.records, "mask")) {
  const box = boxes.find((b) => b.objectId === m.objectId);
  const path = decodeMaskToSVGPath(m.mask);
  console.log(
    `  object ${m.objectId} conf ${box?.confidence ?? "?"} bounds`,
    m.bounds,
    `raster ${m.mask.width}x${m.mask.height} svg ${path.length} chars`,
  );
}
if (!boxes.length) console.log("  (no matches)");
