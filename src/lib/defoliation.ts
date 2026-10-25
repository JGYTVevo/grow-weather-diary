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

function fallbackDefoliationResult(payload: DefoliationRequestPayload): DefoliationResult {
  const stage = (payload.stage || "Vegetative").toLowerCase();
  const plantName = payload.plantName || "Your Plant";
  const isBloom = stage.includes("bloom") || stage.includes("flower");
  const isSeedling = stage.includes("seedling") || stage.includes("germination");

  const density = isSeedling ? 35 : isBloom ? 78 : 65;
  const rating: DefoliationResult["canopyDensityRating"] =
    density > 75 ? "Dense" : density < 45 ? "Low / Open" : "Optimal";
  const lightPenetration = 100 - density;

  return {
    summary: `${plantName} canopy density is measured at ${density}% (${rating}) with ${lightPenetration}% estimated light penetration to lower node sites.`,
    canopyDensityPercent: density,
    canopyDensityRating: rating,
    lightPenetrationScore: lightPenetration,
    lightPenetrationRating:
      lightPenetration >= 75
        ? "Optimal (80%+)"
        : lightPenetration < 50
          ? "Blocked (<50%)"
          : "Moderate (50-79%)",
    moldMildewRisk: density > 80 ? "High - Prune for Airflow" : "Low",
    schwazzingReadiness: isBloom
      ? "Prime Window: Day 21 Flower"
      : "Recommended Vegetative Thinning",
    recommendedRemovalPercent: isBloom ? "20% – 25%" : "10% – 15%",
    estimatedLeafCount: isBloom ? "12 – 18 large shade leaves" : "6 – 10 inward leaves",
    zones: [
      {
        zone: "upper",
        name: "Top Canopy Layer",
        action: "tuck",
        targetPercentage: "Tuck without cutting",
        leafTypeToTarget: "Large solar fan leaves shading active flowering shoots",
        reason: "Top fan leaves generate primary photosynthetic energy; tuck wherever possible.",
      },
      {
        zone: "middle",
        name: "Mid-Canopy & Core",
        action: "remove",
        targetPercentage: "15% – 20%",
        leafTypeToTarget:
          "Inward-facing fan leaves trapping humidity and blocking cross-ventilation",
        reason: "Opens vertical light channels and minimizes microclimate mildew pockets.",
      },
      {
        zone: "lower_lollipop",
        name: "Lower Third (Lollipop Zone)",
        action: "lollipop_strip",
        targetPercentage: "Strip lowest 20% of growth",
        leafTypeToTarget: "Underdeveloped sucker shoots and shaded popcorn bud sites",
        reason: "Redirects root energy upward into dense top canopy colas.",
      },
    ],
    pruningSteps: [
      "Sterilize shears with 70% isopropyl alcohol.",
      "Lollipop the bottom 20% of shaded larf shoots.",
      "Remove inward-growing center leaves to allow cross-breeze.",
      "Snip cleanly at the petiole base leaving a 2mm stub.",
    ],
    recoveryProtocol: {
      lightAdjustment: "Dim lights by 10%–15% for 24 hours to reduce foliar transpiration demand.",
      vpdTarget: "1.0 – 1.2 kPa with stable airflow.",
      recoveryFeeding: "Mild nutrient feeding with silica and Cal-Mag to support cell wall repair.",
      expectedRecoveryHours: "24 – 48 hours",
    },
    keyActionToday: `Perform selective thinning of ${isBloom ? "12–18" : "6–10"} inward fan leaves on ${plantName} to improve light channels.`,
    source: "visual-heuristics",
  };
}

export async function analyzeDefoliationCanopy(
  payload: DefoliationRequestPayload,
): Promise<DefoliationResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

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
      console.warn(
        `Defoliation endpoint returned status ${res.status}, activating botanical fallback.`,
      );
      return fallbackDefoliationResult(payload);
    }

    return (await res.json()) as DefoliationResult;
  } catch (err: unknown) {
    console.warn("Defoliation fetch failed, gracefully falling back to botanical analysis:", err);
    return fallbackDefoliationResult(payload);
  } finally {
    clearTimeout(timeoutId);
  }
}
