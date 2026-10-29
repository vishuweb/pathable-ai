import "server-only";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SavedReport } from "./report";

// Local-disk storage for the MVP: one JSON file and one JPEG per report.
// A hosted store replaces this before the public deployment (local disk does not persist there).
const REPORTS_DIR = path.resolve(process.env.REPORTS_DIR ?? "data/reports");
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isReportId(id: string): boolean {
  return ID_RE.test(id);
}

export async function saveReport(report: SavedReport, imageJpeg: Buffer): Promise<void> {
  if (!isReportId(report.id)) throw new Error("Invalid report id.");
  await mkdir(REPORTS_DIR, { recursive: true });
  await writeFile(reportFile(report.id, "jpg"), imageJpeg);
  // JSON goes last and atomically, so a listed report always has its image.
  const tmp = reportFile(report.id, "json.tmp");
  await writeFile(tmp, JSON.stringify(report));
  await rename(tmp, reportFile(report.id, "json"));
}

/** All saved reports, newest first. */
export async function listReports(): Promise<SavedReport[]> {
  let names: string[];
  try {
    names = await readdir(REPORTS_DIR);
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
  const ids = names.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -".json".length));
  const reports = await Promise.all(ids.map(readReport));
  return reports
    .filter((r): r is SavedReport => r !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getReport(id: string): Promise<SavedReport | undefined> {
  return readReport(id);
}

export async function getReportImage(id: string): Promise<Buffer | undefined> {
  if (!isReportId(id)) return undefined;
  try {
    return await readFile(reportFile(id, "jpg"));
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

async function readReport(id: string): Promise<SavedReport | undefined> {
  if (!isReportId(id)) return undefined;
  try {
    return JSON.parse(await readFile(reportFile(id, "json"), "utf8")) as SavedReport;
  } catch (error) {
    if (!isNotFound(error)) console.error(`[store] could not read report ${id}`, error);
    return undefined;
  }
}

function reportFile(id: string, extension: string): string {
  return path.join(REPORTS_DIR, `${id}.${extension}`);
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}
