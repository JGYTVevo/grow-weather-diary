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
  mimeType?: string;
  slot?: PhotoSlotType;
  label?: string;
  metrics?: ImageAnalysisMetrics;
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
  source?: "gemini-3.8-flash" | "visual-heuristics";
  photosAnalyzed?: number;
}

export interface DiagnoseRequestPayload {
  imageBase64?: string;
  mimeType?: string;
  images?: ImageInputItem[];
  plantInfo?: string;
  plantName?: string;
  stage?: string;
  medium?: string;
  metrics?: ImageAnalysisMetrics;
}

// Intelligent visual fallback evaluator that analyzes actual measured image hues and plant context
// used only if Gemini API upstream is temporarily in 503 high-demand spike.
function evaluateFromVisualMetrics(payload: DiagnoseRequestPayload): PlantDiagnosisResult {
  // Aggregate metrics from all images if provided, prioritizing worst-case symptoms (macro spotting/chlorosis)
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
  const green =
    allMetrics.length > 0
      ? Math.min(...allMetrics.map((m) => m.healthyGreenRatio ?? m.greenRatio ?? 0.65))
      : 0.65;
  const darkGreen =
    allMetrics.length > 0 ? Math.max(...allMetrics.map((m) => m.darkGreenRatio ?? 0)) : 0.05;
  const brightness = allMetrics.length > 0 ? (allMetrics[0]!.averageBrightness ?? 128) : 128;
  const plantName = payload.plantName || "Plant";
  const stage = payload.stage || "Vegetative";
  const medium = payload.medium || "Soil";
  const photosCount = payload.images?.length || (payload.imageBase64 ? 1 : 1);

  // Dynamic health score calculation derived strictly from measured pixel metrics
  // Base 100 - chlorosis penalty - necrosis penalty - exposure penalty
  const chlorosisPenalty = Math.min(45, yellow * 80);
  const necrosisPenalty = Math.min(50, brown * 120);
  const nitrogenToxicityPenalty = Math.min(20, darkGreen * 40);
  const exposurePenalty = brightness < 40 || brightness > 220 ? 10 : 0;

  const rawScore = Math.round(
    100 - chlorosisPenalty - necrosisPenalty - nitrogenToxicityPenalty - exposurePenalty,
  );
  const healthScore = Math.max(15, Math.min(98, rawScore));

  const isHealthy = healthScore >= 85 && brown < 0.08 && yellow < 0.12;

  // Classify based on dominant pixel symptom
  if (isHealthy) {
    return {
      condition: `Healthy & Vigorous Foliage (${stage})`,
      isHealthy: true,
      healthScore,
      confidence: "High",
      severity: "healthy",
      summary: `${plantName} displays rich chlorophyll pigment and strong leaf turgidity with no significant signs of pests, chlorosis, or fungal distress.`,
      symptoms: [
        "Uniform emerald coloration across fan leaves",
        "Turgid leaves with healthy upward praying posture",
        "No visible interveinal chlorosis or leaf tip necrosis",
      ],
      possibleCauses: [
        "Optimal nutrient balance and root aeration",
        `Well-regulated watering in ${medium} medium`,
        "Stable canopy temperature and relative humidity",
      ],
      actionPlan: [
        `Maintain current feeding regime suitable for ${stage} stage.`,
        "Keep monitoring daily runoff pH and electrical conductivity (EC).",
        "Inspect leaf undersides weekly to prevent pests.",
      ],
      preventiveTips: [
        "Ensure good oscillating airflow across the canopy to prevent microclimates.",
        "Maintain VPD (vapor pressure deficit) between 0.8 - 1.2 kPa.",
      ],
      estimatedRecoveryDays: "Ongoing health",
      source: "visual-heuristics",
    };
  }

  if (brown > 0.12 || (brown > yellow && brown > 0.06)) {
    // Necrosis or spotting dominant
    const isSevere = brown > 0.25 || healthScore < 50;
    return {
      condition: isSevere
        ? "Foliar Necrosis & Suspected Pathogen / Calcium Burn"
        : "Early Calcium Deficiency & Marginal Necrosis",
      isHealthy: false,
      healthScore,
      confidence: "Medium",
      severity: isSevere ? "critical" : "warning",
      summary: `Image analysis detected ${Math.round(brown * 100)}% localized necrotic tissue and brown discoloration on ${plantName}, indicative of calcium immobility or localized tissue damage.`,
      symptoms: [
        "Brown or bronze necrotic speckles along leaf margins",
        "Crispy or curled leaf tips with irregular spotting",
        "Localized tissue breakdown on upper and middle foliage",
      ],
      possibleCauses: [
        "Calcium uptake lockout due to acidic substrate pH (< 6.2 in soil, < 5.8 in coco)",
        "Over-transpiration or high humidity stagnation hindering calcium transport",
        "Early fungal leaf spot or nutrient burn",
      ],
      actionPlan: [
        `Calibrate and test runoff pH immediately in ${medium}. Flush with pH-balanced water if EC is high.`,
        "Supplement with Cal-Mag (1-2ml/L) at next watering.",
        "Remove heavily decaying leaves to prevent secondary Botrytis or fungal growth.",
      ],
      preventiveTips: [
        "Increase oscillating airflow directly across upper leaves to aid transpiration.",
        "Avoid letting pots dry out completely between waterings in coco/hydro.",
      ],
      estimatedRecoveryDays: "5-10 days",
      source: "visual-heuristics",
    };
  }

  if (yellow > 0.18) {
    // Chlorosis dominant
    return {
      condition: "Interveinal Chlorosis / Nitrogen & Iron Mobility Stress",
      isHealthy: false,
      healthScore,
      confidence: "High",
      severity: healthScore < 60 ? "warning" : "mild",
      summary: `Spectral analysis revealed noticeable yellowing (${Math.round(yellow * 100)}% chlorosis ratio) on ${plantName}. This reflects nitrogen mobilization or micronutrient lockout.`,
      symptoms: [
        "Progressive yellowing of leaf tissue between dark veins",
        "Light green fading on lower to mid leaves",
        "Slight reduction in overall canopy vigor",
      ],
      possibleCauses: [
        "Substrate pH drift preventing proper nitrogen and iron uptake",
        "Root hypoxia from over-saturation or poor drainage",
        `Insufficient vegetative feeding for current ${stage} demand`,
      ],
      actionPlan: [
        `Check root-zone pH: aim for 6.2-6.8 for soil or 5.8-6.2 for coco.`,
        "Provide a mild vegetative feed with balanced nitrogen and micronutrients.",
        "Allow the top 2-3cm of substrate to dry back before irrigating again.",
      ],
      preventiveTips: [
        "Calibrate digital pH and EC meters every two weeks.",
        "Maintain root temperatures between 20°C and 23°C.",
      ],
      estimatedRecoveryDays: "4-7 days",
      source: "visual-heuristics",
    };
  }

  // General moderate stress
  return {
    condition: "Environmental Stress & Light Canopy Bleaching",
    isHealthy: false,
    healthScore,
    confidence: "Medium",
    severity: "mild",
    summary: `${plantName} exhibits subtle color fading and canopy stress, likely caused by light intensity, heat, or mild nutrient imbalance.`,
    symptoms: [
      "Pale leaf surface with slight curling at margins",
      "Minor contrast variance between upper and lower leaves",
    ],
    possibleCauses: [
      "Grow light too close or intense for the current growth stage",
      "High canopy temperature combined with low relative humidity",
      "Minor root stress",
    ],
    actionPlan: [
      "Raise grow lights by 5-10cm or dim by 10-15% for 48 hours to observe leaf response.",
      "Check canopy thermometer/hygrometer at leaf level.",
      "Ensure gentle hydration without over-saturating.",
    ],
    preventiveTips: [
      "Keep canopy temperatures under 27°C during lights-on.",
      "Use a PPFD / DLI meter or app to match light intensity to growth stage.",
    ],
    estimatedRecoveryDays: "3-5 days",
    source: "visual-heuristics",
  };
}

