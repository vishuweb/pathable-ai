// Validates image data URLs sent by the browser before they are forwarded to the Meta Model API.

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;
const DATA_URL_RE = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)$/;

export function validateImageDataUrl(value: unknown): string | { error: string } {
  if (typeof value !== "string") return { error: "Missing image." };
  const match = DATA_URL_RE.exec(value);
  if (!match) return { error: "Image must be a base64 data URL." };
  if (!ALLOWED_MIME.includes(match[1])) return { error: "Use a JPEG, PNG, or WebP image." };
  if ((match[2].length * 3) / 4 > MAX_BYTES) return { error: "Image is larger than 8 MB." };
  return value;
}
