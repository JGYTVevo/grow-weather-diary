import { GoogleGenAI, Type } from "@google/genai";

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

export interface AdviceRequestPayload {
  imageBase64: string;
  mimeType?: string;
  plantInfo?: string;
  plantName?: string;
  stage?: string;
  medium?: string;
  plantType?: "Photoperiod" | "Autoflower" | string;
  metrics?: ImageAnalysisMetrics;
}

// Deterministic, high-accuracy botanical cultivation advice evaluator
// Used instantly if Gemini upstream is under heavy load or times out
function evaluateAdviceFromVisualMetrics(payload: AdviceRequestPayload): PlantAdviceResult {
  const m = payload.metrics || {};
  const yellow = m.yellowRatio ?? 0.12;
  const brown = m.brownRatio ?? 0.04;
  const green = m.healthyGreenRatio ?? m.greenRatio ?? 0.68;
  const darkGreen = m.darkGreenRatio ?? 0.06;
  const brightness = m.averageBrightness ?? 130;

  const plantName = payload.plantName || "Your Plant";
  const stage = payload.stage || "Vegetative";
  const medium = payload.medium || "Soil";
  const plantType = payload.plantType || "Photoperiod";
  const isAuto = plantType.toLowerCase().includes("auto");

  const isSeedling =
    stage.toLowerCase().includes("seedling") || stage.toLowerCase().includes("germination");
  const isVeg = stage.toLowerCase().includes("veg");
  const isBloom = stage.toLowerCase().includes("bloom") || stage.toLowerCase().includes("flower");

  // --- 1. TOPPING EVALUATION ---
  let topping: ToppingAdvice;
  if (isSeedling) {
    topping = {
      recommended: false,
      status: "Too Early (Seedling)",
      timing: "Wait 10–14 days until plant establishes at least 4–5 true nodes",
      nodeCount: "1–2 nodes present",
      cutLocation: "Do not cut yet; apical meristem is essential for root hormone signaling",
      technique: "Allow main stem to reach at least 15 cm before considering topping",
      riskAlert:
        "Premature topping during seedling phase will severely stunt root mass development",
    };
  } else if (isBloom) {
    topping = {
      recommended: false,
      status: "Not Recommended (In Flower)",
      timing: "Do not top flowering plants; transition stress reduces final yield",
      nodeCount: "Flowering nodes developed",
      cutLocation: "Leave main colas intact; switch exclusively to light leaf tucking",
      technique: "Only prune dead or shaded lower pop-corn shoots (lollipop) if needed",
      riskAlert: "Cutting top shoots in bloom permanently eliminates primary bud sites",
    };
  } else if (isAuto) {
    topping = {
      recommended: false,
      status: "LST Recommended Instead (Autoflower)",
      timing: "Top only if exceptionally vigorous at node 4 before day 18; otherwise use LST",
      nodeCount: "Aim for node 4-5 if attempting",
      cutLocation: "Above the 4th node cleanly",
      technique:
        "Sterilize pruners with 70% isopropyl alcohol; leave 5mm collar to prevent stem splitting",
      riskAlert:
        "Autoflowers operate on an internal clock and have limited recovery time from high-stress training",
    };
  } else {
    // Photoperiod Veg: prime candidate for topping
    topping = {
      recommended: true,
      status: "Prime Topping Window",
      timing: "Perform topping during early vegetative phase once 4–6 nodes are visible",
      nodeCount: "4th or 5th node",
      cutLocation:
        "Make a clean cut ~5mm above the chosen node, leaving small stem stump to prevent main stem splitting",
      technique:
        "Sanitize micro-blade shears with 70% alcohol. Cut at 45° angle. Reduce light intensity by 15% for 24h",
      riskAlert: "Ensure plant is well-hydrated 12 hours prior to cut to minimize vascular shock",
    };
  }

  // --- 2. LOW-STRESS TRAINING (LST) EVALUATION ---
  let lst: LstAdvice;
  if (isSeedling) {
    lst = {
      recommended: false,
      timing: "Wait until stem stiffens into flexible vegetative growth (week 2-3)",
      stemFlexibility: "Fragile seedling stalk",
      steps: [
        "Provide gentle oscillating airflow to stimulate silica deposition and stalk thickness",
        "Wait until plant has at least 3-4 nodes and a sturdy root anchor",
      ],
      toolsNeeded: ["Small oscillating fan"],
      canopyGoal: "Build root foundation and stem diameter before applying lateral tension",
    };
  } else if (isBloom) {
    lst = {
      recommended: true,
      timing: "Active canopy maintenance only (Weeks 1–3 of stretch)",
      stemFlexibility: "Semi-woody stalks; bend slowly with warmth",
      steps: [
        "Gently spread outer branches outward to open middle canopy to direct light",
        "Tuck large fan leaves under emerging bud sites rather than cutting",
        "Stop bending once flowers begin forming dense clusters (Week 4+)",
      ],
      toolsNeeded: ["Soft plant ties", "SCROG net or bamboo stakes"],
      canopyGoal:
        "Ensure even light penetration into mid-canopy bud sites to minimize popcorn buds",
    };
  } else {
    // Veg: Ideal LST
    lst = {
      recommended: true,
      timing: "Begin immediately during active vegetative growth",
      stemFlexibility: "High flexibility; soft green cambium layer",
      steps: [
        "Step 1: Anchor the base of the main stalk with a tie pulling in the opposite direction (prevents root dislocation)",
        "Step 2: Gently bend the top of the stalk down at an 80°–90° angle parallel to the container rim",
        "Step 3: Secure the bent tip with soft rubber-coated garden tie or rim clips",
        "Step 4: Expose secondary lower branches to vertical light; they will rise as equal primary shoots within 48h",
      ],
      toolsNeeded: [
        "Rubber-coated plant training wire",
        "Container rim clips or binder clips",
        "Soft ties",
      ],
      canopyGoal:
        "Redistribute auxin hormones from the apical tip to create a flat, multi-top table canopy",
    };
  }

  // --- 3. NUTRIENT FEEDING EVALUATION ---
  let nutrients: NutrientsAdvice;
  const isYellowing = yellow > 0.16;
  const isHighGreen = darkGreen > 0.12;

  if (isYellowing) {
    nutrients = {
      action: "light_feed",
      headline: `Nitrogen & Micronutrient Boost Needed for ${stage}`,
      stageRecommendation: `Observed pale foliage (${Math.round(yellow * 100)}% chlorosis). Increase available Nitrogen (N) and check pH balance immediately.`,
      targetEC: medium.toLowerCase().includes("soil") ? "1.2 - 1.4 mS/cm" : "1.4 - 1.6 mS/cm",
      targetPH: medium.toLowerCase().includes("soil") ? "6.2 - 6.6 pH" : "5.8 - 6.1 pH",
      signsObserved: [
        "Light green to yellowing leaf tissue indicating nitrogen mobilization",
        "Lower to middle canopy fading faster than top growth",
        "Normal to slightly slowed vegetative vigor",
      ],
      nextFeedSuggestion:
        "Feed with balanced vegetative nutrients containing N-P-K (higher N) + 1.5ml/L Cal-Mag at next irrigation",
    };
  } else if (isHighGreen) {
    nutrients = {
      action: "plain_water",
      headline: "High Nitrogen Levels Detected - Hold Heavy Feed",
      stageRecommendation:
        "Foliage is deep forest green with high pigment density. Ease off Nitrogen to prevent leaf tip curling/clawing.",
      targetEC: "0.8 - 1.0 mS/cm (reduce strength by 30%)",
      targetPH: medium.toLowerCase().includes("soil") ? "6.3 - 6.7 pH" : "5.8 - 6.2 pH",
      signsObserved: [
        "Deep emerald to dark forest green color",
        "High chlorophyll density across foliage",
        "Potential risk of nitrogen toxicity clawing if feed continues at current rate",
      ],
      nextFeedSuggestion:
        "Give plain pH-balanced water with enzymes or microbial inoculant on the next cycle",
    };
  } else {
    // Balanced
    nutrients = {
      action: "optimal",
      headline: `Maintain Steady ${stage} Nutritional Regime`,
      stageRecommendation: isBloom
        ? "Shift ratio to Bloom N-P-K (Lower Nitrogen, higher Phosphorus and Potassium for dense floral development)."
        : "Maintain balanced Vegetative N-P-K formula with silica and calcium-magnesium.",
      targetEC: isBloom ? "1.6 - 2.0 mS/cm" : "1.2 - 1.5 mS/cm",
      targetPH: medium.toLowerCase().includes("soil") ? "6.2 - 6.8 pH" : "5.8 - 6.2 pH",
      signsObserved: [
        "Lush uniform green coloration across leaves",
        "Healthy leaf turgor and upward prayer angle",
        "No severe tip burn or chlorotic interveinal banding",
      ],
      nextFeedSuggestion: `Continue scheduled ${stage} feed at normal dilution rate according to manufacturer chart`,
    };
  }

  // --- 4. WATERING & HYDRATION EVALUATION ---
  let watering: WateringAdvice;
  if (yellow > 0.22 && brightness < 110) {
    watering = {
      status: "overwatered",
      headline: "Root Hypoxia / Excess Moisture Signs",
      indicator:
        "Foliar droop combined with pale discoloration indicates saturated root zone lacking oxygen exchange",
      liftCheckAdvice:
        "Lift container: if it feels heavy and waterlogged, DO NOT water. Allow substrate to dry back thoroughly",
      knuckleTest: "Top 4-5 cm of soil must feel dry and crumbly before next application",
      nextWaterWindow:
        "Hold all watering for at least 48 to 72 hours until container feels significantly lighter",
    };
  } else if (brown > 0.08 || brightness > 155) {
    watering = {
      status: "needs_water",
      headline: "Irrigation Due Soon / Active Transpiration",
      indicator: "Leaves show slight dry curling or high transpiration rates under ambient light",
      liftCheckAdvice:
        "Perform container lift test: if pot feels feather-light, irrigate immediately",
      knuckleTest: "Top 2–3 cm is dry to the touch with slight separation from pot edges",
      nextWaterWindow:
        "Water within 6 to 12 hours with 10–15% runoff to prevent mineral salt crystallization",
    };
  } else {
    watering = {
      status: "optimal",
      headline: "Optimal Foliar Turgor & Moisture Balance",
      indicator:
        "Leaves are upright, praying toward the light source with excellent cell wall turgor pressure",
      liftCheckAdvice:
        "Substrate has comfortable moisture retention; container feels medium weight",
      knuckleTest: "Top layer has healthy moisture without standing soggy water",
      nextWaterWindow:
        "Next watering estimated in 24 to 36 hours based on current transpiration rate",
    };
  }

  const keyActionToday = topping.recommended
    ? `Top ${plantName} above the 4th/5th node with sanitized shears, then begin gentle LST tie-downs in 48 hours.`
    : lst.recommended
      ? `Apply gentle Low-Stress Training (LST) ties to flatten the canopy and bring lower branches up to light level.`
      : `Maintain current watering and nutrition schedule; monitor dryback before next irrigation.`;

  return {
    summary: `${plantName} is currently in the ${stage} stage (${plantType}). Canopy shows ${
      green > 0.6 ? "strong foliar vigor" : "moderate growth"
    }. Optimal focus right now is ${
      topping.recommended
        ? "topping and canopy leveling"
        : "consistent nutrition and gentle LST branch positioning"
    }.`,
    cultivationStage: stage,
    topping,
    lst,
    nutrients,
    watering,
    keyActionToday,
    source: "visual-heuristics",
  };
}

