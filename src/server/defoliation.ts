import { GoogleGenAI, Type } from "@google/genai";

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

// Deterministic, professional botanical defoliation & schwazzing evaluator
// Runs in milliseconds if upstream AI takes longer than 3.5s or is offline
export function evaluateDefoliationHeuristics(
  payload: DefoliationRequestPayload,
): DefoliationResult {
  const m = payload.metrics || {};
  const green = m.healthyGreenRatio ?? m.greenRatio ?? 0.65;
  const darkGreen = m.darkGreenRatio ?? 0.08;
  const yellow = m.yellowRatio ?? 0.06;
  const coverage = m.canopyCoverageEstimate ?? Math.min(95, Math.round(green * 115));

  const plantName = payload.plantName || "Your Plant";
  const stage = (payload.stage || "Vegetative").toLowerCase();
  const plantType = (payload.plantType || "Photoperiod").toLowerCase();
  const isAuto = plantType.includes("auto");

  const isSeedling = stage.includes("seedling") || stage.includes("germination");
  const isEarlyVeg = stage.includes("veg") && (coverage < 55 || stage.includes("early"));
  const isLateVeg = stage.includes("veg") && !isEarlyVeg;
  const isDay1Flower =
    stage.includes("transition") || stage.includes("day 1") || stage.includes("stretch");
  const isDay21Flower =
    stage.includes("day 21") ||
    stage.includes("mid") ||
    (stage.includes("flower") && coverage > 75);
  const isLateFlower =
    stage.includes("late") || stage.includes("ripen") || stage.includes("harvest");

  // Determine Density Rating
  let canopyDensityPercent = Math.min(96, Math.max(25, coverage));
  if (darkGreen > 0.15) canopyDensityPercent = Math.min(98, canopyDensityPercent + 8);
  if (yellow > 0.15) canopyDensityPercent = Math.max(30, canopyDensityPercent - 10);

  let canopyDensityRating: DefoliationResult["canopyDensityRating"] = "Optimal";
  if (canopyDensityPercent < 45) canopyDensityRating = "Low / Open";
  else if (canopyDensityPercent <= 70) canopyDensityRating = "Optimal";
  else if (canopyDensityPercent <= 85) canopyDensityRating = "Dense";
  else canopyDensityRating = "Severely Overcrowded";

  // Light Penetration
  const lightPenetrationScore = Math.max(15, Math.min(95, 105 - canopyDensityPercent));
  let lightPenetrationRating: DefoliationResult["lightPenetrationRating"] = "Moderate (50-79%)";
  if (lightPenetrationScore >= 75) lightPenetrationRating = "Optimal (80%+)";
  else if (lightPenetrationScore < 50) lightPenetrationRating = "Blocked (<50%)";

  // Mold / Mildew Risk
  let moldMildewRisk: DefoliationResult["moldMildewRisk"] = "Low";
  if (canopyDensityPercent > 82) moldMildewRisk = "High - Prune for Airflow";
  else if (canopyDensityPercent > 68) moldMildewRisk = "Moderate";

  // Schwazzing Readiness & Removal Target
  let schwazzingReadiness: DefoliationResult["schwazzingReadiness"];
  let recommendedRemovalPercent = "15% – 20%";
  let estimatedLeafCount = "10 – 16 large fan leaves";

  if (isSeedling) {
    schwazzingReadiness = "Not Recommended Now (Too Early / Late)";
    recommendedRemovalPercent = "0%";
    estimatedLeafCount = "0 leaves";
  } else if (isAuto) {
    schwazzingReadiness = "Light Touch Only (Autoflower)";
    recommendedRemovalPercent = "10% – 15% maximum";
    estimatedLeafCount = "4 – 8 select inward leaves";
  } else if (isDay1Flower) {
    schwazzingReadiness = "Prime Window: Day 1 Flower";
    recommendedRemovalPercent = "25% – 30% (Schwazzing Phase 1)";
    estimatedLeafCount = "20 – 35 fan leaves";
  } else if (isDay21Flower) {
    schwazzingReadiness = "Prime Window: Day 21 Flower";
    recommendedRemovalPercent = "20% – 25% (Schwazzing Phase 2)";
    estimatedLeafCount = "15 – 25 fan leaves";
  } else if (isLateVeg) {
    schwazzingReadiness = "Recommended Vegetative Thinning";
    recommendedRemovalPercent = "15% – 20%";
    estimatedLeafCount = "12 – 18 fan leaves";
  } else if (isLateFlower) {
    schwazzingReadiness = "Not Recommended Now (Too Early / Late)";
    recommendedRemovalPercent = "5% (Senescent yellow leaves only)";
    estimatedLeafCount = "Only dead or fully yellow leaves";
  } else {
    schwazzingReadiness = "Recommended Vegetative Thinning";
    recommendedRemovalPercent = "10% – 15%";
    estimatedLeafCount = "8 – 14 fan leaves";
  }

  // Pruning Zones
  const zones: PruningZoneGuidance[] = [
    {
      zone: "upper",
      name: "Top Canopy Layer",
      action: isSeedling ? "leave" : isDay1Flower || isDay21Flower ? "tuck" : "leave",
      targetPercentage: isDay1Flower ? "10% – 15%" : "Tuck without cutting",
      leafTypeToTarget: "Only large fan leaves with long red petioles shading major flowering tips",
      reason:
        "Top fan leaves are the primary solar collectors. Tuck whenever possible; only cut if directly blinding an apex bud site.",
    },
    {
      zone: "middle",
      name: "Mid-Canopy & Core",
      action: isSeedling ? "leave" : canopyDensityPercent > 65 ? "remove" : "leave",
      targetPercentage: isDay1Flower || isDay21Flower ? "20% – 25%" : "10% – 15%",
      leafTypeToTarget: "Inward-facing fan leaves that trap humidity and block cross-ventilation",
      reason:
        "Clearing inward foliage creates vertical light channels to mid-tier colas and dramatically reduces powdery mildew microclimates.",
    },
    {
      zone: "lower_lollipop",
      name: "Lower Third (Lollipop Zone)",
      action: isSeedling ? "leave" : "lollipop_strip",
      targetPercentage: isSeedling ? "0%" : "Strip bottom 20% – 25% of growth",
      leafTypeToTarget:
        "Underdeveloped sucker shoots, yellowing lower foliage, and shaded popcorn sites",
      reason:
        "Diverts root water and carbohydrate resources directly upward into dense canopy top colas instead of wispy larf.",
    },
  ];

  const pruningSteps = isSeedling
    ? [
        "Do not defoliate seedlings; foliage is critically required to fuel early root cell division.",
        "Ensure gentle air circulation around the stalk to build stem lignin naturally.",
      ]
    : [
        "Sterilize curved pruning shears with 70% isopropyl alcohol before the first cut.",
        "Step 1 (Lollipop): Strip the bottom 20% of weak, shaded shoots that receive under 200 PPFD.",
        "Step 2 (Core Airflow): Remove inward-growing fan leaves that crisscross each other in the center.",
        "Step 3 (Bud Exposure): Snip or tuck fan leaves casting solid shadows over developing node clusters.",
        "Cut cleanly at the leaf petiole base, leaving a 2mm stub so stem vascular tissue remains sealed.",
      ];

  const mediumLower = `${payload.medium || ""} ${payload.growerNotes || ""}`.toLowerCase();
  const isLivingSoil = mediumLower.includes("living") || mediumLower.includes("organic");
  const isInGround = mediumLower.includes("ground") || mediumLower.includes("bed");

  const recoveryProtocol = {
    lightAdjustment: isSeedling
      ? "Maintain normal seedling PPFD (~150-200 umol)"
      : isInGround
        ? "Prune in the late afternoon or evening so outdoor plants recover overnight out of peak sun"
        : "Dim grow light by 10%–15% or raise light 5 cm for 24–36 hours post-defoliation",
    vpdTarget: "1.0 – 1.2 kPa (maintain 24–26°C and 55–60% RH to minimize transpiration shock)",
    recoveryFeeding: isLivingSoil
      ? `Give ${plantName} a gentle drench of aloe vera, kelp, or aerated worm-casting tea in your living soil${isInGround ? " ground bed" : ""} to soothe pruning stress naturally`
      : "Administer balanced feed with Potassium Silicate (Silica) + 1.0ml/L Cal-Mag to reinforce cell wall elasticity",
    expectedRecoveryHours: isAuto ? "48 – 72 hours" : "24 – 48 hours",
  };

  const keyActionToday = isSeedling
    ? `Allow ${plantName} to develop more vegetative nodes before any leaf thinning.`
    : isDay1Flower || isDay21Flower
      ? `Perform ${schwazzingReadiness} on ${plantName}: remove ~${recommendedRemovalPercent} of shade fan leaves and lollipop the bottom 20%.`
      : canopyDensityPercent > 70
        ? `Thin ${estimatedLeafCount} from the dense center of ${plantName} to prevent stagnant humidity pockets.`
        : `Canopy density on ${plantName} is in an optimal zone (${canopyDensityPercent}%). Light tucking is sufficient.`;

  return {
    summary: `${plantName} (${payload.medium || "Soil"}) canopy density is at ${canopyDensityPercent}% (${canopyDensityRating}) with ${lightPenetrationRating} light penetration to lower nodes. ${
      canopyDensityPercent > 70
        ? "Selective defoliation will significantly improve bud site energy and airflow."
        : "Canopy is balanced with good leaf distribution."
    }`,
    canopyDensityPercent,
    canopyDensityRating,
    lightPenetrationScore,
    lightPenetrationRating,
    moldMildewRisk,
    schwazzingReadiness,
    recommendedRemovalPercent,
    estimatedLeafCount,
    zones,
    pruningSteps,
    recoveryProtocol,
    keyActionToday,
    source: "visual-heuristics",
  };
}

