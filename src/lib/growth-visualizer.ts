import type { PlantJournalSummary } from "@/lib/journal-context";

export type GrowthVisualStage = "Seedling" | "Vegetative" | "Flowering";

export interface FertilizerScheduleEntry {
  id: string;
  name: string;
  fertilizerType: string;
  form: "Raw" | "Diluted";
  dilutionRatio?: string;
  ingredients?: string;
  stages: GrowthVisualStage[];
  frequency: string;
  startWeek: number;
  endWeek: number;
}

export interface GrowthSceneAnalysis {
  anchorX: number; // 0.15 - 0.85 normalized X on uploaded photo
  anchorY: number; // 0.50 - 0.90 normalized Y (soil / pot base)
  scaleFactor: number; // 0.7 - 1.3
  lightDirection: "left" | "center" | "right";
  ambientWarmth: "warm-sun" | "cool-daylight" | "indoor-led" | "greenhouse";
  environmentSummary: string;
}

export interface StrainVisualProfile {
  growthHabit: "bushy-indica" | "tall-sativa" | "balanced-hybrid" | "compact-auto";
  leafHue: "emerald" | "deep-forest" | "lime-vibrant" | "purple-flushed";
  budAccent: "frosty-green" | "purple-violet" | "amber-orange" | "pink-pistil";
  trichomeFrost: number; // 0.5 - 1.0
  estimatedTotalDays: number;
  seedlingEndDay: number;
  vegEndDay: number;
  expectedHeightCm: number;
  expectedCanopyWidthCm: number;
  expectedYieldNote: string;
}

export interface StagePreviewPlan {
  stage: GrowthVisualStage;
  dayRange: string;
  representativeDay: number;
  headline: string;
  visualDetails: string;
  heightCm: number;
  canopyWidthCm: number;
  leafNodes: number;
  activeFertilizers: string[];
  activeTraining: string[];
  careTip: string;
}

export interface DailyGrowthPoint {
  day: number;
  week: number;
  stage: GrowthVisualStage;
  stageProgress: number; // 0..1 within stage
  overallProgress: number; // 0..1 across full cycle
  heightCm: number;
  canopyWidthCm: number;
  nodes: number;
  budDensity: number; // 0..1
  activeFertilizers: string[];
  trainingApplied: string[];
  milestone?: string;
}

export interface GrowthVisualizationRequest {
  growAreaPhotoBase64?: string;
  growAreaMimeType?: string;
  plantPhotoBase64?: string;
  plantPhotoMimeType?: string;
  plantName: string;
  strain: string;
  plantType: "Photoperiod" | "Autoflower";
  setting: "Indoor" | "Outdoor" | "Greenhouse";
  medium: string;
  soilComposition: string;
  trainingMethods: string[];
  fertilizerSchedule: FertilizerScheduleEntry[];
  totalDays: number;
  notes?: string;
  journalContext?: PlantJournalSummary;
}

export interface GrowthVisualizationPlan {
  planTitle: string;
  growSummary: string;
  sceneAnalysis: GrowthSceneAnalysis;
  strainProfile: StrainVisualProfile;
  stages: StagePreviewPlan[];
  keyMilestones: Array<{ day: number; label: string }>;
  source: "gemini-4-hydrogen" | "horticultural-simulator";
}

/**
 * Generates a complete day-by-day biological growth timeline (Day 1 -> totalDays)
 * incorporating strain genetics, soil composition, training methods, and fertilizer schedule.
 */
