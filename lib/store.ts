import "server-only";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnalysisDraft, SavedReport } from "./report";

// Local-disk storage for the MVP: one JSON file and one JPEG per item.
// A hosted store replaces this before the public deployment (local disk does not persist there).
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "data");
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isStoreId(id: string): boolean {
  return ID_RE.test(id);
}

interface Item {
  id: string;
  createdAt: string;
}

function collection<T extends Item>(name: string) {
  const dir = path.join(DATA_DIR, name);
  const file = (id: string, extension: string) => path.join(dir, `${id}.${extension}`);

  async function read(id: string): Promise<T | undefined> {
    if (!isStoreId(id)) return undefined;
    try {
      return JSON.parse(await readFile(file(id, "json"), "utf8")) as T;
    } catch (error) {
      if (!isNotFound(error)) console.error(`[store] could not read ${name}/${id}`, error);
      return undefined;
    }
  }

  return {
    async save(item: T, imageJpeg: Buffer): Promise<void> {
      if (!isStoreId(item.id)) throw new Error("Invalid id.");
      await mkdir(dir, { recursive: true });
      await writeFile(file(item.id, "jpg"), imageJpeg);
      // JSON goes last and atomically, so a listed item always has its image.
      const tmp = file(item.id, "json.tmp");
      await writeFile(tmp, JSON.stringify(item));
      await rename(tmp, file(item.id, "json"));
    },

    /** All items, oldest first. */
    async list(): Promise<T[]> {
      let names: string[];
      try {
        names = await readdir(dir);
      } catch (error) {
        if (isNotFound(error)) return [];
        throw error;
      }
      const ids = names.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -".json".length));
      const items = await Promise.all(ids.map(read));
      return items
        .filter((item): item is Awaited<T> => item !== undefined)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    get: read,

    async getImage(id: string): Promise<Buffer | undefined> {
      if (!isStoreId(id)) return undefined;
      try {
        return await readFile(file(id, "jpg"));
      } catch (error) {
        if (isNotFound(error)) return undefined;
        throw error;
      }
    },

    async remove(id: string): Promise<void> {
      if (!isStoreId(id)) return;
      // JSON first, so a half-removed item is never listed.
      await rm(file(id, "json"), { force: true });
      await rm(file(id, "jpg"), { force: true });
    },
  };
}

export const reports = collection<SavedReport>("reports");
export const drafts = collection<AnalysisDraft>("drafts");

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}
