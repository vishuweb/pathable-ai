// Smoke test: sends one image to Muse Spark and prints the reply.
// Usage: node --env-file=.env.local scripts/smoke-spark.mjs path/to/photo.jpg
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import OpenAI from "openai";

const imagePath = process.argv[2];
if (!imagePath) {
  console.error("Usage: node --env-file=.env.local scripts/smoke-spark.mjs <image>");
  process.exit(1);
}
if (!process.env.MODEL_API_KEY) {
  console.error("MODEL_API_KEY is missing. Put it in .env.local.");
  process.exit(1);
}

const mime = { ".png": "image/png", ".webp": "image/webp" }[extname(imagePath).toLowerCase()] ?? "image/jpeg";
const dataUrl = `data:${mime};base64,${(await readFile(imagePath)).toString("base64")}`;

const client = new OpenAI({
  apiKey: process.env.MODEL_API_KEY,
  baseURL: process.env.META_API_BASE_URL ?? "https://api.meta.ai/v1",
});

const started = Date.now();
const response = await client.chat.completions.create({
  model: process.env.ANALYSIS_MODEL ?? "muse-spark-1.3",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "Briefly describe anything in this photo that could make it harder for a wheelchair user to pass." },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ],
});

console.log(response.choices[0]?.message?.content);
console.log(`\n[${response.model}] ${Date.now() - started} ms`, response.usage ?? "");
