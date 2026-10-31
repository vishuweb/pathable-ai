// One-time setup so a helper can review the queue on the live site. Run it yourself, from the folder
// that holds your data/ and is linked to Vercel (the project folder), after `vercel login`:
//   node scripts/setup-reviewer.mjs
// It (1) copies the queue of analyzed photos to the live site's private storage, (2) creates a reviewer
// password and saves it to the git-ignored file .env.reviewer.local, (3) sets REVIEWER_KEY on Vercel as a
// sensitive variable, (4) redeploys so it takes effect, and (5) deletes the temporary credentials file.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const SITE = "https://pathable-ai.vercel.app";
const ENV_FILE = ".env.production.local";
const KEY_FILE = ".env.reviewer.local";
const shell = process.platform === "win32";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: options.input ? ["pipe", "inherit", "inherit"] : "inherit", shell, ...options });
  if (result.status !== 0) {
    console.error(`\nStopped: "${command} ${args.join(" ")}" failed.`);
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(".vercel/project.json")) {
  console.error("This folder is not linked to Vercel. Run `vercel link` here first, or run this from the project folder.");
  process.exit(1);
}
if (!existsSync("data/drafts")) {
  console.error("No data/drafts folder here, so there is no queue to upload. Run this from the folder where you analyzed the photos.");
  process.exit(1);
}

console.log("1/5 Fetching the storage token (temporary file, git-ignored)...");
run("vercel", ["env", "pull", ENV_FILE, "--environment", "production", "--yes"]);

try {
  console.log("\n2/5 Uploading the review queue to the live site...");
  run("node", [`--env-file=${ENV_FILE}`, "scripts/upload-data.mjs"]);

  console.log("\n3/5 Setting the reviewer password...");
  let key;
  if (existsSync(KEY_FILE)) key = /REVIEWER_KEY=(.+)/.exec(readFileSync(KEY_FILE, "utf8"))?.[1]?.trim();
  if (!key) {
    key = randomBytes(18).toString("base64url");
    writeFileSync(KEY_FILE, `# Give this password to your reviewer. Never commit it.\nREVIEWER_KEY=${key}\n`);
  }
  run("vercel", ["env", "add", "REVIEWER_KEY", "production", "--sensitive", "--force", "--yes"], { input: key });

  console.log("\n4/5 Redeploying so the password takes effect...");
  run("vercel", ["redeploy", SITE, "--environment", "production"]);
} finally {
  console.log("\n5/5 Removing the temporary credentials file.");
  rmSync(ENV_FILE, { force: true });
}

console.log(`\nDone. The reviewer password is in ${KEY_FILE}. Your reviewer signs in at ${SITE}/owner with it.`);
console.log("Review on the live site only from now on, so the work is not done twice.");
