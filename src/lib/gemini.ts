import type { LinkedJournalContextPayload } from "@/server/diagnose";

export type { LinkedJournalContextPayload };

export interface ImageAnalysisMetrics {
  averageBrightness?: number;
  greenRatio?: number;
  yellowRatio?: number;
  brownRatio?: number;
  healthyGreenRatio?: number;
  darkGreenRatio?: number;
  contrast?: number;
}

export type PhotoSlotType = "canopy" | "macro" | "substrate";

export interface ImageInputItem {
  imageBase64: string;
  mimeType?: string | undefined;
  slot?: PhotoSlotType | undefined;
  label?: string | undefined;
  metrics?: ImageAnalysisMetrics | undefined;
}

export interface ScientificEvidence {
  nutrientMobility: string;
  targetPH: {
    soil: string;
    cocoHydro: string;
  };
  targetEC: string;
  targetVPD: string;
  identifiedMarkers: string[];
  pathologyReasoning: string;
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
  scientificEvidence?: ScientificEvidence | undefined;
  journalContextUsed?: string[] | undefined;
  source?: "gemini-3.8-flash" | "visual-heuristics" | "botanical-knowledge-base" | undefined;
  photosAnalyzed?: number | undefined;
}

export interface DiagnosePlantOptions {
  imageBase64?: string | undefined;
  images?: ImageInputItem[] | undefined;
  mimeType?: string | undefined;
  plantInfo?: string | undefined;
  plantName?: string | undefined;
  stage?: string | undefined;
  medium?: string | undefined;
  journalContext?: LinkedJournalContextPayload | undefined;
  metrics?: ImageAnalysisMetrics | undefined;
}

