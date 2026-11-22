import { GoogleGenAI, Type } from "@google/genai";
import type {
  GrowthVisualizationRequest,
  GrowthVisualizationPlan,
  GrowthSceneAnalysis,
  StrainVisualProfile,
  StagePreviewPlan,
} from "../lib/growth-visualizer";

function inferStrainVisualProfile(payload: GrowthVisualizationRequest): StrainVisualProfile {
  const strainLower = `${payload.strain || ""} ${payload.plantName || ""}`.toLowerCase();
  const mediumLower = `${payload.medium || ""} ${payload.soilComposition || ""}`.toLowerCase();
  const isAuto = payload.plantType === "Autoflower" || strainLower.includes("auto");
  const isInGround = mediumLower.includes("ground") || mediumLower.includes("garden bed");
  const isLivingSoil = mediumLower.includes("living") || mediumLower.includes("compost");
  const hasTraining = payload.trainingMethods.some((m) => !/untrained|natural/i.test(m));
  const hasLSTOrScrog = payload.trainingMethods.some((m) => /lst|scrog|top|fim/i.test(m));

  let growthHabit: StrainVisualProfile["growthHabit"] = "balanced-hybrid";
  if (isAuto) {
    growthHabit = "compact-auto";
  } else if (/sativa|haze|trainwreck|durban|thai|amnesia|jack/i.test(strainLower)) {
    growthHabit = "tall-sativa";
  } else if (/indica|kush|northern|afghan|bubba|granddaddy|purple punch/i.test(strainLower)) {
    growthHabit = "bushy-indica";
  }

  let leafHue: StrainVisualProfile["leafHue"] = "emerald";
  let budAccent: StrainVisualProfile["budAccent"] = "frosty-green";
  if (/purple|grape|berry|blueberry|granddaddy|violet|black|gdp/i.test(strainLower)) {
    leafHue = "purple-flushed";
    budAccent = "purple-violet";
  } else if (/orange|tangie|citrus|mango|peach|amber|skunk/i.test(strainLower)) {
    leafHue = "emerald";
    budAccent = "amber-orange";
  } else if (/pink|rose|strawberry|cherry/i.test(strainLower)) {
    leafHue = "emerald";
    budAccent = "pink-pistil";
  } else if (/kush|northern|afghan/i.test(strainLower)) {
    leafHue = "deep-forest";
    budAccent = "frosty-green";
  } else if (isLivingSoil) {
    leafHue = "emerald";
    budAccent = "amber-orange";
  }

  const totalDays = Math.max(
    49,
    Math.min(140, Math.round(payload.totalDays || (isAuto ? 77 : 105))),
  );
  const seedlingEndDay = isAuto ? 14 : 18;
  const vegEndDay = isAuto
    ? Math.min(totalDays - 28, 35)
    : Math.min(totalDays - 35, Math.round(totalDays * 0.5));

  let baseHeight = isAuto
    ? 78
    : growthHabit === "tall-sativa"
      ? 165
      : growthHabit === "bushy-indica"
        ? 105
        : 130;
  if (isInGround) baseHeight = Math.round(baseHeight * 1.2);
  if (payload.setting === "Indoor") baseHeight = Math.round(baseHeight * 0.82);
  if (hasLSTOrScrog) baseHeight = Math.round(baseHeight * 0.78);

  let baseWidth = Math.round(baseHeight * (hasLSTOrScrog ? 0.88 : hasTraining ? 0.76 : 0.62));
  baseWidth = Math.max(35, Math.min(180, baseWidth));

  const fertBoost =
    payload.fertilizerSchedule.length > 0
      ? "boosted by your scheduled feeds"
      : "fed naturally by your base medium";
  const expectedYieldNote = isInGround
    ? `Deep in-ground root run + ${isLivingSoil ? "living soil web" : "rich soil"} (${fertBoost}) supports vigorous multi-branch stacking.`
    : `${payload.setting} ${payload.medium} container grow (${fertBoost}) with balanced flower density.`;

  return {
    growthHabit,
    leafHue,
    budAccent,
    trichomeFrost: 0.82,
    estimatedTotalDays: totalDays,
    seedlingEndDay,
    vegEndDay,
    expectedHeightCm: baseHeight,
    expectedCanopyWidthCm: baseWidth,
    expectedYieldNote,
  };
}

