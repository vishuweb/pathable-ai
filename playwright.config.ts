import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// UI review against a local production build. Throwaway data, no Meta key and an unreachable Meta
// address, so a run cannot touch real records or spend credits. Run with `npm run ui:review`.
export const LOCAL_OWNER_KEY = "local-ui-review-only";
const PORT = 3191;

export default defineConfig({
  testDir: "ui-review",
  outputDir: "ui-review/output/results",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    reducedMotion: "reduce",
  },
  webServer: {
    command: `npx next build && npx next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      NEXT_DIST_DIR: ".next-ui",
      NEXT_TELEMETRY_DISABLED: "1",
      DATA_DIR: mkdtempSync(path.join(os.tmpdir(), "pathable-ui-")),
      OWNER_KEY: LOCAL_OWNER_KEY,
      META_API_BASE_URL: "http://127.0.0.1:9",
      // Pages fall back to the saved directory, so repeat runs put no load on OpenStreetMap's servers.
      NOMINATIM_URL: "http://127.0.0.1:9",
      OSM_API_URL: "http://127.0.0.1:9",
      MODEL_API_KEY: "",
      BLOB_READ_WRITE_TOKEN: "",
      AI_PAUSED: "1",
    },
  },
});
