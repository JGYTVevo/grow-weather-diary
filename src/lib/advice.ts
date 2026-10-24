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
  const timeoutId = setTimeout(() => controller.abort(), 5000);

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
      let errorDetail = `Plant advice request failed with status ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson?.error) {
          errorDetail = errJson.error;
        }
      } catch {
        // Fallback to errorDetail
      }
      throw new Error(errorDetail);
    }

    const result = (await response.json()) as PlantAdviceResult;
    return result;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Advice analysis took longer than 5 seconds. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
