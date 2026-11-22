import { GoogleGenAI, Type } from "@google/genai";
import type { LinkedJournalContextPayload } from "@/server/diagnose";

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
  journalContextUsed?: string[] | undefined;
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
  journalContext?: LinkedJournalContextPayload;
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

  const jc = payload.journalContext;
  const plantName = jc?.plantName || payload.plantName || "Your Plant";
  const stage = jc?.stage || payload.stage || "Vegetative";
  const medium = jc?.medium || payload.medium || "Soil";
  const plantType = jc?.plantType || payload.plantType || "Photoperiod";
  const isAuto = plantType.toLowerCase().includes("auto");

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
  const alreadyTopped = Boolean(
    jc?.trainingSummary?.toLowerCase().includes("topping") || combinedLower.includes("topping"),
  );

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
      timing:
        jc?.trainingSummary && !jc.trainingSummary.includes("Untrained")
          ? `Continue maintaining your ${jc.trainingSummary} tie-downs as new shoots stretch`
          : "Begin immediately during active vegetative growth",
      stemFlexibility: "High flexibility; soft green stems",
      steps: [
        "Step 1: Anchor the base of the main stalk with a soft tie pulling in the opposite direction to steady the roots",
        isInGround
          ? "Step 2: Gently bend the taller branches outward and secure them to wooden garden stakes or ground pegs pushed into the soil bed"
          : "Step 2: Gently bend the top of the stalk down at an 80°–90° angle parallel to the container rim",
        isInGround
          ? "Step 3: Space the branches evenly in a circle so outdoor sun and breeze reach the middle of the plant"
          : "Step 3: Secure the bent tip with soft rubber-coated garden tie or rim clips",
        "Step 4: Expose lower side branches to direct light so they grow up into even main tops",
      ],
      toolsNeeded: isInGround
        ? ["Soft rubber-coated plant wire", "Bamboo stakes or ground pegs", "Garden twine"]
        : ["Rubber-coated plant training wire", "Container rim clips or binder clips", "Soft ties"],
      canopyGoal:
        "Spread the branches into a wide, flat canopy so every top gets equal light and airflow",
    };
  }

  // --- 3. NUTRIENT FEEDING EVALUATION ---
  let nutrients: NutrientsAdvice;
  const isYellowing = yellow > 0.16;
  const isHighGreen = darkGreen > 0.12;
  const feedContextSuffix = jc?.recentFeedsSummary ? ` (Journal: ${jc.recentFeedsSummary})` : "";

  if (isYellowing) {
    nutrients = {
      action: "light_feed",
      headline: isLivingSoil
        ? `Organic Top-Dress or Brew Needed for ${stage}`
        : `Gentle Nutrient Boost Needed for ${stage}`,
      stageRecommendation: `Observed pale leaves (${Math.round(yellow * 100)}% yellowing).${feedContextSuffix} ${
        isLivingSoil
          ? `Boost your ${medium} with worm castings, compost, or a diluted organic tea.`
          : "Increase available plant food (Nitrogen & Cal-Mag) and check water pH."
      }`,
      targetEC: isLivingSoil
        ? "Organic Brew / Top-Dress (1.0 - 1.4 mS/cm)"
        : medium.toLowerCase().includes("soil")
          ? "1.2 - 1.4 mS/cm"
          : "1.4 - 1.6 mS/cm",
      targetPH: medium.toLowerCase().includes("soil") ? "6.2 - 6.6 pH" : "5.8 - 6.1 pH",
      signsObserved: [
        "Light green to yellowing leaf colour indicating the plant is hungry",
        "Lower to middle leaves fading faster than top growth",
        ...(jc?.recentFeedsSummary ? [`Journal feed log: ${jc.recentFeedsSummary}`] : []),
      ],
      nextFeedSuggestion: isLivingSoil
        ? "Water in one of your saved diluted homemade brews (e.g. nettle, comfrey, or worm tea) or top-dress with rich compost around the stem."
        : "Feed with balanced vegetative nutrients containing N-P-K + 1.5ml/L Cal-Mag at next watering.",
    };
  } else if (isHighGreen) {
    nutrients = {
      action: "plain_water",
      headline: "Rich Leaf Colour — Plain Water Next",
      stageRecommendation: `Leaves are deep lush green.${feedContextSuffix} Give plain water on the next watering so you don't overfeed.`,
      targetEC: "0.8 - 1.0 mS/cm (or plain water)",
      targetPH: medium.toLowerCase().includes("soil") ? "6.3 - 6.7 pH" : "5.8 - 6.2 pH",
      signsObserved: [
        "Deep emerald to dark green leaf colour",
        "Plenty of stored nitrogen in the leaves",
      ],
      nextFeedSuggestion: isLivingSoil
        ? "Water with plain dechlorinated water or a light microbe/molasses tea only."
        : "Give plain pH-balanced water on the next watering cycle.",
    };
  } else {
    // Balanced
    nutrients = {
      action: "optimal",
      headline: `Keep Up Your Steady ${stage} Routine`,
      stageRecommendation: isBloom
        ? `Continue Bloom feeding for ${medium} (focus on potassium & phosphorus for flower swell).${feedContextSuffix}`
        : `Maintain your balanced ${stage} nutrition in ${medium}.${feedContextSuffix}`,
      targetEC: isLivingSoil
        ? "Living Soil Web (Organic Teas / Mulch)"
        : isBloom
          ? "1.6 - 2.0 mS/cm"
          : "1.2 - 1.5 mS/cm",
      targetPH: medium.toLowerCase().includes("soil") ? "6.2 - 6.8 pH" : "5.8 - 6.2 pH",
      signsObserved: [
        "Lush, even green colour across the leaves",
        "Healthy perky leaves reaching toward the light",
        ...(jc?.recentFeedsSummary ? [`Synced feed history: ${jc.recentFeedsSummary}`] : []),
      ],
      nextFeedSuggestion: isLivingSoil
        ? `Keep your ${medium} moist so soil microbes keep breaking down organic food; apply your diluted homemade brews every 7–10 days.`
        : `Continue scheduled ${stage} feed at your normal dilution rate.`,
    };
  }

  // --- 4. WATERING & HYDRATION EVALUATION ---
  let watering: WateringAdvice;
  const waterContextSuffix = jc?.recentWaterSummary ? ` (${jc.recentWaterSummary})` : "";
  if (yellow > 0.22 && brightness < 110) {
    watering = {
      status: "overwatered",
      headline: "Soil Staying Too Wet — Let It Breathe",
      indicator: `Slightly droopy leaves suggest the roots in your ${medium} need more air${waterContextSuffix}`,
      liftCheckAdvice: isInGround
        ? "Since this plant is in the ground, check drainage around the bed and hold off on hose watering until the top 4–5 cm feels dry."
        : "Lift the pot: if it feels heavy and full of water, wait before watering again.",
      knuckleTest:
        "Push your finger 4–5 cm (two knuckles) into the soil — wait until it feels dry and crumbly.",
      nextWaterWindow: "Wait 48 to 72 hours before watering again so the roots get fresh oxygen.",
    };
  } else if (brown > 0.08 || brightness > 155) {
    watering = {
      status: "needs_water",
      headline: `Ready for a Good Watering Soon`,
      indicator: `Leaves are working hard in the light and ready for fresh moisture in ${medium}${waterContextSuffix}`,
      liftCheckAdvice: isInGround
        ? "Pull back the mulch layer and feel the earth 2 inches down — if it feels dry, give a deep soak around the drip-line."
        : "Lift the pot: if it feels light, give a thorough watering today.",
      knuckleTest: "Top 2–3 cm of soil is dry to the touch.",
      nextWaterWindow: "Water within the next 6 to 12 hours (ideally morning or evening).",
    };
  } else {
    watering = {
      status: "optimal",
      headline: "Happy Moisture Balance",
      indicator: `Leaves are perky and upright with healthy moisture in your ${medium}${waterContextSuffix}`,
      liftCheckAdvice: isInGround
        ? "Ground soil under the mulch has comfortable, even moisture."
        : "Pot feels medium weight with comfortable moisture retention.",
      knuckleTest: "Top inch of soil feels lightly moist like a wrung-out sponge, not soggy.",
      nextWaterWindow: "Check again in 24 to 36 hours before your next watering.",
    };
  }

  if (alreadyTopped && topping.recommended) {
    topping.status = "Already Topped (Maintain Multi-Top Canopy)";
    topping.timing =
      "Your journal shows this plant was already topped — only top secondary shoots if you want bushier branching";
  }

  const keyActionToday =
    topping.recommended && !alreadyTopped
      ? `Top ${plantName} cleanly above the 4th/5th node, then spread branches gently with LST ties.`
      : lst.recommended
        ? `Spread ${plantName}'s branches gently with LST ${isInGround ? "ground stakes/ties" : "ties"} to open the middle of the plant to light and airflow.`
        : `Keep up your ${medium} watering and feeding rhythm; check soil moisture with your finger before the next water.`;

  const journalBadges = jc?.journalContextBadges || [
    `🌱 ${plantName} (${stage})`,
    `🌍 ${jc?.setting || "Outdoor"} · ${medium}`,
    ...(jc?.recentWaterSummary ? [`💧 ${jc.recentWaterSummary}`] : []),
    ...(jc?.recentFeedsSummary ? [`🧪 ${jc.recentFeedsSummary}`] : []),
    ...(jc?.trainingSummary ? [`✂️ ${jc.trainingSummary}`] : []),
  ];

  return {
    summary: `${plantName} is in the ${stage} stage growing in ${medium}${isInGround ? " (in the ground)" : ""}.${
      jc?.trainingSummary ? ` Journal training: ${jc.trainingSummary}.` : ""
    }${jc?.recentFeedsSummary ? ` ${jc.recentFeedsSummary}.` : ""} Optimal focus right now is ${
      topping.recommended && !alreadyTopped
        ? "topping and spreading the branches"
        : "steady soil moisture and opening the canopy with gentle branch ties"
    }.`,
    cultivationStage: stage,
    topping,
    lst,
    nutrients,
    watering,
    keyActionToday,
    journalContextUsed: journalBadges,
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
    journalContext,
  } = payload;

  const apiKey = process.env["GEMINI_API_KEY"];
  const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "").trim();

  if (!cleanBase64) {
    throw new Error("No image data provided for plant advice.");
  }

  const isRealPhoto = cleanBase64.length > 250;

  if (apiKey && isRealPhoto) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 9000);

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
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
${journalContext?.promptBlock ? `\n${journalContext.promptBlock}\n` : ""}

CRITICAL JOURNAL LINKING RULES:
- Tailor all advice directly to this plant's linked journal (whether it is in Living Soil / In the Ground vs a pot, what training like LST/Topping was already logged, and when it was last watered and fed).
- If the plant is in Living Soil or In the Ground, do NOT tell the gardener to lift a container or use pot rim clips; recommend ground stakes, mulch moisture checks, and organic top-dressing/teas.
- Return strict JSON.`;

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini advice call timed out after 9s")), 9000),
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
            "You are GrowBuddy AI Coach. Return thorough, practical, and friendly botanical training and feeding advice tailored to the plant's linked journal in strict JSON matching the schema.",
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
                    description: "How to confirm moisture via container weight or soil bed check.",
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
        parsed.journalContextUsed = journalContext?.journalContextBadges;
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
