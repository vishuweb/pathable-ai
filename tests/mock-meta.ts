// A local stand-in for the Meta Model API, so tests exercise the real client code without network
// calls or cost. Point META_API_BASE_URL at `url` before importing the app's modules.
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The parser's encoder is internal to the package, but tests need it to build realistic SAM output.
const codec: {
  encodeSegmentationMask(mask: Uint8Array, width: number, height: number): { payload: string };
} = await import(pathToFileURL(path.resolve("node_modules/@meta-sam/parser/dist/mask-codec.js")).href);

export type SamReply =
  | { kind: "objects"; boxes: [number, number, number, number][] }
  /** Boxes as fractions (0-1) of the uploaded image, whose size is read from the JPEG itself. */
  | { kind: "relative"; boxes: [number, number, number, number][] }
  | { kind: "incomplete" }
  | { kind: "reset" };

export type ChatReply = { kind: "content"; content: string } | { kind: "status"; status: number };

export type TranscribeReply = { kind: "json"; body: unknown } | { kind: "status"; status: number };

/** Replies for the OpenStreetMap services (Nominatim search and lookup, and the main API). */
export type OsmReply = { kind: "json"; body: unknown } | { kind: "status"; status: number };

export interface Captured {
  path: string;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

/** One SAM wire record: a solid mask filling the box. */
function samRecord(id: number, [left, top, right, bottom]: [number, number, number, number], width: number, height: number) {
  const w = right - left;
  const h = bottom - top;
  const mask = codec.encodeSegmentationMask(new Uint8Array(w * h).fill(1), w, h);
  return `${id}<|box;x1=${left};y1=${top};x2=${right - 1};y2=${bottom - 1};w=${width};h=${height};c=0.9|><|mask;x=0;y=0;data=${h},${w},${mask.payload}|>`;
}

export async function startMockMeta(imageSize: { width: number; height: number } = { width: 400, height: 300 }) {
  const replies = {
    chat: { kind: "content", content: "{}" } as ChatReply,
    sam: new Map<string, SamReply>(),
    transcribe: { kind: "json", body: { transcript: "", audioDurationMs: 0 } } as TranscribeReply,
    placeSearch: { kind: "json", body: [] } as OsmReply,
    placeLookup: { kind: "json", body: [] } as OsmReply,
    osmElement: { kind: "status", status: 404 } as OsmReply,
  };
  const requests: Captured[] = [];

  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    const url = req.url ?? "";
    requests.push({ path: url, headers: req.headers, body });

    if (url.endsWith("/chat/completions")) {
      const reply = replies.chat;
      if (reply.kind === "status") {
        res.writeHead(reply.status, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "mock error" } }));
      }
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(
        JSON.stringify({
          id: "chatcmpl_mock",
          object: "chat.completion",
          created: 0,
          model: "mock",
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: reply.content } }],
        }),
      );
    }

    if (url.endsWith("/responses")) {
      const content = JSON.parse(body.toString()).input?.[0]?.content ?? [];
      const phrase: string = content[0]?.text ?? "";
      const reply = replies.sam.get(phrase) ?? { kind: "objects", boxes: [] };
      if (reply.kind === "reset") return req.socket.destroy();
      const size = jpegSize(content[1]?.image_url) ?? imageSize;
      const boxes: [number, number, number, number][] =
        reply.kind === "relative"
          ? reply.boxes.map(([l, t, r, b]) => [
              Math.round(l * size.width),
              Math.round(t * size.height),
              Math.round(r * size.width),
              Math.round(b * size.height),
            ])
          : reply.kind === "objects"
            ? reply.boxes
            : [];
      const lane = { item_id: "msg_1", output_index: 0, content_index: 0 };
      const send = (event: Record<string, unknown>) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      const text = boxes.length
        ? `<0f>${boxes.map((b, i) => samRecord(i, b, size.width, size.height)).join(",")}\n`
        : "";
      res.writeHead(200, { "content-type": "text/event-stream" });
      send({ type: "response.created", response: { id: "resp_mock", status: "in_progress" } });
      send({ type: "response.output_text.delta", ...lane, delta: text });
      send({ type: "response.content_part.done", ...lane, part: { type: "output_text", text } });
      send(
        reply.kind === "incomplete"
          ? { type: "response.incomplete", response: { id: "resp_mock", status: "incomplete", incomplete_details: { reason: "max_output_tokens" } } }
          : { type: "response.completed", response: { id: "resp_mock", status: "completed" } },
      );
      return res.end();
    }

    const osm = url.startsWith("/search?")
      ? replies.placeSearch
      : url.startsWith("/lookup?")
        ? replies.placeLookup
        : url.startsWith("/api/0.6/")
          ? replies.osmElement
          : undefined;
    if (osm) {
      res.writeHead(osm.kind === "status" ? osm.status : 200, { "content-type": "application/json" });
      return res.end(JSON.stringify(osm.kind === "json" ? osm.body : { error: "mock" }));
    }

    if (url.startsWith("/v1/asr/transcribe")) {
      const reply = replies.transcribe;
      res.writeHead(reply.kind === "status" ? reply.status : 200, { "content-type": "application/json" });
      return res.end(JSON.stringify(reply.kind === "json" ? reply.body : { error: { message: "mock error" } }));
    }

    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}/v1`,
    /** Base URLs for NOMINATIM_URL and OSM_API_URL. */
    nominatimUrl: `http://127.0.0.1:${port}`,
    osmApiUrl: `http://127.0.0.1:${port}/api/0.6`,
    replies,
    requests,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

/** Width and height from a JPEG data URL's frame header, or undefined if it has none. */
function jpegSize(dataUrl: unknown): { width: number; height: number } | undefined {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/jpeg;base64,")) return undefined;
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  for (let i = 2; i + 9 < bytes.length; ) {
    if (bytes[i] !== 0xff) return undefined;
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    }
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  return undefined;
}