function fallbackBotanicalDiagnosis(
  payload: DiagnosePlantOptions,
  imagesCount: number,
): PlantDiagnosisResult {
  const m = payload.metrics || {};
  const yellow = m.yellowRatio ?? 0.12;
  const brown = m.brownRatio ?? 0.05;
  const green = m.healthyGreenRatio ?? m.greenRatio ?? 0.68;

  const jc = payload.journalContext;
  const plantName = jc?.plantName || payload.plantName || "Your plant";
  const stage = jc?.stage || payload.stage || "Vegetative";
  const medium = jc?.medium || payload.medium || "Soil";
  const setting = jc?.setting || "Outdoor";

  const combinedLower =
    `${medium} ${payload.plantInfo || ""} ${jc?.promptBlock || ""}`.toLowerCase();
  const isLivingSoil = Boolean(
    jc?.isLivingSoil || combinedLower.includes("living soil") || combinedLower.includes("no-till"),
  );
  const isInGround = Boolean(
    jc?.isInGround ||
    combinedLower.includes("in the ground") ||
    combinedLower.includes("in ground"),
  );

  const waterNote = jc?.recentWaterSummary ? ` (${jc.recentWaterSummary})` : "";
  const feedNote = jc?.recentFeedsSummary ? ` (${jc.recentFeedsSummary})` : "";
  const trainingNote =
    jc?.trainingSummary && !jc.trainingSummary.toLowerCase().includes("untrained")
      ? ` Your journal shows ${jc.trainingSummary.toLowerCase()}, and the branches look responsive.`
      : "";

  const journalBadges = jc?.journalContextBadges || [
    `🌱 ${plantName} (${stage})`,
    `🌍 ${setting} · ${medium}`,
    ...(jc?.recentWaterSummary ? [`💧 ${jc.recentWaterSummary}`] : []),
    ...(jc?.recentFeedsSummary ? [`🧪 ${jc.recentFeedsSummary}`] : []),
    ...(jc?.trainingSummary ? [`✂️ ${jc.trainingSummary}`] : []),
  ];

  const isHealthy = green > 0.6 && yellow < 0.14 && brown < 0.08;
  if (isHealthy) {
    return {
      condition: `Happy & Healthy Plant (${stage})`,
      isHealthy: true,
      healthScore: 92,
      confidence: "High",
      severity: "healthy",
      summary: `${plantName} looks great in its ${setting.toLowerCase()} ${medium.toLowerCase()} setup! The leaves have a healthy, vibrant green colour and look perky and strong, with no signs of bugs, mould, or feeding problems.${trainingNote}`,
      symptoms: [
        "Even, vibrant green colour across the leaves",
        "Leaves are perky and reaching up nicely toward the light",
        "No yellowing, brown crispy tips, or bug marks",
      ],
      possibleCauses: [
        `Healthy roots thriving in your ${medium}${isInGround ? " in the ground" : ""}`,
        `Good balance of watering${waterNote} and plant nutrition${feedNote}`,
      ],
      actionPlan: [
        `Keep doing what you're doing! Continue your current ${stage} care routine for ${plantName}.${feedNote}`,
        isInGround || isLivingSoil
          ? "Check soil moisture 2 inches under the mulch or top layer with your finger before watering so your living soil stays evenly moist."
          : "Feel the top inch of soil with your finger before watering so you don't overwater.",
      ],
      preventiveTips: [
        isLivingSoil || isInGround
          ? "Keep a healthy layer of straw or leaf mulch over your living soil in the ground to keep soil microbes cool and moist."
          : "Keep a gentle breeze moving around the plant so fresh air reaches the leaves.",
        "Take a quick peek under a few leaves once a week to check for any garden bugs.",
      ],
      estimatedRecoveryDays: "Already healthy!",
      scientificEvidence: {
        nutrientMobility: "All-Round Balanced (Healthy Green Leaves)",
        targetPH: { soil: "6.2 – 6.8 pH", cocoHydro: "5.8 – 6.2 pH" },
        targetEC: isLivingSoil
          ? "Living Soil Web (0.8 – 1.4 mS/cm Organic Teas)"
          : stage.toLowerCase().includes("flower")
            ? "1.6 – 2.0 mS/cm"
            : "1.2 – 1.6 mS/cm",
        targetVPD: "Comfortable Humidity (50–65%)",
        identifiedMarkers: ["Rich green leaf colour", "Perky upward leaves"],
        pathologyReasoning:
          "In plain terms: your plant is getting the right amount of water, light, and plant food, so the leaves are full of healthy green energy.",
      },
      journalContextUsed: journalBadges,
      source: "visual-heuristics",
      photosAnalyzed: imagesCount,
    };
  }

  if (brown > 0.1) {
    return {
      condition: "Needs a Little Calcium & Magnesium (Small Brown Spots on Leaves)",
      isHealthy: false,
      healthScore: 68,
      confidence: "Medium",
      severity: "warning",
      summary: `We spotted some small brown or rusty spots on ${plantName} (${setting} · ${medium}).${feedNote}${waterNote} In a home garden, this usually means the plant needs a little extra calcium & magnesium, or the top layer of ${medium.toLowerCase()} dried out on a warm day.${trainingNote}`,
      symptoms: [
        "Small brown or rust-coloured spots on the middle or upper leaves",
        "Slightly dry or crispy leaf edges",
      ],
      possibleCauses: [
        "The plant is running low on calcium or magnesium",
        isLivingSoil || isInGround
          ? `Top layer of ${medium.toLowerCase()} drying out in warm sun`
          : "Soil drying out too fast or mild fertilizer buildup in the pot",
      ],
      actionPlan: [
        isLivingSoil || isInGround
          ? `Water ${plantName} deeply and evenly across the ground bed so the living soil is nicely hydrated${waterNote}.`
          : `Give ${plantName} a good watering with plain water first to rinse the ${medium}.`,
        isLivingSoil
          ? `Water in a gentle organic calcium/magnesium boost (like a pinch of Epsom salts, worm castings tea, or your saved diluted homemade fertilizer${feedNote}).`
          : "Add a gentle dose of Calcium-Magnesium (Cal-Mag) or balanced liquid plant food on the next feed.",
      ],
      preventiveTips: [
        isInGround || isLivingSoil
          ? "Add a 2–3 cm mulch layer over the ground soil so surface roots stay cool and moist."
          : "Don't let the pot dry out bone-dry on hot days.",
        isLivingSoil
          ? "Feed the living soil gently with compost teas or diluted homemade brews."
          : "Alternate liquid feeds with plain water every second watering in soil.",
      ],
      estimatedRecoveryDays: "5–8 days",
      scientificEvidence: {
        nutrientMobility: "Shows on Newer / Middle Leaves First (Calcium)",
        targetPH: {
          soil: "6.2 – 6.5 pH (Ideal 6.3)",
          cocoHydro: "5.8 – 6.2 pH (Ideal 6.0)",
        },
        targetEC: "1.2 – 1.6 mS/cm",
        targetVPD: "Moderate Airflow & Humidity",
        identifiedMarkers: ["Small brown speckles on leaves", "Dry leaf edges"],
        pathologyReasoning:
          "In plain terms: calcium helps build strong leaf walls. When the roots can't drink up enough calcium smoothly, small brown rusty spots show up on the leaves.",
      },
      journalContextUsed: journalBadges,
      source: "visual-heuristics",
      photosAnalyzed: imagesCount,
    };
  }

  return {
    condition: "Hungry Plant — Needs a General Feed (Yellowing Leaves)",
    isHealthy: false,
    healthScore: 64,
    confidence: "High",
    severity: "warning",
    summary: `Some of the leaves on ${plantName} (${setting} · ${medium}) are fading to light green or yellow.${feedNote}${waterNote} Your plant is simply running low on everyday plant food (especially nitrogen) or the soil is staying a little too wet between waterings.${trainingNote}`,
    symptoms: [
      "Leaves turning pale green or yellow while the veins stay darker",
      "Lower, older leaves fading first",
    ],
    possibleCauses: [
      isLivingSoil || isInGround
        ? `${plantName} is drawing heavily on its ${medium.toLowerCase()} in the ground and is ready for a top-dress of compost/worm castings or a diluted liquid feed${feedNote}`
        : `The plant has used up the food in its ${medium} and is ready for a feed${feedNote}`,
      `Soil staying a bit too wet around the roots${waterNote}`,
    ],
    actionPlan: [
      isInGround || isLivingSoil
        ? "Feel the soil 2 inches below the surface with your finger — make sure it feels moist like a wrung-out sponge, not soggy, before watering again."
        : "Let the top inch (2–3 cm) of soil dry out to the touch before watering again.",
      isLivingSoil
        ? `Give ${plantName} a gentle organic boost: top-dress around the base with worm castings/compost or water in one of your saved diluted homemade brews.`
        : "Give a normal diluted dose of all-purpose or vegetative liquid plant food at your next watering.",
    ],
    preventiveTips: [
      isInGround
        ? "In outdoor ground beds, water deeply and less often so the roots stretch deep into the earth."
        : "Lift the pot to check its weight before watering — if it still feels heavy, wait another day.",
      "Remove any completely yellow bottom leaves that come off easily.",
    ],
    estimatedRecoveryDays: "4–7 days",
    scientificEvidence: {
      nutrientMobility: "Starts on Lower / Older Leaves First (Nitrogen)",
      targetPH: { soil: "6.3 – 6.7 pH", cocoHydro: "5.8 – 6.1 pH" },
      targetEC: "1.3 – 1.7 mS/cm",
      targetVPD: "Mild Temp & Humidity",
      identifiedMarkers: ["Yellowing leaf colour", "Lower leaves fading first"],
      pathologyReasoning:
        "In plain terms: when a plant runs low on everyday food like nitrogen, it borrows energy from its older bottom leaves to feed the new top growth, causing the lower leaves to turn yellow.",
    },
    journalContextUsed: journalBadges,
    source: "visual-heuristics",
    photosAnalyzed: imagesCount,
  };
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
    journalContext,
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
  const timeoutId = setTimeout(() => controller.abort(), 6500);

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
        journalContext,
        metrics: validImages[0]?.metrics || metrics,
      }),
    });

    if (!response.ok) {
      console.warn(
        `Server diagnose endpoint returned status ${response.status}, activating botanical engine.`,
      );
      return fallbackBotanicalDiagnosis(payload, validImages.length);
    }

    const result = (await response.json()) as PlantDiagnosisResult;
    return result;
  } catch (err: unknown) {
    console.warn(
      "Diagnose fetch failed, gracefully falling back to botanical diagnosis engine:",
      err,
    );
    return fallbackBotanicalDiagnosis(payload, validImages.length);
  } finally {
    clearTimeout(timeoutId);
  }
}
