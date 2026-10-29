// Copies local saved reports and the review queue to Vercel Blob, so a deployment shows them.
// Usage: vercel env pull .env.production.local   (gets BLOB_READ_WRITE_TOKEN)
//        node --env-file=.env.production.local scripts/upload-data.mjs [data-dir]
// Items already in the store are skipped, so it is safe to run again.
import { list, put } from "@vercel/blob";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN is missing. Run `vercel env pull .env.production.local` first.");
  process.exit(1);
}
const access = process.env.BLOB_ACCESS === "public" ? "public" : "private";
const dataDir = path.resolve(process.argv[2] ?? process.env.DATA_DIR ?? "data");

for (const folder of ["reports", "drafts"]) {
  let names;
  try {
    names = await readdir(path.join(dataDir, folder));
  } catch {
    console.log(`${folder}: nothing to upload`);
    continue;
  }
  const existing = new Set();
  let cursor;
  do {
    const page = await list({ prefix: `${folder}/`, cursor });
    for (const blob of page.blobs) existing.add(blob.pathname);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  // Images before JSON, matching the app: a listed item always has its image.
  const files = ["jpg", "json"].flatMap((ext) => names.filter((n) => new RegExp(`^[0-9a-f-]{36}\\.${ext}$`).test(n)));
  let uploaded = 0;
  for (const name of files) {
    const key = `${folder}/${name}`;
    if (existing.has(key)) continue;
    const contentType = name.endsWith(".jpg") ? "image/jpeg" : "application/json";
    await put(key, await readFile(path.join(dataDir, folder, name)), { access, contentType, addRandomSuffix: false, allowOverwrite: true });
    uploaded++;
  }
  console.log(`${folder}: ${uploaded} files uploaded, ${files.length - uploaded} already there`);
}