export function buildDailyGrowthTimeline(
  plan: GrowthVisualizationPlan,
  trainingMethods: string[],
  fertilizerSchedule: FertilizerScheduleEntry[],
): DailyGrowthPoint[] {
  const totalDays = Math.max(
    42,
    Math.min(140, Math.round(plan.strainProfile.estimatedTotalDays || 84)),
  );
  const seedlingEnd = Math.max(
    10,
    Math.min(24, Math.round(plan.strainProfile.seedlingEndDay || 16)),
  );
  const vegEnd = Math.max(
    seedlingEnd + 14,
    Math.min(
      totalDays - 21,
      Math.round(plan.strainProfile.vegEndDay || Math.round(totalDays * 0.52)),
    ),
  );
  const maxHeight = Math.max(30, plan.strainProfile.expectedHeightCm || 110);
  const maxWidth = Math.max(25, plan.strainProfile.expectedCanopyWidthCm || 75);

  const hasLST = trainingMethods.some((t) => /lst|scrog|low.?stress/i.test(t));
  const hasTopping = trainingMethods.some((t) => /top|fim/i.test(t));
  const hasDefol = trainingMethods.some((t) => /defol|lollipop/i.test(t));

  const milestoneMap = new Map<number, string>();
  for (const m of plan.keyMilestones || []) {
    if (m.day >= 1 && m.day <= totalDays && m.label) {
      milestoneMap.set(Math.round(m.day), m.label);
    }
  }

  // Ensure essential default milestones exist if not already set
  if (!milestoneMap.has(1)) milestoneMap.set(1, "Sprout emerges from soil");
  if (!milestoneMap.has(seedlingEnd))
    milestoneMap.set(seedlingEnd, "Seedling established · Entering Veg");
  if (hasTopping && !milestoneMap.has(seedlingEnd + 7)) {
    milestoneMap.set(seedlingEnd + 7, "Main stem topped for dual colas");
  }
  if (hasLST && !milestoneMap.has(seedlingEnd + 11)) {
    milestoneMap.set(seedlingEnd + 11, "LST branches tied outward");
  }
  if (!milestoneMap.has(vegEnd + 1)) {
    milestoneMap.set(vegEnd + 1, "Flowering transition & stretch begins");
  }
  if (hasDefol && !milestoneMap.has(vegEnd + 18)) {
    milestoneMap.set(vegEnd + 18, "Canopy defoliation for bud airflow");
  }
  if (!milestoneMap.has(totalDays)) {
    milestoneMap.set(totalDays, "Peak ripeness · Harvest window");
  }

  const points: DailyGrowthPoint[] = [];

  for (let day = 1; day <= totalDays; day++) {
    const week = Math.floor((day - 1) / 7) + 1;
    let stage: GrowthVisualStage = "Flowering";
    let stageProgress = 0;

    if (day <= seedlingEnd) {
      stage = "Seedling";
      stageProgress = (day - 1) / Math.max(1, seedlingEnd - 1);
    } else if (day <= vegEnd) {
      stage = "Vegetative";
      stageProgress = (day - seedlingEnd) / Math.max(1, vegEnd - seedlingEnd);
    } else {
      stage = "Flowering";
      stageProgress = (day - vegEnd) / Math.max(1, totalDays - vegEnd);
    }

    const overallProgress = (day - 1) / Math.max(1, totalDays - 1);

    // S-curve height model with flowering stretch in early bloom
    let heightRatio = 0.04;
    let widthRatio = 0.04;
    let nodes = 1;
    let budDensity = 0;

    if (stage === "Seedling") {
      heightRatio = 0.03 + stageProgress * 0.11;
      widthRatio = 0.03 + stageProgress * 0.12;
      nodes = Math.max(1, Math.round(1 + stageProgress * 3));
      budDensity = 0;
    } else if (stage === "Vegetative") {
      const eased = Math.pow(stageProgress, 1.15);
      heightRatio = 0.14 + eased * (hasLST ? 0.42 : 0.48);
      widthRatio = 0.15 + eased * (hasLST || hasTopping ? 0.65 : 0.52);
      nodes = Math.round(4 + eased * 8);
      budDensity = stageProgress > 0.88 ? 0.05 : 0;
    } else {
      // Early flower stretch (first 40% of flower), then bud stacking & bulking
      const stretchPhase = Math.min(1, stageProgress / 0.4);
      const stretchCurve = 1 - Math.pow(1 - stretchPhase, 2);
      const vegEndHeight = hasLST ? 0.56 : 0.62;
      const vegEndWidth = hasLST || hasTopping ? 0.8 : 0.67;
      heightRatio = vegEndHeight + stretchCurve * (1 - vegEndHeight);
      widthRatio = vegEndWidth + stretchCurve * (1 - vegEndWidth);
      nodes = Math.round(12 + stretchCurve * 6);
      budDensity = Math.min(1, Math.pow(stageProgress, 0.85));
    }

    const activeFertilizers = fertilizerSchedule
      .filter((f) => f.stages.includes(stage) || (week >= f.startWeek && week <= f.endWeek))
      .map((f) => f.name);

    const trainingApplied = trainingMethods.filter((method) => {
      const lower = method.toLowerCase();
      if (lower.includes("untrained") || lower.includes("natural")) return false;
      if (stage === "Seedling") return false;
      if (lower.includes("lollipop") || lower.includes("defol")) {
        return day >= vegEnd - 4;
      }
      if (lower.includes("scrog")) {
        return day >= seedlingEnd + 10;
      }
      return day >= seedlingEnd + 5;
    });

    points.push({
      day,
      week,
      stage,
      stageProgress: +stageProgress.toFixed(3),
      overallProgress: +overallProgress.toFixed(3),
      heightCm: Math.max(2, Math.round(maxHeight * heightRatio)),
      canopyWidthCm: Math.max(3, Math.round(maxWidth * widthRatio)),
      nodes,
      budDensity: +budDensity.toFixed(3),
      activeFertilizers,
      trainingApplied,
      milestone: milestoneMap.get(day),
    });
  }

  return points;
}

export async function generateGrowthVisualizationPlan(
  payload: GrowthVisualizationRequest,
): Promise<GrowthVisualizationPlan> {
  const response = await fetch("/api/growth-visualize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || `Growth Visualizer request failed (HTTP ${response.status})`);
  }

  return (await response.json()) as GrowthVisualizationPlan;
}
