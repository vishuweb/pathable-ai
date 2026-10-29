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
  const tooLarge = {
    ok: false,
    status: 413,
    error: `The request is larger than ${Math.floor(maxBytes / (1024 * 1024))} MB.`,
  } as const;
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return tooLarge;
  if (!request.body) return { ok: false, status: 400, error: "The request body must be JSON." };

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

  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, status: 400, error: "The request body must be valid JSON." };
  }
}