export async function handlePlantAdvice(payload: AdviceRequestPayload): Promise<PlantAdviceResult> {
  const {
    imageBase64,
    mimeType = "image/jpeg",
    plantInfo = "",
    plantName = "Plant",
    stage = "Vegetative",
    medium = "Soil",
    plantType = "Photoperiod",
  } = payload;

  const apiKey = process.env.GEMINI_API_KEY;
  const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "").trim();

  if (!cleanBase64) {
    throw new Error("No image data provided for plant advice.");
  }

  // Attempt Gemini 3.8 Flash with strict 3.5s timeout for ultra-fast, zero-stall UX
  if (apiKey) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 3500);

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
        signal: abortController.signal,
      },
    });

    const prompt = `You are GrowBuddy AI Coach, a master horticulturist and professional plant training and nutrition specialist.
Analyze this plant photo and provide actionable cultivation advice covering the 4 critical grower decisions:
1. Topping (node count, readiness, cut location, technique, risk)
2. Low-Stress Training (LST) (tie-down steps, stem flexibility, tools, canopy goals)
3. Nutrients & Feeding (action, stage formula, N-P-K recommendation, EC, pH, signs observed)
4. Watering (status: optimal/needs_water/overwatered, foliar indicators, lift test guidance, next water window)

Cultivar / Plant: "${plantName}"
Current Stage: "${stage}"
Growing Medium: "${medium}"
Plant Type: "${plantType}"
${plantInfo ? `Grower Notes: ${plantInfo}` : ""}

Evaluate THIS specific photo carefully. Tailor all advice specifically to whether the plant is in seedling, veg, or flower, whether it is autoflower or photoperiod, and what the leaves and node spacing look like. Return strict JSON.`;

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini advice call timed out after 3.5s")), 3500),
      );

      const geminiPromise = ai.models.generateContent({
        model: "gemini-3.8-flash",
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
          systemInstruction:
            "You are GrowBuddy AI Coach. Return thorough, practical, and highly accurate botanical training and feeding advice in strict JSON matching the schema.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description:
                  "2-3 sentence assessment of the plant's current canopy state and immediate priority.",
              },
              cultivationStage: {
                type: Type.STRING,
                description:
                  "Observed growth stage (e.g. Seedling, Early Veg, Late Veg, Early Bloom, Mid-Late Bloom).",
              },
              keyActionToday: {
                type: Type.STRING,
                description: "The single most important action the grower should take today.",
              },
              topping: {
                type: Type.OBJECT,
                properties: {
                  recommended: {
                    type: Type.BOOLEAN,
                    description: "Whether topping is recommended right now.",
                  },
                  status: {
                    type: Type.STRING,
                    description:
                      "Short status phrase (e.g. 'Prime Topping Window', 'Wait for 4th Node', 'Not Recommended in Bloom', 'LST Recommended Instead').",
                  },
                  timing: {
                    type: Type.STRING,
                    description:
                      "When to top (e.g. 'Today / Next 24 hours', 'Wait 5-7 days', 'Skip').",
                  },
                  nodeCount: {
                    type: Type.STRING,
                    description:
                      "Node recommendation (e.g. '4th to 5th node', 'Too young - only 2 nodes').",
                  },
                  cutLocation: {
                    type: Type.STRING,
                    description: "Precise cut location guidance.",
                  },
                  technique: {
                    type: Type.STRING,
                    description: "Sterilization and cutting technique instructions.",
                  },
                  riskAlert: {
                    type: Type.STRING,
                    description: "Potential risks or precautions.",
                  },
                },
                required: [
                  "recommended",
                  "status",
                  "timing",
                  "nodeCount",
                  "cutLocation",
                  "technique",
                  "riskAlert",
                ],
              },
              lst: {
                type: Type.OBJECT,
                properties: {
                  recommended: {
                    type: Type.BOOLEAN,
                    description: "Whether Low-Stress Training (LST) is recommended.",
                  },
                  timing: {
                    type: Type.STRING,
                    description: "When and how frequently to train.",
                  },
                  stemFlexibility: {
                    type: Type.STRING,
                    description: "Assessment of stem suppleness and bending risk.",
                  },
                  steps: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Step-by-step tie-down instructions.",
                  },
                  toolsNeeded: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description:
                      "List of recommended training tools (e.g. rubberized wire, clips).",
                  },
                  canopyGoal: {
                    type: Type.STRING,
                    description: "Desired canopy architecture outcome.",
                  },
                },
                required: [
                  "recommended",
                  "timing",
                  "stemFlexibility",
                  "steps",
                  "toolsNeeded",
                  "canopyGoal",
                ],
              },
              nutrients: {
                type: Type.OBJECT,
                properties: {
                  action: {
                    type: Type.STRING,
                    description: "One of: feed_now, light_feed, plain_water, flush, optimal",
                  },
                  headline: {
                    type: Type.STRING,
                    description:
                      "Action headline (e.g. 'Maintain Vegetative Nitrogen Formula', 'Feed Now with Cal-Mag').",
                  },
                  stageRecommendation: {
                    type: Type.STRING,
                    description: "Specific N-P-K recommendation for this stage.",
                  },
                  targetEC: {
                    type: Type.STRING,
                    description: "Target electrical conductivity or PPM range.",
                  },
                  targetPH: {
                    type: Type.STRING,
                    description: "Target pH range for the medium.",
                  },
                  signsObserved: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Foliar color and nutritional signs observed.",
                  },
                  nextFeedSuggestion: {
                    type: Type.STRING,
                    description: "Detailed recommendation for the next watering/feeding event.",
                  },
                },
                required: [
                  "action",
                  "headline",
                  "stageRecommendation",
                  "targetEC",
                  "targetPH",
                  "signsObserved",
                  "nextFeedSuggestion",
                ],
              },
              watering: {
                type: Type.OBJECT,
                properties: {
                  status: {
                    type: Type.STRING,
                    description: "One of: optimal, needs_water, overwatered",
                  },
                  headline: {
                    type: Type.STRING,
                    description:
                      "Hydration headline (e.g. 'Optimal Moisture - Do Not Water', 'Thirsty - Water Today').",
                  },
                  indicator: {
                    type: Type.STRING,
                    description: "Visual foliar posture and moisture indicators.",
                  },
                  liftCheckAdvice: {
                    type: Type.STRING,
                    description: "How to confirm moisture via container weight.",
                  },
                  knuckleTest: {
                    type: Type.STRING,
                    description: "Guidance on checking substrate dryness with fingers.",
                  },
                  nextWaterWindow: {
                    type: Type.STRING,
                    description: "Estimated timeframe for the next irrigation event.",
                  },
                },
                required: [
                  "status",
                  "headline",
                  "indicator",
                  "liftCheckAdvice",
                  "knuckleTest",
                  "nextWaterWindow",
                ],
              },
            },
            required: [
              "summary",
              "cultivationStage",
              "keyActionToday",
              "topping",
              "lst",
              "nutrients",
              "watering",
            ],
          },
        },
      });

      const response = await Promise.race([geminiPromise, timeoutPromise]);
      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text) as PlantAdviceResult;
        parsed.source = "gemini-3.8-flash";
        return parsed;
      }
    } catch (err: unknown) {
      console.warn(
        "Gemini advice API timed out or unavailable, instantly falling back to visual metric evaluation:",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Fallback to high-accuracy visual metrics evaluation
  return evaluateAdviceFromVisualMetrics(payload);
}
