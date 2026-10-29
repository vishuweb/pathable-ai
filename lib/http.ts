export function jsonResponse<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

export type JsonBody =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: string };

/**
 * Reads and parses a JSON request body, refusing anything over maxBytes before it is fully
 * buffered. Next.js route handlers apply no body size limit of their own.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBody> {
  const bytes = await readBody(request, maxBytes);
  if (!bytes.ok) return bytes;
  if (!bytes.value.length) return { ok: false, status: 400, error: "The request body must be JSON." };
  try {
    return { ok: true, value: JSON.parse(Buffer.from(bytes.value).toString("utf8")) };
  } catch {
    return { ok: false, status: 400, error: "The request body must be valid JSON." };
  }
}

/** Reads a raw request body, refusing anything over maxBytes before it is fully buffered. */
export async function readBody(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; value: Uint8Array<ArrayBuffer> } | { ok: false; status: 413; error: string }> {
  const tooLarge = {
    ok: false,
    status: 413,
    error: `The request is larger than ${Math.floor(maxBytes / (1024 * 1024))} MB.`,
  } as const;
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return tooLarge;
  if (!request.body) return { ok: true, value: new Uint8Array() };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return tooLarge;
    }
    chunks.push(value);
  }
  return { ok: true, value: new Uint8Array(Buffer.concat(chunks)) };
}
