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

export type PhotoSlotType = "canopy" | "macro" | "substrate" | "general";

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

export interface LinkedJournalContextPayload {
  plantId?: string | undefined;
  plantName?: string | undefined;
  strain?: string | undefined;
  plantType?: string | undefined;
  setting?: string | undefined;
  medium?: string | undefined;
  stage?: string | undefined;
  ageDays?: number | undefined;
  stageDays?: number | undefined;
  isLivingSoil?: boolean | undefined;
  isInGround?: boolean | undefined;
  recentWaterSummary?: string | undefined;
  recentFeedsSummary?: string | undefined;
  trainingSummary?: string | undefined;
  journalContextBadges?: string[] | undefined;
  promptBlock?: string | undefined;
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
  source?: "gemini-3.8-flash" | "visual-heuristics" | undefined;
  photosAnalyzed?: number | undefined;
}

export interface DiagnoseRequestPayload {
  imageBase64?: string | undefined;
  mimeType?: string | undefined;
  images?: ImageInputItem[] | undefined;
  plantInfo?: string | undefined;
  plantName?: string | undefined;
  stage?: string | undefined;
  medium?: string | undefined;
  journalContext?: LinkedJournalContextPayload | undefined;
  metrics?: ImageAnalysisMetrics | undefined;
}

