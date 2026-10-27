/** Pure sizing maths: scale (never enlarge) so the longest side is at most `max`. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const ACCEPTED = /^image\/(jpeg|png|webp)$/;
const EXT: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg" };

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/**
 * Shrinks and re-encodes a photo in the browser before upload.
 * - Longest side <= maxDimension, WebP (JPEG fallback where the browser cannot encode WebP).
 * - Re-encoding drops EXIF metadata (including GPS location) from the file that gets uploaded.
 * - If anything fails, the original file is returned unchanged; the server-side size/type limits still apply.
 */
export async function optimizeImage(file: File, maxDimension: number, quality = 0.82): Promise<File> {
  if (!ACCEPTED.test(file.type)) throw new Error("unsupported_image");
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDimension);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    let blob = await toBlob(canvas, "image/webp", quality);
    if (!blob || blob.type !== "image/webp") {           // Safari etc. cannot encode WebP: fall back to JPEG on white
      ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
      blob = await toBlob(canvas, "image/jpeg", quality);
    }
    if (!blob) return file;
    const sameSize = width === bitmap.width && height === bitmap.height;
    if (sameSize && blob.size >= file.size && !/^image\/png$/.test(file.type)) return file; // already small; keep the original
    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${base}.${EXT[blob.type] ?? "jpg"}`, { type: blob.type });
  } catch {
    return file;
  }
}
