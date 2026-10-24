export interface ImageAnalysisMetrics {
  averageBrightness?: number;
  greenRatio?: number;
  yellowRatio?: number;
  brownRatio?: number;
  healthyGreenRatio?: number;
  darkGreenRatio?: number;
  contrast?: number;
}

export type PhotoSlotType = "canopy" | "macro" | "substrate" | "general";

export interface ImageInputItem {
  imageBase64: string;
  mimeType?: string;
  slot?: PhotoSlotType;
  label?: string;
  metrics?: ImageAnalysisMetrics;
}

export interface PlantDiagnosisResult {
  condition: string;
  isHealthy: boolean;
  healthScore: number;
  confidence: "High" | "Medium" | "Low";
  severity: "healthy" | "mild" | "warning" | "critical";
  summary: string;
  symptoms: string[];
  possibleCauses: string[];
  actionPlan: string[];
  preventiveTips: string[];
  estimatedRecoveryDays: string;
  source?: "gemini-3.8-flash" | "visual-heuristics";
  photosAnalyzed?: number;
}

export interface DiagnosePlantOptions {
  imageBase64?: string;
  images?: ImageInputItem[];
  mimeType?: string;
  plantInfo?: string;
  plantName?: string;
  stage?: string;
  medium?: string;
  metrics?: ImageAnalysisMetrics;
}

export async function diagnosePlantPhoto(
  payload: DiagnosePlantOptions,
): Promise<PlantDiagnosisResult> {
  const {
    imageBase64,
    images,
    mimeType = "image/jpeg",
    plantInfo = "",
    plantName = "",
    stage,
    medium,
    metrics,
  } = payload;

  const validImages: ImageInputItem[] = [];
  if (images && images.length > 0) {
    for (const img of images) {
      if (img.imageBase64) {
        validImages.push({
          ...img,
          imageBase64: img.imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "").trim(),
          mimeType: img.mimeType || "image/jpeg",
        });
      }
    }
  } else if (imageBase64) {
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "").trim();
    if (cleanBase64) {
      validImages.push({
        imageBase64: cleanBase64,
        mimeType,
        slot: "canopy",
        label: "Primary Plant Photo",
        metrics,
      });
    }
  }

  if (validImages.length === 0) {
    throw new Error("No image data provided for diagnosis.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch("/api/diagnose-plant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        images: validImages,
        imageBase64: validImages[0]?.imageBase64,
        mimeType,
        plantInfo,
        plantName,
        stage,
        medium,
        metrics: validImages[0]?.metrics || metrics,
      }),
    });

    if (!response.ok) {
      let errorDetail = `Diagnosis request failed with status ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson?.error) {
          errorDetail = errJson.error;
        }
      } catch {
        // Use status
      }
      throw new Error(errorDetail);
    }

    const result = (await response.json()) as PlantDiagnosisResult;
    return result;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Diagnosis took longer than 5 seconds. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