function buildFallbackPlan(payload: GrowthVisualizationRequest): GrowthVisualizationPlan {
  const profile = inferStrainVisualProfile(payload);
  const plantLabel = payload.plantName?.trim() || payload.strain?.trim() || "Your Plant";
  const strainLabel = payload.strain?.trim() || "Hybrid Cultivar";
  const soilLabel = payload.soilComposition?.trim() || payload.medium || "Living Soil";
  const activeTrainingList = payload.trainingMethods.filter((m) => !/untrained|natural/i.test(m));
  const trainingText =
    activeTrainingList.length > 0
      ? activeTrainingList.join(", ")
      : "Natural untrained Christmas-tree canopy";

  const fertsByStage = (stage: "Seedling" | "Vegetative" | "Flowering") =>
    payload.fertilizerSchedule
      .filter((f) => f.stages.includes(stage))
      .map((f) => `${f.name} (${f.frequency})`);

  const seedlingFerts = fertsByStage("Seedling");
  const vegFerts = fertsByStage("Vegetative");
  const flowerFerts = fertsByStage("Flowering");

  const sceneAnalysis: GrowthSceneAnalysis = {
    anchorX: 0.5,
    anchorY: 0.76,
    scaleFactor: 1.0,
    lightDirection: payload.setting === "Indoor" ? "center" : "right",
    ambientWarmth:
      payload.setting === "Indoor"
        ? "indoor-led"
        : payload.setting === "Greenhouse"
          ? "greenhouse"
          : "warm-sun",
    environmentSummary: `${payload.setting} grow area using ${payload.medium} (${soilLabel}). Plant positioned in the center root zone with ${
      payload.setting === "Indoor" ? "overhead full-spectrum light" : "natural daylight"
    }.`,
  };

  const stages: StagePreviewPlan[] = [
    {
      stage: "Seedling",
      dayRange: `Days 1–${profile.seedlingEndDay}`,
      representativeDay: Math.max(8, Math.round(profile.seedlingEndDay * 0.75)),
      headline: `Compact young ${strainLabel} establishing roots in ${payload.medium}`,
      visualDetails: `Round cotyledons open first, followed by 2–3 pairs of bright serrated true leaves. Gentle root expansion into your soil mix (${soilLabel.slice(0, 90)}) keeps the stem sturdy and upright.`,
      heightCm: Math.max(8, Math.round(profile.expectedHeightCm * 0.13)),
      canopyWidthCm: Math.max(9, Math.round(profile.expectedCanopyWidthCm * 0.14)),
      leafNodes: 3,
      activeFertilizers:
        seedlingFerts.length > 0 ? seedlingFerts : ["Plain water / gentle soil microbes only"],
      activeTraining: ["No training yet — letting main stem thicken"],
      careTip:
        "Keep the topsoil lightly damp (never soggy) and avoid heavy full-strength feeds until 3–4 true nodes appear.",
    },
    {
      stage: "Vegetative",
      dayRange: `Days ${profile.seedlingEndDay + 1}–${profile.vegEndDay}`,
      representativeDay: Math.round(
        profile.seedlingEndDay + (profile.vegEndDay - profile.seedlingEndDay) * 0.78,
      ),
      headline:
        activeTrainingList.length > 0
          ? `Wide, bushy trained canopy shaped by ${activeTrainingList.slice(0, 2).join(" & ")}`
          : `Vigorous leafy structure with thick branching`,
      visualDetails: `Rapid foliage expansion fueled by ${
        vegFerts.length > 0 ? vegFerts.join(", ") : `your ${payload.medium} nutrient web`
      }. ${
        activeTrainingList.length > 0
          ? `Your ${trainingText} opens the middle of the plant so lower side branches catch even light and build multiple main tops.`
          : `Natural central stem dominance forms a lush tiered canopy with large 5- and 7-finger fan leaves.`
      }`,
      heightCm: Math.round(profile.expectedHeightCm * 0.58),
      canopyWidthCm: Math.round(profile.expectedCanopyWidthCm * 0.78),
      leafNodes: 10,
      activeFertilizers: vegFerts.length > 0 ? vegFerts : [`Base ${payload.medium} nutrition`],
      activeTraining: activeTrainingList.length > 0 ? activeTrainingList : ["Natural growth habit"],
      careTip:
        activeTrainingList.length > 0
          ? `Space out ${activeTrainingList[0]} adjustments by 3–4 days so branches recover and turn cleanly toward the light.`
          : "Tuck large shaded fan leaves gently underneath side shoots to boost lateral growth.",
    },
    {
      stage: "Flowering",
      dayRange: `Days ${profile.vegEndDay + 1}–${profile.estimatedTotalDays}`,
      representativeDay: Math.max(profile.vegEndDay + 14, profile.estimatedTotalDays - 6),
      headline: `Heavy, resin-frosted ${strainLabel} colas stacking to harvest`,
      visualDetails: `After the early bloom stretch, white pistils cluster into dense stacked colas${
        profile.budAccent === "purple-violet"
          ? " with rich purple-violet hues across the upper calyxes and sugar leaves"
          : profile.budAccent === "amber-orange"
            ? " laced with bright fiery orange pistils and shimmering trichomes"
            : " coated in frosty white resin glands"
      }. ${
        flowerFerts.length > 0
          ? `Bloom feeds (${flowerFerts.join(", ")}) drive late-stage calyx swell and terpene richness.`
          : `Your ${payload.medium} carries the plant cleanly into a natural late-flower fade.`
      }`,
      heightCm: profile.expectedHeightCm,
      canopyWidthCm: profile.expectedCanopyWidthCm,
      leafNodes: 16,
      activeFertilizers:
        flowerFerts.length > 0 ? flowerFerts : ["Plain water & living-soil bloom microbes"],
      activeTraining:
        activeTrainingList.length > 0
          ? activeTrainingList.map((t) => `${t} canopy structure`)
          : ["Natural central main cola"],
      careTip:
        "Support heavy flower tops with stakes or ties, keep airflow brisk around dense buds, and check trichomes with the Trichome Scanner before harvest.",
    },
  ];

  const keyMilestones: Array<{ day: number; label: string }> = [
    { day: 1, label: `Seedling sprouts in ${payload.medium}` },
    { day: 7, label: "First serrated true leaves open" },
    { day: profile.seedlingEndDay, label: "Vegetative growth kicks off" },
  ];

  if (activeTrainingList.length > 0) {
    keyMilestones.push({
      day: Math.min(profile.vegEndDay - 4, profile.seedlingEndDay + 8),
      label: `Training started: ${activeTrainingList.slice(0, 2).join(" + ")}`,
    });
  }
  if (vegFerts.length > 0) {
    keyMilestones.push({
      day: Math.min(profile.vegEndDay - 2, profile.seedlingEndDay + 12),
      label: `Veg feed boost: ${payload.fertilizerSchedule.find((f) => f.stages.includes("Vegetative"))?.name || "Nutrients"}`,
    });
  }
  keyMilestones.push({
    day: profile.vegEndDay + 1,
    label: "Flowering transition & canopy stretch",
  });
  if (flowerFerts.length > 0) {
    keyMilestones.push({
      day: Math.min(profile.estimatedTotalDays - 14, profile.vegEndDay + 14),
      label: `Bloom feed: ${payload.fertilizerSchedule.find((f) => f.stages.includes("Flowering"))?.name || "Bloom brew"}`,
    });
  }
  keyMilestones.push({
    day: Math.max(profile.vegEndDay + 18, profile.estimatedTotalDays - 14),
    label: "Heavy bud swell & trichome frost",
  });
  keyMilestones.push({
    day: profile.estimatedTotalDays,
    label: "Ripe & ready for harvest window",
  });

  return {
    planTitle: `${plantLabel} (${strainLabel}) — ${profile.estimatedTotalDays}-Day Visual Forecast`,
    growSummary: `Tailored for ${plantLabel} (${payload.plantType} · ${strainLabel}) in ${payload.setting} ${payload.medium} (${soilLabel}), using ${trainingText} and ${
      payload.fertilizerSchedule.length > 0
        ? `${payload.fertilizerSchedule.length} scheduled fertilizer${payload.fertilizerSchedule.length > 1 ? "s" : ""}`
        : "natural soil biology"
    }.`,
    sceneAnalysis,
    strainProfile: profile,
    stages,
    keyMilestones,
    source: "horticultural-simulator",
  };
}

