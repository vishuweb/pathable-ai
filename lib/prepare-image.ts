export interface PreparedImage {
  dataUrl: string;
  width: number;
  height: number;
}

const MAX_DIMENSION = 1600;

/**
 * Re-encodes a photo in the browser before upload: applies EXIF rotation, downsizes it, and drops
 * all metadata (including GPS) so the models and SAM masks share one coordinate space.
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This image format could not be read. Please use a JPEG, PNG, or WebP photo.");
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process this image.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return { dataUrl: canvas.toDataURL("image/jpeg", 0.88), width, height };
}
