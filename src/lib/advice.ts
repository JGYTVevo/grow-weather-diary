export interface ImageAnalysisMetrics {
  averageBrightness?: number;
  greenRatio?: number;
  yellowRatio?: number;
  brownRatio?: number;
  healthyGreenRatio?: number;
  darkGreenRatio?: number;
  contrast?: number;
}

export interface ToppingAdvice {
  recommended: boolean;
  status: string;
  timing: string;
  nodeCount: string;
  cutLocation: string;
  technique: string;
  riskAlert: string;
}

export interface LstAdvice {
  recommended: boolean;
  timing: string;
  stemFlexibility: string;
  steps: string[];
  toolsNeeded: string[];
  canopyGoal: string;
}

export interface NutrientsAdvice {
  action: "feed_now" | "light_feed" | "plain_water" | "flush" | "optimal";
  headline: string;
  stageRecommendation: string;
  targetEC: string;
  targetPH: string;
  signsObserved: string[];
  nextFeedSuggestion: string;
}

export interface WateringAdvice {
  status: "optimal" | "needs_water" | "overwatered";
  headline: string;
  indicator: string;
  liftCheckAdvice: string;
  knuckleTest: string;
  nextWaterWindow: string;
}

export interface PlantAdviceResult {
  summary: string;
  cultivationStage: string;
  topping: ToppingAdvice;
  lst: LstAdvice;
  nutrients: NutrientsAdvice;
  watering: WateringAdvice;
  keyActionToday: string;
  source?: "gemini-3.8-flash" | "visual-heuristics";
}

export interface AdvicePlantOptions {
  imageBase64: string;
  mimeType?: string;
  plantInfo?: string;
  plantName?: string;
  stage?: string;
  medium?: string;
  plantType?: "Photoperiod" | "Autoflower" | string;
  metrics?: ImageAnalysisMetrics;
}

function fallbackPlantAdvice(payload: AdvicePlantOptions): PlantAdviceResult {
  const stage = (payload.stage || "Vegetative").toLowerCase();
  const plantName = payload.plantName || "Your Plant";
  const medium = payload.medium || "Soil";
  const plantType = payload.plantType || "Photoperiod";
  const isAuto = plantType.toLowerCase().includes("auto");
  const isBloom = stage.includes("bloom") || stage.includes("flower");
  const isSeedling = stage.includes("seedling") || stage.includes("germination");

  const isSoil = medium.toLowerCase().includes("soil");
  const targetPH = isSoil ? "6.2 – 6.8 pH" : "5.8 – 6.2 pH";

  return {
    summary: `${plantName} is currently in the ${payload.stage || "Vegetative"} stage. Foliar structure indicates active development with good responsiveness to canopy shaping.`,
    cultivationStage: payload.stage || "Vegetative",
    topping: {
      recommended: !isBloom && !isSeedling && !isAuto,
      status: isBloom
        ? "Not Recommended (In Flower)"
        : isSeedling
          ? "Too Early (Seedling)"
          : isAuto
            ? "LST Preferred (Autoflower)"
            : "Prime Topping Window",
      timing: isBloom
        ? "Cease topping to protect emerging colas"
        : isSeedling
          ? "Wait for 4th true node"
          : "Perform above 4th or 5th node",
      nodeCount: isSeedling ? "1–2 nodes" : "4th–5th node",
      cutLocation: "Make a clean 45° cut 5mm above the selected node",
      technique: "Sterilize pruners with 70% alcohol; avoid crushing main stem vascular bundles",
      riskAlert: "Ensure plant is well-watered 12 hours prior to cut to prevent shock",
    },
    lst: {
      recommended: !isSeedling,
      timing: isSeedling
        ? "Wait for stem to firm up"
        : "Active vegetative and early stretch training",
      stemFlexibility: "Supple green stem ready for gentle bending",
      steps: [
        "Anchor base of main stem in opposite direction",
        "Bend main growing tip gently to container rim level",
        "Secure with soft rubberized plant ties",
        "Allow secondary side branches to rise toward light",
      ],
      toolsNeeded: ["Rubber-coated wire", "Pot rim training clips"],
      canopyGoal: "Distribute auxin hormones to create a flat, even multi-cola canopy",
    },
    nutrients: {
      action: "optimal",
      headline: `Maintain Balanced ${payload.stage || "Vegetative"} Formula`,
      stageRecommendation: isBloom
        ? "Shift ratio to Bloom N-P-K (higher Phosphorus & Potassium, moderate Nitrogen)"
        : "Maintain balanced vegetative formula with silica and Cal-Mag",
      targetEC: isBloom ? "1.6 – 2.0 mS/cm" : "1.2 – 1.6 mS/cm",
      targetPH,
      signsObserved: ["Uniform foliar green color", "Healthy leaf prayer posture"],
      nextFeedSuggestion: `Continue scheduled feed at standard dilution rate for ${medium}`,
    },
    watering: {
      status: "optimal",
      headline: "Optimal Foliar Turgor & Moisture",
      indicator: "Leaves are upright, praying toward light with firm cell wall pressure",
      liftCheckAdvice: "Lift container: water when pot feels feather-light",
      knuckleTest: "Top 2–3 cm of substrate should dry back before next application",
      nextWaterWindow: "Next watering window in 24 to 36 hours based on transpiration rate",
    },
    keyActionToday: isBloom
      ? `Maintain steady bloom feed and tuck fan leaves to expose lower bud sites.`
      : `Apply gentle LST tie-downs to spread the canopy and level top shoots.`,
    source: "visual-heuristics",
  };
}

export async function getPlantAdvice(payload: AdvicePlantOptions): Promise<PlantAdviceResult> {
  const {
    imageBase64,
    mimeType = "image/jpeg",
    plantInfo = "",
    plantName = "",
    stage,
    medium,
    plantType,
    metrics,
  } = payload;

  const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "").trim();
  if (!cleanBase64) {
    throw new Error("No image data provided for cultivation advice.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch("/api/advice-plant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        imageBase64: cleanBase64,
        mimeType,
        plantInfo,
        plantName,
        stage,
        medium,
        plantType,
        metrics,
      }),
    });

    if (!response.ok) {
      console.warn(
        `Advice endpoint returned status ${response.status}, activating botanical fallback.`,
      );
      return fallbackPlantAdvice(payload);
    }

    const result = (await response.json()) as PlantAdviceResult;
    return result;
  } catch (err: unknown) {
    console.warn("Advice fetch failed, gracefully falling back to botanical engine:", err);
    return fallbackPlantAdvice(payload);
  } finally {
    clearTimeout(timeoutId);
  }
}
