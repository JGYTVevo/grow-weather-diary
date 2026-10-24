export interface TrichomeMetrics {
  averageBrightness?: number;
  whiteRatio?: number;
  amberRatio?: number;
  clearRatio?: number;
  contrast?: number;
}

export interface TrichomeResult {
  summary: string;
  clearPercent: number;
  cloudyPercent: number;
  amberPercent: number;
  pistilBrowningPercent: number;
  harvestWindowStatus:
    | "Too Early (14+ Days)"
    | "Approaching Window (7–10 Days)"
    | "Peak THC Potency Window (Harvest in 0–4 Days)"
    | "Sedative / Heavy Body Effect Window (Harvest Now)"
    | "Past Peak / Overripe";
  estimatedDaysToHarvest: string;
  effectProfile: {
    headline: string;
    psychoactiveVibe: string;
    couchLockLevel: "Low" | "Moderate" | "Heavy";
    terpeneVigor: "Rising" | "Peak" | "Degrading";
  };
  flushRecommendation: {
    status: "Continue Feeding" | "Begin Plain Water Flush" | "Flush In Progress" | "Ready for Chop";
    waterType: string;
    advice: string;
  };
  dryingPrep: string;
  keyActionToday: string;
  source?: "gemini-3.8-flash" | "visual-heuristics";
}

export interface TrichomeRequestPayload {
  imageBase64: string;
  mimeType?: string;
  plantName?: string;
  stage?: string;
  strain?: string;
  flowerWeek?: string;
  medium?: string;
  metrics?: TrichomeMetrics;
}

export async function scanTrichomeRipeness(
  payload: TrichomeRequestPayload,
): Promise<TrichomeResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch("/api/trichome-scan", {
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

    return (await res.json()) as TrichomeResult;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Trichome scan timed out. Please try again with a clear macro photo.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
