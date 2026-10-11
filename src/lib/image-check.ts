"use client";

// Quick in-browser checks before spending an AI call: too dark or too blurry.
// Also shrinks the photo so uploads stay small and cheap.

const MAX_SIDE = 1280;

export type PreparedImage = { base64: string; mediaType: "image/jpeg"; problem: string | null; preview: string };

const PREVIEW_SIDE = 480;

export async function prepareImage(source: CanvasImageSource, width: number, height: number): Promise<PreparedImage> {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);

  const problem = checkQuality(ctx, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

  // A small copy for the result screen, so a full-size photo isn't kept in memory
  const ps = Math.min(1, PREVIEW_SIDE / Math.max(w, h));
  const small = document.createElement("canvas");
  small.width = Math.round(w * ps);
  small.height = Math.round(h * ps);
  small.getContext("2d")!.drawImage(canvas, 0, 0, small.width, small.height);
  const preview = small.toDataURL("image/jpeg", 0.7);

  // Release canvas memory now instead of waiting for garbage collection (matters on iPhones)
  canvas.width = canvas.height = 0;
  small.width = small.height = 0;
  return { base64: dataUrl.split(",")[1], mediaType: "image/jpeg", problem, preview };
}

export async function prepareFile(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    return await prepareImage(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

function checkQuality(ctx: CanvasRenderingContext2D, w: number, h: number): string | null {
  // Sample a downscaled grayscale copy
  const sw = 160;
  const sh = Math.max(1, Math.round((h / w) * sw));
  const small = document.createElement("canvas");
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(ctx.canvas, 0, 0, sw, sh);
  const { data } = sctx.getImageData(0, 0, sw, sh);

  const gray = new Float32Array(sw * sh);
  let sum = 0;
  for (let i = 0; i < gray.length; i++) {
    const g = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    gray[i] = g;
    sum += g;
  }
  const brightness = sum / gray.length;
  if (brightness < 22) return "Too dark. Try near a window or turn on a light.";

  // Variance of a Laplacian filter: low variance means few sharp edges, so likely blurry
  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const i = y * sw + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - sw] - gray[i + sw];
      lapSum += lap;
      lapSq += lap * lap;
      n++;
    }
  }
  const variance = lapSq / n - (lapSum / n) ** 2;
  // Only block extreme blur; the AI handles normal phone photos fine
  if (variance < 4) return "Looks very blurry. Hold steady and tap to focus.";
  return null;
}