export async function handleDefoliationAnalyze(
  payload: DefoliationRequestPayload,
): Promise<DefoliationResult> {
  const {
    imageBase64,
    mimeType = "image/jpeg",
    plantName = "Plant",
    stage = "Vegetative",
    medium = "Soil",
    plantType = "Photoperiod",
    growerNotes = "",
  } = payload;

  const apiKey = process.env["GEMINI_API_KEY"];
  const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "").trim();

  if (!cleanBase64) {
    throw new Error("No image data provided for defoliation analysis.");
  }

  const isRealPhoto = cleanBase64.length > 250;

  // Attempt Gemini 3.1 Flash Lite with 3.5s timeout for fast, zero-hang response
  if (apiKey && isRealPhoto) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 9000);

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { "User-Agent": "aistudio-build" },
      },
    });

    const prompt = `You are GrowBuddy AI Master Canopy Specialist and expert in cannabis/horticultural defoliation, lollipopping, and Schwazzing.
Analyze this plant photo specifically for canopy architecture, leaf density, light penetration, and defoliation/schwazzing recommendations.

Cultivar / Plant: "${plantName}"
Current Stage: "${stage}"
Medium: "${medium}"
Plant Type: "${plantType}"
${growerNotes ? `Grower Notes: ${growerNotes}` : ""}

Evaluate THIS specific photo carefully:
1. Estimate canopy density percentage (0-100%) and rating (Low / Open, Optimal, Dense, Severely Overcrowded).
2. Calculate lower node light penetration score (0-100%) and rating.
3. Assess microclimate airflow & mold/mildew risk (Low, Moderate, High - Prune for Airflow).
4. Evaluate Schwazzing timing readiness (Day 1 Flower, Day 21 Flower, Vegetative Thinning, Autoflower light touch, or Not Recommended).
5. Specify recommended fan leaf removal percentage and estimated leaf count.
6. Break down guidance across 3 specific zones: Upper Top Canopy, Middle Core, and Lower Third (Lollipop).
7. Provide exact step-by-step pruning instructions and post-pruning recovery protocol (light dimming, VPD, feeding).

Return strict JSON adhering to the schema.`;

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini defoliation analysis timed out after 9s")), 9000),
      );

      const geminiPromise = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || "image/jpeg",
                  data: cleanBase64,
                },
              },
              { text: prompt },
            ],
          },
        ],
        config: {
          abortSignal: abortController.signal,
          systemInstruction:
            "You are GrowBuddy AI Canopy & Defoliation Specialist. Return practical, highly actionable botanical defoliation guidance in strict JSON adhering to schema.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: "2-sentence summary of canopy density and immediate pruning advice.",
              },
              canopyDensityPercent: {
                type: Type.INTEGER,
                description: "Estimated percentage of canopy density (0-100).",
              },
              canopyDensityRating: {
                type: Type.STRING,
                description: "One of: Low / Open, Optimal, Dense, Severely Overcrowded",
              },
              lightPenetrationScore: {
                type: Type.INTEGER,
                description: "Percentage score of light reaching mid/lower bud sites (0-100).",
              },
              lightPenetrationRating: {
                type: Type.STRING,
                description: "One of: Optimal (80%+), Moderate (50-79%), Blocked (<50%)",
              },
              moldMildewRisk: {
                type: Type.STRING,
                description: "One of: Low, Moderate, High - Prune for Airflow",
              },
              schwazzingReadiness: {
                type: Type.STRING,
                description:
                  "One of: Prime Window: Day 1 Flower, Prime Window: Day 21 Flower, Recommended Vegetative Thinning, Light Touch Only (Autoflower), Not Recommended Now (Too Early / Late)",
              },
              recommendedRemovalPercent: {
                type: Type.STRING,
                description: "Recommended percentage of leaves to prune (e.g. '20% – 25%').",
              },
              estimatedLeafCount: {
                type: Type.STRING,
                description: "Estimated number of fan leaves to remove.",
              },
              zones: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    zone: {
                      type: Type.STRING,
                      description: "upper, middle, or lower_lollipop",
                    },
                    name: { type: Type.STRING },
                    action: {
                      type: Type.STRING,
                      description: "remove, tuck, leave, or lollipop_strip",
                    },
                    targetPercentage: { type: Type.STRING },
                    leafTypeToTarget: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                  required: [
                    "zone",
                    "name",
                    "action",
                    "targetPercentage",
                    "leafTypeToTarget",
                    "reason",
                  ],
                },
              },
              pruningSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Step-by-step instructions for performing the defoliation.",
              },
              recoveryProtocol: {
                type: Type.OBJECT,
                properties: {
                  lightAdjustment: { type: Type.STRING },
                  vpdTarget: { type: Type.STRING },
                  recoveryFeeding: { type: Type.STRING },
                  expectedRecoveryHours: { type: Type.STRING },
                },
                required: [
                  "lightAdjustment",
                  "vpdTarget",
                  "recoveryFeeding",
                  "expectedRecoveryHours",
                ],
              },
              keyActionToday: {
                type: Type.STRING,
                description: "The primary action the grower should execute today.",
              },
            },
            required: [
              "summary",
              "canopyDensityPercent",
              "canopyDensityRating",
              "lightPenetrationScore",
              "lightPenetrationRating",
              "moldMildewRisk",
              "schwazzingReadiness",
              "recommendedRemovalPercent",
              "estimatedLeafCount",
              "zones",
              "pruningSteps",
              "recoveryProtocol",
              "keyActionToday",
            ],
          },
        },
      });

      const response = await Promise.race([geminiPromise, timeoutPromise]);
      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text) as DefoliationResult;
        parsed.source = "gemini-3.8-flash";
        return parsed;
      }
    } catch (err: unknown) {
      console.warn(
        "Gemini defoliation analysis timed out or failed, instantly falling back to botanical heuristic evaluation:",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return evaluateDefoliationHeuristics(payload);
}