// Friendly, plain-English home-gardener evaluator that analyzes measured leaf colors AND the plant's linked journal
function evaluateFromVisualMetrics(payload: DiagnoseRequestPayload): PlantDiagnosisResult {
  const allMetrics: ImageAnalysisMetrics[] = [];
  if (payload.metrics) allMetrics.push(payload.metrics);
  if (payload.images) {
    for (const img of payload.images) {
      if (img.metrics) allMetrics.push(img.metrics);
    }
  }

  const yellow =
    allMetrics.length > 0 ? Math.max(...allMetrics.map((m) => m.yellowRatio ?? 0)) : 0.15;
  const brown =
    allMetrics.length > 0 ? Math.max(...allMetrics.map((m) => m.brownRatio ?? 0)) : 0.05;
  const darkGreen =
    allMetrics.length > 0 ? Math.max(...allMetrics.map((m) => m.darkGreenRatio ?? 0)) : 0.05;
  const brightness = allMetrics.length > 0 ? (allMetrics[0]!.averageBrightness ?? 128) : 128;

  const jc = payload.journalContext;
  const plantName = jc?.plantName || payload.plantName || "Your plant";
  const stage = jc?.stage || payload.stage || "Vegetative";
  const medium = jc?.medium || payload.medium || "Soil";
  const setting = jc?.setting || "Outdoor";

  const combinedContextLower =
    `${medium} ${payload.plantInfo || ""} ${jc?.promptBlock || ""}`.toLowerCase();
  const isLivingSoil = Boolean(
    jc?.isLivingSoil ||
    combinedContextLower.includes("living soil") ||
    combinedContextLower.includes("no-till"),
  );
  const isInGround = Boolean(
    jc?.isInGround ||
    combinedContextLower.includes("in the ground") ||
    combinedContextLower.includes("in ground") ||
    combinedContextLower.includes("garden bed"),
  );

  const waterNote = jc?.recentWaterSummary ? ` (${jc.recentWaterSummary})` : "";
  const feedNote = jc?.recentFeedsSummary ? ` (${jc.recentFeedsSummary})` : "";
  const trainingNote =
    jc?.trainingSummary && !jc.trainingSummary.toLowerCase().includes("untrained")
      ? ` Your journal shows ${jc.trainingSummary.toLowerCase()}, and the canopy is responding well.`
      : "";

  const journalBadges = jc?.journalContextBadges || [
    `🌱 ${plantName} (${stage})`,
    `🌍 ${setting} · ${medium}`,
    ...(jc?.recentWaterSummary ? [`💧 ${jc.recentWaterSummary}`] : []),
    ...(jc?.recentFeedsSummary ? [`🧪 ${jc.recentFeedsSummary}`] : []),
    ...(jc?.trainingSummary ? [`✂️ ${jc.trainingSummary}`] : []),
  ];

  const chlorosisPenalty = Math.min(45, yellow * 80);
  const necrosisPenalty = Math.min(50, brown * 120);
  const nitrogenToxicityPenalty = Math.min(20, darkGreen * 40);
  const exposurePenalty = brightness < 40 || brightness > 220 ? 10 : 0;

  const rawScore = Math.round(
    100 - chlorosisPenalty - necrosisPenalty - nitrogenToxicityPenalty - exposurePenalty,
  );
  const healthScore = Math.max(15, Math.min(98, rawScore));

  const isHealthy = healthScore >= 85 && brown < 0.08 && yellow < 0.12;

  if (isHealthy) {
    return {
      condition: `Happy & Healthy Plant (${stage})`,
      isHealthy: true,
      healthScore,
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
        `Good watering rhythm${waterNote} and balanced plant nutrition${feedNote}`,
        "Comfortable temperature and sunlight",
      ],
      actionPlan: [
        `Keep doing what you're doing! Continue your current ${stage} care routine for ${plantName}.${feedNote}`,
        isInGround || isLivingSoil
          ? "Check soil moisture 2 inches under the mulch or top layer with your finger before watering so the living soil stays evenly moist (never bone-dry or swampy)."
          : "Feel the top inch of soil with your finger before watering so you don't overwater.",
        "Take a quick peek under a few leaves once a week just to make sure no garden bugs move in.",
      ],
      preventiveTips: [
        isLivingSoil || isInGround
          ? "Keep a healthy layer of straw or leaf mulch over your living soil in the ground to keep microbes cool and hold moisture."
          : "Keep a gentle breeze moving around the plant so fresh air reaches all the leaves.",
        isInGround
          ? "Water deeply around the drip-line in the morning so deep ground roots stay cool on warm days."
          : "Avoid letting the pot sit in a saucer of standing water after watering.",
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
        identifiedMarkers: [
          "Rich green leaf colour",
          "Perky upward leaves",
          "Clean, undamaged leaf edges",
        ],
        pathologyReasoning:
          "In plain terms: your plant is getting the right amount of water, light, and plant food from its soil, so the leaves are full of healthy green energy.",
      },
      journalContextUsed: journalBadges,
      source: "visual-heuristics",
    };
  }

  if (brown > 0.12 || (brown > yellow && brown > 0.06)) {
    const isSevere = brown > 0.25 || healthScore < 50;
    return {
      condition: isSevere
        ? "Brown Spots & Crispy Leaf Edges (Needs Quick Care)"
        : "Needs a Little Calcium & Magnesium (Small Brown Spots on Leaves)",
      isHealthy: false,
      healthScore,
      confidence: "Medium",
      severity: isSevere ? "critical" : "warning",
      summary: `We noticed some small brown or rusty spots and crispy leaf tips on ${plantName} (${setting} · ${medium}).${feedNote}${waterNote} For a home gardener, this usually means the plant needs a little extra calcium & magnesium, or the top layer of ${medium.toLowerCase()} dried out between waterings.${trainingNote}`,
      symptoms: [
        "Small brown or rust-coloured spots on the leaves",
        "Crispy, dry, or slightly curled leaf tips",
        "A few upper or middle leaves looking patchy",
      ],
      possibleCauses: [
        `The plant is hungry for a little extra calcium or magnesium during ${stage}`,
        isLivingSoil || isInGround
          ? `Top layer of ${medium.toLowerCase()} drying out in warm sun, which slows down how soil microbes deliver calcium to the roots`
          : "Slightly too much strong fertilizer built up in the pot or soil drying out too fast",
      ],
      actionPlan: [
        isLivingSoil || isInGround
          ? `Water ${plantName} deeply and evenly across the ground bed so the living soil is nicely hydrated${waterNote}.`
          : `Give ${plantName} a good watering with plain water first to rinse out any leftover fertilizer buildup in your ${medium}.`,
        isLivingSoil
          ? `Water in a gentle organic calcium/magnesium boost (like a pinch of Epsom salts, worm castings tea, or your saved diluted homemade fertilizer${feedNote}).`
          : "On the next feed, add a small dose of Calcium-Magnesium (Cal-Mag) or a gentle balanced liquid plant food.",
        "Snip off any dead, super-crispy brown leaves so the plant puts its energy into fresh new growth.",
      ],
      preventiveTips: [
        isInGround || isLivingSoil
          ? "Add a 2–3 cm mulch layer (straw, bark, or compost) over the ground soil so the surface roots never bake in the sun."
          : "Don't let the pot dry out bone-dry in the sun between waterings.",
        isLivingSoil
          ? "Feed the soil gently with compost teas or diluted homemade brews rather than heavy synthetic salts."
          : "When feeding liquid nutrients, alternate with plain water every second watering in soil.",
      ],
      estimatedRecoveryDays: "5–10 days for new leaves to look normal",
      scientificEvidence: {
        nutrientMobility: "Affects Newer / Middle Leaves First (Calcium)",
        targetPH: {
          soil: "6.2 – 6.5 pH (Ideal 6.3)",
          cocoHydro: "5.8 – 6.2 pH (Ideal 6.0)",
        },
        targetEC: isLivingSoil
          ? "Organic Tea / Top-Dress (1.0 – 1.4 mS/cm)"
          : "1.2 – 1.6 mS/cm (Gentle Feed)",
        targetVPD: "Moderate Airflow & Humidity",
        identifiedMarkers: [
          `Spotted ${Math.round(brown * 100)}% brown / rusty leaf patches`,
          "Small brown speckles on leaves",
          "Dry or crispy leaf tips",
        ],
        pathologyReasoning:
          "In plain terms: calcium helps build strong leaf walls. When the roots can't drink up enough water and calcium smoothly, small brown rusty spots show up on the leaves.",
      },
      journalContextUsed: journalBadges,
      source: "visual-heuristics",
    };
  }

  if (yellow > 0.18) {
    return {
      condition: "Hungry Plant — Needs a General Feed (Yellowing Leaves)",
      isHealthy: false,
      healthScore,
      confidence: "High",
      severity: healthScore < 60 ? "warning" : "mild",
      summary: `Some of the leaves on ${plantName} (${setting} · ${medium}) are fading to light green or yellow.${feedNote}${waterNote} In everyday home gardening, this simply means ${plantName} is hungry for a feed to support its ${stage} growth (and any ${jc?.trainingSummary && !jc.trainingSummary.includes("Untrained") ? "trained branches" : "new shoots"}), or the soil has been staying a bit too wet.`,
      symptoms: [
        "Leaves turning pale green or yellow while the veins stay darker",
        "Lower and older leaves fading first",
        "Plant growth looking a little slower than usual",
      ],
      possibleCauses: [
        isLivingSoil || isInGround
          ? `${plantName} is drawing heavily on its ${medium.toLowerCase()} in the ground and is ready for a top-dress of compost/worm castings or a diluted liquid feed${feedNote}`
          : `Your plant has used up the food in its ${medium} and is hungry for a feed${feedNote}`,
        `Soil staying a bit too wet or cool around the roots${waterNote}`,
      ],
      actionPlan: [
        isInGround || isLivingSoil
          ? "Feel the soil 2 inches below the surface with your finger — make sure it's moist like a wrung-out sponge, not soggy, before watering again."
          : "Wait until the top inch (2–3 cm) of soil feels dry to your finger before watering again.",
        isLivingSoil
          ? `Give ${plantName} a gentle organic boost in its living soil: top-dress around the base with worm castings/compost or water in one of your saved diluted homemade brews (like nettle, comfrey, or seaweed tea).`
          : "Give a normal diluted dose of all-purpose or vegetative liquid fertilizer at your next watering.",
        "Remove any completely yellow, limp bottom leaves that come off with a gentle tug.",
      ],
      preventiveTips: [
        isInGround
          ? "In outdoor ground beds, water deeply and less often so the roots stretch deep into the rich earth."
          : "Lift the pot to feel how light it is before watering — a heavy pot still has plenty of water.",
        "Use your saved homemade or bottled fertilizers from your Fertilizer Journal at the recommended dilution rate.",
      ],
      estimatedRecoveryDays: "4–7 days to green back up",
      scientificEvidence: {
        nutrientMobility: "Starts on Lower / Older Leaves First (Nitrogen)",
        targetPH: { soil: "6.3 – 6.7 pH", cocoHydro: "5.8 – 6.1 pH" },
        targetEC: isLivingSoil
          ? "Organic Brew / Top-Dress (1.2 – 1.5 mS/cm)"
          : "1.3 – 1.7 mS/cm (Regular Feed)",
        targetVPD: "Mild Temp & Humidity",
        identifiedMarkers: [
          `Spotted ${Math.round(yellow * 100)}% yellowing on leaves`,
          "Pale yellow leaf colour between green veins",
          "Lower leaves fading first",
        ],
        pathologyReasoning:
          "In plain terms: when a plant runs low on everyday food like nitrogen, it borrows energy from its older bottom leaves to feed the new top growth, causing the lower leaves to turn yellow.",
      },
      journalContextUsed: journalBadges,
      source: "visual-heuristics",
    };
  }

  return {
    condition: "Mild Heat or Bright Light Stress (Slightly Faded Leaves)",
    isHealthy: false,
    healthScore,
    confidence: "Medium",
    severity: "mild",
    summary: `${plantName} (${setting} · ${medium}) has slightly pale leaves and mildly curled edges.${waterNote} This usually happens when the sun is extra hot outdoors or an indoor grow light is sitting a little too close.${trainingNote}`,
    symptoms: [
      "Top leaves look slightly washed out or pale",
      "Leaf edges curling upward slightly like a taco to shade themselves",
    ],
    possibleCauses: [
      setting === "Outdoor"
        ? "Strong midday sun or warm wind making the leaves thirsty faster than the roots can drink"
        : "Hot afternoon sun or indoor grow light positioned a bit too close",
      `Top layer of ${medium.toLowerCase()} getting warm during the day`,
    ],
    actionPlan: [
      setting === "Indoor"
        ? "Move your indoor grow light up a few inches (5–10 cm) or dim it slightly for a couple of days."
        : "In hot outdoor sun, give the plant a little afternoon shade cloth or water deeply in the cool morning hours.",
      isInGround || isLivingSoil
        ? "Spread a fresh layer of straw or compost mulch over the ground around the stem to keep the living soil and roots cool."
        : "Water thoroughly when the top inch of soil feels dry.",
    ],
    preventiveTips: [
      "Water in the early morning or evening rather than in the middle of the hot midday sun.",
      isLivingSoil || isInGround
        ? "A gentle seaweed/kelp tea drench helps outdoor ground plants handle heat and bright sun with ease."
        : "Try to keep daytime temperatures around the plant below 27°C when possible.",
    ],
    estimatedRecoveryDays: "3–5 days",
    scientificEvidence: {
      nutrientMobility: "Whole-Plant Weather / Light Comfort",
      targetPH: { soil: "6.2 – 6.8 pH", cocoHydro: "5.8 – 6.2 pH" },
      targetEC: "1.0 – 1.4 mS/cm",
      targetVPD: "Keep Air Cool & Breezy",
      identifiedMarkers: [
        "Slightly faded upper leaves",
        "Mild upward curl on leaf edges",
        "Top leaves brighter than lower leaves",
      ],
      pathologyReasoning:
        "In plain terms: just like people get sunburned on a hot day, leaves curl their edges upward and fade slightly when the light or heat is a bit too strong.",
    },
    journalContextUsed: journalBadges,
    source: "visual-heuristics",
  };
}