export async function handleGrowthVisualize(
  payload: GrowthVisualizationRequest,
): Promise<GrowthVisualizationPlan> {
  const fallback = buildFallbackPlan(payload);
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return fallback;
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  const cleanBase64 = (raw?: string) =>
    raw ? raw.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "").trim() : "";

  const areaData = cleanBase64(payload.growAreaPhotoBase64);
  const plantData = cleanBase64(payload.plantPhotoBase64);

  const fertsSummary =
    payload.fertilizerSchedule.length > 0
      ? payload.fertilizerSchedule
          .map(
            (f) =>
              `- ${f.name} (${f.fertilizerType}, ${f.form}${
                f.dilutionRatio ? ` @ ${f.dilutionRatio}` : ""
              }) used during [${f.stages.join(", ")}] (Weeks ${f.startWeek}–${f.endWeek}, ${f.frequency})${
                f.ingredients ? ` · Ingredients: ${f.ingredients}` : ""
              }`,
          )
          .join("\n")
      : "No added fertilizers — growing purely on base soil mix.";

  const promptText = `You are a friendly master botanist and visual grow planner for home gardeners.
Analyze the uploaded grow area / plant photo(s) (if provided) and the gardener's exact setup below to forecast how this plant will visually develop across Seedling, Vegetative, and Flowering stages AND day-by-day through harvest.

PLANT & GROW SETUP:
- Plant Name: "${payload.plantName}"
- Seed Strain / Cultivar: "${payload.strain}" (${payload.plantType})
- Environment: ${payload.setting}
- Growing Medium: ${payload.medium}
- Detailed Soil / Medium Mix Composition: ${payload.soilComposition || payload.medium}
- Plant Training Methods Planned / Active: ${payload.trainingMethods.join(", ") || "Untrained / Natural"}
- Target Grow Cycle Length: ${payload.totalDays} days
- Fertilizers & When Used:
${fertsSummary}
${payload.notes ? `- Gardener Notes: ${payload.notes}` : ""}
${payload.journalContext?.promptBlock ? `\n${payload.journalContext.promptBlock}` : ""}

INSTRUCTIONS:
1. If a grow-area photo is attached, inspect where the pot, garden bed, or planting soil sits and return normalized coordinates anchorX (0.2 to 0.8) and anchorY (0.55 to 0.88) for where the plant stem emerges from the soil, plus lightDirection ("left", "center", or "right") and ambientWarmth.
2. Predict accurate visual characteristics for the strain "${payload.strain}" grown in "${payload.soilComposition || payload.medium}" with training "${payload.trainingMethods.join(", ")}" and the listed fertilizers.
3. Return exactly 3 stage objects in "stages" in order: "Seedling", "Vegetative", "Flowering". Write in friendly, clear home-gardener English referencing their exact strain, soil mix, fertilizers, and training methods.
4. Return 7 to 10 key daily milestones spanning Day 1 to Day ${payload.totalDays}.`;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (areaData.length > 250) {
    parts.push({
      inlineData: {
        mimeType: payload.growAreaMimeType || "image/jpeg",
        data: areaData,
      },
    });
  }
  if (plantData.length > 250) {
    parts.push({
      inlineData: {
        mimeType: payload.plantPhotoMimeType || "image/jpeg",
        data: plantData,
      },
    });
  }
  parts.push({ text: promptText });

  const candidateModels = ["gemini-4-hydrogen", "gemini-3.1-flash-lite"];

  for (const modelName of candidateModels) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 9000);

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${modelName} timed out`)), 9000),
      );

      const response = await Promise.race([
        ai.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts }],
          config: {
            abortSignal: abortController.signal,
            systemInstruction:
              "You are Canopy AI Growth Visualizer. Return accurate, practical botanical growth projections and visual scene anchoring in strict JSON matching the schema.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                planTitle: { type: Type.STRING },
                growSummary: { type: Type.STRING },
                sceneAnalysis: {
                  type: Type.OBJECT,
                  properties: {
                    anchorX: { type: Type.NUMBER },
                    anchorY: { type: Type.NUMBER },
                    scaleFactor: { type: Type.NUMBER },
                    lightDirection: { type: Type.STRING },
                    ambientWarmth: { type: Type.STRING },
                    environmentSummary: { type: Type.STRING },
                  },
                  required: [
                    "anchorX",
                    "anchorY",
                    "scaleFactor",
                    "lightDirection",
                    "ambientWarmth",
                    "environmentSummary",
                  ],
                },
                strainProfile: {
                  type: Type.OBJECT,
                  properties: {
                    growthHabit: { type: Type.STRING },
                    leafHue: { type: Type.STRING },
                    budAccent: { type: Type.STRING },
                    trichomeFrost: { type: Type.NUMBER },
                    estimatedTotalDays: { type: Type.INTEGER },
                    seedlingEndDay: { type: Type.INTEGER },
                    vegEndDay: { type: Type.INTEGER },
                    expectedHeightCm: { type: Type.INTEGER },
                    expectedCanopyWidthCm: { type: Type.INTEGER },
                    expectedYieldNote: { type: Type.STRING },
                  },
                  required: [
                    "growthHabit",
                    "leafHue",
                    "budAccent",
                    "trichomeFrost",
                    "estimatedTotalDays",
                    "seedlingEndDay",
                    "vegEndDay",
                    "expectedHeightCm",
                    "expectedCanopyWidthCm",
                    "expectedYieldNote",
                  ],
                },
                stages: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      stage: { type: Type.STRING },
                      dayRange: { type: Type.STRING },
                      representativeDay: { type: Type.INTEGER },
                      headline: { type: Type.STRING },
                      visualDetails: { type: Type.STRING },
                      heightCm: { type: Type.INTEGER },
                      canopyWidthCm: { type: Type.INTEGER },
                      leafNodes: { type: Type.INTEGER },
                      activeFertilizers: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      activeTraining: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                      careTip: { type: Type.STRING },
                    },
                    required: [
                      "stage",
                      "dayRange",
                      "representativeDay",
                      "headline",
                      "visualDetails",
                      "heightCm",
                      "canopyWidthCm",
                      "leafNodes",
                      "activeFertilizers",
                      "activeTraining",
                      "careTip",
                    ],
                  },
                },
                keyMilestones: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      day: { type: Type.INTEGER },
                      label: { type: Type.STRING },
                    },
                    required: ["day", "label"],
                  },
                },
              },
              required: [
                "planTitle",
                "growSummary",
                "sceneAnalysis",
                "strainProfile",
                "stages",
                "keyMilestones",
              ],
            },
          },
        }),
        timeoutPromise,
      ]);

      const text = response.text?.trim();
      if (text) {
        const parsed = JSON.parse(text) as Partial<GrowthVisualizationPlan>;
        if (parsed.stages && parsed.stages.length >= 3 && parsed.strainProfile) {
          const validHabit = (
            ["bushy-indica", "tall-sativa", "balanced-hybrid", "compact-auto"] as const
          ).includes(parsed.strainProfile.growthHabit as StrainVisualProfile["growthHabit"])
            ? parsed.strainProfile.growthHabit
            : fallback.strainProfile.growthHabit;

          const validLeafHue = (
            ["emerald", "deep-forest", "lime-vibrant", "purple-flushed"] as const
          ).includes(parsed.strainProfile.leafHue as StrainVisualProfile["leafHue"])
            ? parsed.strainProfile.leafHue
            : fallback.strainProfile.leafHue;

          const validBudAccent = (
            ["frosty-green", "purple-violet", "amber-orange", "pink-pistil"] as const
          ).includes(parsed.strainProfile.budAccent as StrainVisualProfile["budAccent"])
            ? parsed.strainProfile.budAccent
            : fallback.strainProfile.budAccent;

          const validLight = (["left", "center", "right"] as const).includes(
            parsed.sceneAnalysis?.lightDirection as GrowthSceneAnalysis["lightDirection"],
          )
            ? parsed.sceneAnalysis!.lightDirection
            : fallback.sceneAnalysis.lightDirection;

          const validWarmth = (
            ["warm-sun", "cool-daylight", "indoor-led", "greenhouse"] as const
          ).includes(parsed.sceneAnalysis?.ambientWarmth as GrowthSceneAnalysis["ambientWarmth"])
            ? parsed.sceneAnalysis!.ambientWarmth
            : fallback.sceneAnalysis.ambientWarmth;

          const normalizedStages: StagePreviewPlan[] = (
            ["Seedling", "Vegetative", "Flowering"] as const
          ).map((stageName, idx) => {
            const match =
              parsed.stages?.find((s) => s.stage?.toLowerCase() === stageName.toLowerCase()) ||
              parsed.stages?.[idx] ||
              fallback.stages[idx]!;
            return {
              ...fallback.stages[idx]!,
              ...match,
              stage: stageName,
            };
          });

          return {
            planTitle: parsed.planTitle || fallback.planTitle,
            growSummary: parsed.growSummary || fallback.growSummary,
            sceneAnalysis: {
              anchorX: Math.max(0.18, Math.min(0.82, parsed.sceneAnalysis?.anchorX ?? 0.5)),
              anchorY: Math.max(0.52, Math.min(0.88, parsed.sceneAnalysis?.anchorY ?? 0.76)),
              scaleFactor: Math.max(0.75, Math.min(1.25, parsed.sceneAnalysis?.scaleFactor ?? 1.0)),
              lightDirection: validLight,
              ambientWarmth: validWarmth,
              environmentSummary:
                parsed.sceneAnalysis?.environmentSummary ||
                fallback.sceneAnalysis.environmentSummary,
            },
            strainProfile: {
              growthHabit: validHabit,
              leafHue: validLeafHue,
              budAccent: validBudAccent,
              trichomeFrost: Math.max(0.5, Math.min(1, parsed.strainProfile.trichomeFrost ?? 0.85)),
              estimatedTotalDays: Math.max(
                49,
                Math.min(
                  140,
                  Math.round(
                    payload.totalDays ||
                      parsed.strainProfile.estimatedTotalDays ||
                      fallback.strainProfile.estimatedTotalDays,
                  ),
                ),
              ),
              seedlingEndDay: Math.max(
                10,
                Math.min(
                  24,
                  Math.round(
                    parsed.strainProfile.seedlingEndDay || fallback.strainProfile.seedlingEndDay,
                  ),
                ),
              ),
              vegEndDay: Math.max(
                28,
                Math.min(
                  90,
                  Math.round(parsed.strainProfile.vegEndDay || fallback.strainProfile.vegEndDay),
                ),
              ),
              expectedHeightCm: Math.max(
                35,
                Math.min(
                  260,
                  Math.round(
                    parsed.strainProfile.expectedHeightCm ||
                      fallback.strainProfile.expectedHeightCm,
                  ),
                ),
              ),
              expectedCanopyWidthCm: Math.max(
                30,
                Math.min(
                  220,
                  Math.round(
                    parsed.strainProfile.expectedCanopyWidthCm ||
                      fallback.strainProfile.expectedCanopyWidthCm,
                  ),
                ),
              ),
              expectedYieldNote:
                parsed.strainProfile.expectedYieldNote || fallback.strainProfile.expectedYieldNote,
            },
            stages: normalizedStages,
            keyMilestones:
              Array.isArray(parsed.keyMilestones) && parsed.keyMilestones.length > 0
                ? parsed.keyMilestones
                : fallback.keyMilestones,
            source: "gemini-4-hydrogen",
          };
        }
      }
    } catch (err: unknown) {
      console.warn(
        `Growth visualizer model ${modelName} fallback:`,
        err instanceof Error ? err.message.slice(0, 120) : String(err),
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return fallback;
}
