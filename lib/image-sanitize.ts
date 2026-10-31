import "server-only";
import sharp from "sharp";

export class ImageError extends Error {}

/** The largest picture, in pixels, that will be decoded; protects the server from decompression bombs. */
const MAX_INPUT_PIXELS = 40_000_000;

export interface CleanImage {
  jpeg: Buffer;
  width: number;
  height: number;
}

/**
 * Decodes an uploaded picture and writes a fresh JPEG: every piece of metadata (GPS position, camera,
 * owner name, comments, thumbnails, colour profile) is dropped, and any embedded orientation is applied
 * to the pixels. Never trusts the browser to have done this, because anyone can call the API directly.
 */
export async function cleanImage(jpeg: Buffer): Promise<CleanImage> {
  try {
    const { data, info } = await sharp(jpeg, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .jpeg({ quality: 88 })
      .toBuffer({ resolveWithObject: true });
    return { jpeg: data, width: info.width, height: info.height };
  } catch {
    throw new ImageError("The photo could not be read as an image.");
  }
}

/** The bytes of a validated JPEG data URL. */
export function dataUrlBytes(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}