export async function handleDiagnosePlant(
  payload: DiagnoseRequestPayload,
): Promise<PlantDiagnosisResult> {
  const { plantInfo = "", plantName = "", journalContext } = payload;
  const apiKey = process.env["GEMINI_API_KEY"];

  const normalizedImages: ImageInputItem[] = [];
  if (payload.images && payload.images.length > 0) {
    for (const img of payload.images) {
      if (img.imageBase64) {
        normalizedImages.push({
          ...img,
          imageBase64: img.imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "").trim(),
          mimeType: img.mimeType || "image/jpeg",
        });
      }
    }
  } else if (payload.imageBase64) {
    normalizedImages.push({
      imageBase64: payload.imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "").trim(),
      mimeType: payload.mimeType || "image/jpeg",
      slot: "canopy",
      label: "Primary Plant Photo",
      metrics: payload.metrics,
    });
  }

  if (normalizedImages.length === 0 || !normalizedImages[0]?.imageBase64) {
    throw new Error("No image data provided for diagnosis.");
  }

  const isRealPhoto = (normalizedImages[0]?.imageBase64.length ?? 0) > 250;

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

    const slotAngleMap: Record<PhotoSlotType, string> = {
      canopy: "Whole Plant View (Overall leaf colour, perkiness vs drooping, general health)",
      macro: "Close-up Leaf View (Checking for tiny garden bugs, spots, or mould)",
      substrate: "Soil / Ground / Pot View (Checking soil moisture, mulch, and root health)",
      general: "Plant Photo",
    };

    const angleBreakdown = normalizedImages
      .map((img, idx) => {
        const desc = slotAngleMap[img.slot || "general"] || "Plant Angle";
        return `- Photo ${idx + 1}: ${desc}${img.label ? ` - "${img.label}"` : ""}`;
      })
      .join("\n");

    const prompt = `You are a friendly, down-to-earth backyard gardening helper talking to a casual home gardener.
You are looking at ${normalizedImages.length} photo(s) of their plant:
${angleBreakdown}

${plantName ? `Plant Name: "${plantName}"` : ""}
${plantInfo ? `Gardener's Notes & Context: ${plantInfo}` : ""}
${journalContext?.promptBlock ? `\n${journalContext.promptBlock}\n` : ""}