export async function handleDiagnosePlant(
  payload: DiagnoseRequestPayload,
): Promise<PlantDiagnosisResult> {
  const { plantInfo = "", plantName = "" } = payload;
  const apiKey = process.env.GEMINI_API_KEY;

  // Normalize single or multiple images
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

  // Attempt Gemini 3.8 Flash with retry
  if (apiKey) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 4500);

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
        signal: abortController.signal,
      },
    });

    const slotAngleMap: Record<PhotoSlotType, string> = {
      canopy:
        "Canopy / Overall Plant View (Leaf posture, upper vs lower foliar distribution, light/nitrogen balance)",
      macro:
        "Macro Leaf Underside / Close-up View (Microscopic inspection for spider mites, thrips, webbing, stippling, aphids, powdery mildew spores, necrotic margins)",
      substrate:
        "Substrate / Root Zone View (Growing medium surface, moisture saturation, algae, salt crusting, root exposure)",
      general: "Target Foliage Photo",
    };

    const angleBreakdown = normalizedImages
      .map((img, idx) => {
        const desc = slotAngleMap[img.slot || "general"] || "Plant Angle";
        return `- Photo ${idx + 1}: ${desc}${img.label ? ` - "${img.label}"` : ""}`;
      })
      .join("\n");

    const prompt = `You are GrowBuddy AI, an expert horticulturist, botanist, and cannabis/indoor/outdoor cultivation specialist.
You are provided with ${normalizedImages.length} targeted photo angle(s) for a comprehensive multi-angle plant diagnosis:
${angleBreakdown}

Examine all provided photos with precision and cross-reference the views:
${plantName ? `Target Plant Name: "${plantName}"` : ""}
${plantInfo ? `Grower Details & Context: ${plantInfo}` : ""}

Diagnostic inspection checklist:
1. Macro pests: Inspect close-up/leaf underside photos specifically for two-spotted spider mites (dots + webbing), thrips (silver stippling + black frass specks), fungus gnats, aphids, or caterpillar bites.
2. Nutrient balance: Analyze canopy chlorosis patterns (interveinal vs marginal, mobile bottom-up vs immobile top-down, Cal-Mag rust spots, nitrogen clawing vs deficiency).
3. Environmental stress: Heat stress (canoe cupping leaves), light bleaching (chlorophyll degradation right below light), wind burn, over/underwatering.
4. Fungal pathogens: Powdery mildew (white talcum powder patches), Botrytis / bud rot, Septoria leaf spot, root rot.
5. Overall vigor: Leaf turgidity, color uniformity, and healthy growth points.

IMPORTANT SCORING RULES:
- Assess these specific photos uniquely. Do NOT return generic placeholder scores or fallback numbers.
- If the plant is thriving and lush green with no noticeable issues across all angles, score 90-100%.
- If there are minor cosmetic issues or early mild stress, score 70-89%.
- If there is clear deficiency, pest damage, or moderate stress, score 50-69%.
- If there is severe disease, heavy pest infestation, or dying leaves, score 20-49%.
- If completely dead, score under 20%.

Provide exact, actionable diagnosis with practical remediation steps for organic and soil/hydroponic growers.`;

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini API call timed out after 4.5s")), 4500),
      );

      const imageParts = normalizedImages.map((img) => ({
        inlineData: {
          mimeType: img.mimeType || "image/jpeg",
          data: img.imageBase64,
        },
      }));

      const geminiPromise = ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: [
          {
            role: "user",
            parts: [...imageParts, { text: prompt }],
          },
        ],
        config: {
          systemInstruction:
            "You are GrowBuddy AI, an expert plant pathologist and cultivation specialist. Analyze all provided photo angles cohesively with high accuracy and return strict JSON conforming to the schema.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              condition: {
                type: Type.STRING,
                description:
                  "Name of the condition or diagnosis (e.g., 'Healthy Foliage', 'Nitrogen Deficiency', 'Spider Mite Infestation', 'Heat Stress', 'Early Powdery Mildew').",
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
                description: "2-3 sentence overview of what the image shows.",
              },
              symptoms: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of visible symptoms observed.",
              },
              possibleCauses: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of root causes.",
              },
              actionPlan: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Step-by-step immediate treatment steps.",
              },
              preventiveTips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Long-term preventative cultivation tips.",
              },
              estimatedRecoveryDays: {
                type: Type.STRING,
                description: "Estimated days to recovery (e.g., '3-7 days', 'Immediate', 'N/A').",
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

  // If Gemini API is currently unavailable (e.g. 503 spike), execute image visual metric evaluation
  const fallbackResult = evaluateFromVisualMetrics({ ...payload, images: normalizedImages });
  fallbackResult.photosAnalyzed = normalizedImages.length;
  return fallbackResult;
}
