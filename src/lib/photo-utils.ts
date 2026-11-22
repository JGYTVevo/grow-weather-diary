/**
 * Resilient, high-performance photo compression and management utility for Canopy.
 * Guarantees that camera and gallery photos are safely resized, converted to lightweight
 * JPEG data URLs (~25KB-45KB), and never hang promises even on iOS HEIC or memory-constrained devices.
 */

export interface CompressOptions {
  maxDimension?: number;
  quality?: number;
  timeoutMs?: number;
  maxBase64Length?: number;
}

/**
 * Returns a human-readable file size string (e.g. "32 KB", "1.2 MB")
 */
export function formatDataUrlSize(dataUrl?: string | null): string {
  if (!dataUrl) return "0 KB";
  const stringLength = dataUrl.length - (dataUrl.indexOf(",") + 1);
  const sizeInBytes = Math.ceil((stringLength * 3) / 4);
  if (sizeInBytes < 1024) return `${sizeInBytes} B`;
  if (sizeInBytes < 1024 * 1024) return `${Math.round(sizeInBytes / 1024)} KB`;
  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reads a File or Blob into a base64 data URL using FileReader.
 */
function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("FileReader result is not a string"));
      }
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses an image (File, Blob, or existing dataUrl) down to safe dimensions (default: 512px)
 * and JPEG quality 0.6, with an automatic second pass if the output exceeds maxBase64Length (~65KB).
 *
 * Guaranteed safe:
 * - Has explicit timeout (default: 6000ms) so promises never hang indefinitely
 * - Handles both img.onload and img.onerror
 * - Cleans up object URLs to prevent memory leaks
 * - Gracefully falls back to raw data URL if canvas rendering fails
 */
export async function compressImage(
  input: File | Blob | string,
  options: CompressOptions = {},
): Promise<string> {
  const { maxDimension = 512, quality = 0.6, timeoutMs = 6000, maxBase64Length = 85000 } = options;

  let initialDataUrl = "";
  let objectUrlToRevoke: string | null = null;
  let imageSource = "";

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return "";
    // Already compact data URL or external URL: return immediately
    if (!trimmed.startsWith("data:image/") || trimmed.length <= 45000) {
      return trimmed;
    }
    imageSource = trimmed;
    initialDataUrl = trimmed;
  } else {
    try {
      if (typeof window !== "undefined" && window.URL && window.URL.createObjectURL) {
        objectUrlToRevoke = window.URL.createObjectURL(input);
        imageSource = objectUrlToRevoke;
      } else {
        initialDataUrl = await readFileAsDataUrl(input);
        imageSource = initialDataUrl;
      }
    } catch {
      try {
        initialDataUrl = await readFileAsDataUrl(input);
        imageSource = initialDataUrl;
      } catch {
        return "";
      }
    }
  }

  return new Promise<string>((resolve) => {
    let settled = false;

    const cleanup = () => {
      if (objectUrlToRevoke) {
        try {
          window.URL.revokeObjectURL(objectUrlToRevoke);
        } catch {
          // ignore
        }
      }
    };

    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      clearTimeout(timer);
      resolve(result);
    };

    // Safety timeout: if decoding/rendering hangs, fallback to whatever data we have
    const timer = setTimeout(async () => {
      if (settled) return;
      console.warn("Image compression timed out; applying fallback data URL");
      if (initialDataUrl) {
        finish(initialDataUrl);
      } else if (typeof input !== "string") {
        try {
          const fallback = await readFileAsDataUrl(input);
          finish(fallback);
        } catch {
          finish("");
        }
      } else {
        finish(input);
      }
    }, timeoutMs);

    // If running in an environment without DOM/Image (e.g. Node test environment without full canvas)
    if (typeof Image === "undefined" || typeof document === "undefined") {
      if (initialDataUrl) {
        finish(initialDataUrl);
      } else if (typeof input !== "string") {
        readFileAsDataUrl(input)
          .then(finish)
          .catch(() => finish(""));
      } else {
        finish(input);
      }
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const srcW = img.width || img.naturalWidth || maxDimension;
        const srcH = img.height || img.naturalHeight || maxDimension;

        const renderAt = (targetMaxDim: number, targetQuality: number): string | null => {
          let width = srcW;
          let height = srcH;
          if (width > targetMaxDim || height > targetMaxDim) {
            if (width > height) {
              height = Math.round((height * targetMaxDim) / width);
              width = targetMaxDim;
            } else {
              width = Math.round((width * targetMaxDim) / height);
              height = targetMaxDim;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);

          const ctx = canvas.getContext("2d");
          if (!ctx) return null;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const out = canvas.toDataURL("image/jpeg", targetQuality);
          return out && out.startsWith("data:image/") ? out : null;
        };

        let compressed = renderAt(maxDimension, quality);
        if (!compressed) {
          if (initialDataUrl) {
            finish(initialDataUrl);
          } else if (typeof input !== "string") {
            readFileAsDataUrl(input)
              .then(finish)
              .catch(() => finish(""));
          } else {
            finish(input);
          }
          return;
        }

        // Second adaptive pass if the base64 payload is still larger than maxBase64Length
        if (compressed.length > maxBase64Length) {
          const smallerDim = Math.min(384, Math.max(240, Math.round(maxDimension * 0.72)));
          const secondPass = renderAt(smallerDim, Math.min(0.52, quality * 0.82));
          if (secondPass && secondPass.length < compressed.length) {
            compressed = secondPass;
          }
        }

        // Third ultra-compact pass if still exceeding 120KB (e.g. high-frequency foliage detail)
        if (compressed.length > 120000) {
          const thirdPass = renderAt(300, 0.45);
          if (thirdPass && thirdPass.length < compressed.length) {
            compressed = thirdPass;
          }
        }

        finish(compressed);
      } catch (err) {
        console.warn("Canvas compression failed; falling back to source data:", err);
        if (initialDataUrl) {
          finish(initialDataUrl);
        } else if (typeof input !== "string") {
          readFileAsDataUrl(input)
            .then(finish)
            .catch(() => finish(""));
        } else {
          finish(input);
        }
      }
    };

    img.onerror = async () => {
      console.warn("Image element encountered decoding error; falling back to FileReader");
      try {
        if (initialDataUrl) {
          finish(initialDataUrl);
        } else if (typeof input !== "string") {
          const fallback = await readFileAsDataUrl(input);
          finish(fallback);
        } else {
          finish(input);
        }
      } catch {
        finish("");
      }
    };

    img.src = imageSource;
  });
}