CRITICAL RULES FOR TAILORING TO THE PLANT'S LINKED JOURNAL:
1. You MUST tailor your diagnosis, summary, causes, and action plan directly to this plant's linked journal!
   - If the plant is in "Living Soil" or "In the Ground", NEVER tell the gardener to "lift the pot", "check the runoff saucer", or "flush the pot with synthetic salts". Instead, give practical in-ground / living-soil home-gardener advice (e.g. checking soil moisture under the mulch, top-dressing with compost/worm castings, or watering in a diluted organic homemade brew).
   - Explicitly mention and take into account the plant's logged watering history (${journalContext?.recentWaterSummary || "see context"}), feeding history (${journalContext?.recentFeedsSummary || "see context"}), and training history (${journalContext?.trainingSummary || "see context"}).
2. Write EVERYTHING in simple, warm, everyday plain English for a casual home gardener!
3. AVOID heavy scientific or textbook jargon (do NOT use words like "interveinal chlorosis", "necrotic margins", "turgidity", "xylem transpiration", "divalent ions", or "hypoxia").
4. In scientificEvidence.targetPH, always include "pH" in the strings (e.g., "6.2 - 6.8 pH" and "5.8 - 6.2 pH"), and make pathologyReasoning a friendly 1-2 sentence "In plain English: ..." explanation of why the plant looks this way.`;

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini API call timed out after 9s")), 9000),
      );

      const imageParts = normalizedImages.map((img) => ({
        inlineData: {
          mimeType: img.mimeType || "image/jpeg",
          data: img.imageBase64,
        },
      }));

      const geminiPromise = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [...imageParts, { text: prompt }],
          },
        ],
        config: {
          abortSignal: abortController.signal,
          systemInstruction:
            "You are a friendly home gardening helper. Tailor your diagnosis to the plant's linked journal (medium, living soil/in-ground status, watering, feeding, and training logs), explain everything in simple plain English for a casual home gardener, and return strict JSON matching the schema.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              condition: {
                type: Type.STRING,
                description:
                  "Simple, plain-English name of the plant's condition (e.g., 'Happy & Healthy Plant', 'Hungry Plant — Needs a Feed (Yellowing Leaves)', 'Needs Calcium (Brown Spots)').",
              },
              isHealthy: {
                type: Type.BOOLEAN,
                description: "True if plant is healthy without signs of disease or pest.",
              },
              healthScore: {
                type: Type.NUMBER,
                description: "Overall health score integer from 0 to 100.",
              },
              confidence: {
                type: Type.STRING,
                description: "Diagnosis confidence: High, Medium, or Low.",
              },
              severity: {
                type: Type.STRING,
                description: "Severity level: healthy, mild, warning, or critical.",
              },
              summary: {
                type: Type.STRING,
                description:
                  "2-3 warm, plain-English sentences explaining how the plant looks and how it connects to its journal (medium, feeding, watering, and training).",
              },
              symptoms: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Simple list of what we can see on the leaves in everyday language.",
              },
              possibleCauses: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "Simple, everyday reasons why this happens based on the plant's setup and journal.",
              },
              actionPlan: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  "Easy, step-by-step instructions tailored to the plant's medium (e.g. living soil in the ground vs pot) and journal.",
              },
              preventiveTips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Simple everyday tips to keep the plant happy.",
              },
              estimatedRecoveryDays: {
                type: Type.STRING,
                description:
                  "Estimated days to bounce back (e.g., '4-7 days', 'Already healthy!').",
              },
              scientificEvidence: {
                type: Type.OBJECT,
                properties: {
                  nutrientMobility: {
                    type: Type.STRING,
                    description:
                      "Simple description of where on the plant it shows up (e.g., 'Starts on Lower Leaves First', 'Shows on Upper Leaves First', 'All-Round Healthy').",
                  },
                  targetPH: {
                    type: Type.OBJECT,
                    properties: {
                      soil: {
                        type: Type.STRING,
                        description:
                          "Target soil pH (must include the word 'pH', e.g. '6.2 - 6.8 pH')",
                      },
                      cocoHydro: {
                        type: Type.STRING,
                        description:
                          "Target coco/hydro pH (must include the word 'pH', e.g. '5.8 - 6.2 pH')",
                      },
                    },
                    required: ["soil", "cocoHydro"],
                  },
                  targetEC: {
                    type: Type.STRING,
                    description: "Simple feeding strength guide.",
                  },
                  targetVPD: {
                    type: Type.STRING,
                    description: "Simple temperature and humidity comfort range.",
                  },
                  identifiedMarkers: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Simple visual clues spotted in the photo.",
                  },
                  pathologyReasoning: {
                    type: Type.STRING,
                    description:
                      "Friendly plain-English explanation of why the plant is reacting this way.",
                  },
                },
                required: [
                  "nutrientMobility",
                  "targetPH",
                  "targetEC",
                  "targetVPD",
                  "identifiedMarkers",
                  "pathologyReasoning",
                ],
              },
            },
            required: [
              "condition",
              "isHealthy",
              "healthScore",
              "confidence",
              "severity",
              "summary",
              "symptoms",
              "possibleCauses",
              "actionPlan",
              "preventiveTips",
              "estimatedRecoveryDays",
            ],
          },
        },
      });

      const response = await Promise.race([geminiPromise, timeoutPromise]);
      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text) as PlantDiagnosisResult;
        parsed.source = "gemini-3.8-flash";
        parsed.photosAnalyzed = normalizedImages.length;
        parsed.journalContextUsed = journalContext?.journalContextBadges;
        return parsed;
      }
    } catch (err: unknown) {
      console.warn(
        "Gemini response timed out or unavailable, instantly falling back to visual metric evaluation:",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const fallbackResult = evaluateFromVisualMetrics({ ...payload, images: normalizedImages });
  fallbackResult.photosAnalyzed = normalizedImages.length;
  return fallbackResult;
}
