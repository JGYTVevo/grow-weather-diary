export interface CanopyMetrics {
  averageBrightness?: number;
  greenRatio?: number;
  yellowRatio?: number;
  brownRatio?: number;
  healthyGreenRatio?: number;
  darkGreenRatio?: number;
  canopyCoverageEstimate?: number;
}

export interface PruningZoneGuidance {
  zone: "upper" | "middle" | "lower_lollipop";
  name: string;
  action: "remove" | "tuck" | "leave" | "lollipop_strip";
  targetPercentage: string;
  leafTypeToTarget: string;
  reason: string;
}

export interface DefoliationResult {
  summary: string;
  canopyDensityPercent: number;
  canopyDensityRating: "Low / Open" | "Optimal" | "Dense" | "Severely Overcrowded";
  lightPenetrationScore: number;
  lightPenetrationRating: "Optimal (80%+)" | "Moderate (50-79%)" | "Blocked (<50%)";
  moldMildewRisk: "Low" | "Moderate" | "High - Prune for Airflow";
  schwazzingReadiness:
    | "Prime Window: Day 1 Flower"
    | "Prime Window: Day 21 Flower"
    | "Recommended Vegetative Thinning"
    | "Light Touch Only (Autoflower)"
    | "Not Recommended Now (Too Early / Late)";
  recommendedRemovalPercent: string;
  estimatedLeafCount: string;
  zones: PruningZoneGuidance[];
  pruningSteps: string[];
  recoveryProtocol: {
    lightAdjustment: string;
    vpdTarget: string;
    recoveryFeeding: string;
    expectedRecoveryHours: string;
  };
  keyActionToday: string;
  source?: "gemini-3.8-flash" | "visual-heuristics";
}

export interface DefoliationRequestPayload {
  imageBase64: string;
  mimeType?: string;
  plantName?: string;
  stage?: string;
  medium?: string;
  plantType?: "Photoperiod" | "Autoflower" | string;
  growerNotes?: string;
  metrics?: CanopyMetrics;
}

export async function analyzeDefoliationCanopy(
  payload: DefoliationRequestPayload,
): Promise<DefoliationResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch("/api/defoliation-analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Server responded with HTTP ${res.status}`);
    }

    return (await res.json()) as DefoliationResult;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Defoliation scan timed out. Please try again with a clear photo.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
