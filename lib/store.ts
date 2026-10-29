import "server-only";
import { del, get, list, put } from "@vercel/blob";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnalysisDraft, SavedReport } from "./report";

// One JSON file and one JPEG per item. Local disk by default; Vercel Blob when a blob token is
// set, because a serverless deployment's disk does not persist between requests.
export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "data");
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isStoreId(id: string): boolean {
  return ID_RE.test(id);
}

interface Item {
  id: string;
  createdAt: string;
}

/** Flat key-value storage; keys look like "reports/<id>.json". */
interface Backend {
  read(key: string): Promise<Buffer | undefined>;
  /** Writes are atomic: a reader never sees a half-written file. */
  write(key: string, body: Buffer | string, contentType: string): Promise<void>;
  /** Keys directly under the folder. */
  keys(folder: string): Promise<string[]>;
  remove(key: string): Promise<void>;
}

const diskBackend: Backend = {
  async read(key) {
    try {
      return await readFile(path.join(DATA_DIR, key));
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  },
  async write(key, body) {
    const file = path.join(DATA_DIR, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, body);
    await rename(`${file}.tmp`, file);
  },
  async keys(folder) {
    try {
      return (await readdir(path.join(DATA_DIR, folder))).map((name) => `${folder}/${name}`);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  },
  async remove(key) {
    await rm(path.join(DATA_DIR, key), { force: true });
  },
};

const BLOB_ACCESS = process.env.BLOB_ACCESS === "public" ? "public" : "private";

const blobBackend: Backend = {
  async read(key) {
    // Items never change after they are written, but a removed draft must not come back
    // from the CDN, so reads go to origin storage.
    const result = await get(key, { access: BLOB_ACCESS, useCache: false });
    if (!result || result.statusCode !== 200) return undefined;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  },
  async write(key, body, contentType) {
    await put(key, body, { access: BLOB_ACCESS, contentType, addRandomSuffix: false, allowOverwrite: true });
  },
  async keys(folder) {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: `${folder}/`, cursor });
      keys.push(...page.blobs.map((b) => b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return keys;
  },
  async remove(key) {
    await del(key);
  },
};

export const STORAGE = process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "disk";
const backend = STORAGE === "blob" ? blobBackend : diskBackend;

function collection<T extends Item>(name: string) {
  const key = (id: string, extension: string) => `${name}/${id}.${extension}`;

  async function read(id: string): Promise<T | undefined> {
    if (!isStoreId(id)) return undefined;
    try {
      const json = await backend.read(key(id, "json"));
      return json && (JSON.parse(json.toString("utf8")) as T);
    } catch (error) {
      console.error(`[store] could not read ${name}/${id}`, error);
      return undefined;
    }
  }

  return {
    async save(item: T, imageJpeg: Buffer): Promise<void> {
      if (!isStoreId(item.id)) throw new Error("Invalid id.");
      await backend.write(key(item.id, "jpg"), imageJpeg, "image/jpeg");
      // JSON goes last, so a listed item always has its image.
      await backend.write(key(item.id, "json"), JSON.stringify(item), "application/json");
    },

    /** All items, oldest first. */
    async list(): Promise<T[]> {
      const ids = (await backend.keys(name))
        .map((k) => k.slice(name.length + 1))
        .filter((n) => n.endsWith(".json"))
        .map((n) => n.slice(0, -".json".length));
      const items = await Promise.all(ids.map(read));
      return items
        .filter((item): item is Awaited<T> => item !== undefined)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    get: read,

    async getImage(id: string): Promise<Buffer | undefined> {
      if (!isStoreId(id)) return undefined;
      return backend.read(key(id, "jpg"));
    },

    async remove(id: string): Promise<void> {
      if (!isStoreId(id)) return;
      // JSON first, so a half-removed item is never listed.
      await backend.remove(key(id, "json"));
      await backend.remove(key(id, "jpg"));
    },
  };
}

export const reports = collection<SavedReport>("reports");
export const drafts = collection<AnalysisDraft>("drafts");

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}
