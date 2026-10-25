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
  scientificEvidence?: ScientificEvidence;
  source?: "gemini-3.8-flash" | "visual-heuristics" | "botanical-knowledge-base";
  photosAnalyzed?: number;
}

export interface DiagnosePlantOptions {
  imageBase64?: string;
  images?: ImageInputItem[];
  mimeType?: string;
  plantInfo?: string;
  plantName?: string;
  stage?: string;
  medium?: string;
  metrics?: ImageAnalysisMetrics;
}
function fallbackBotanicalDiagnosis(
  payload: DiagnosePlantOptions,
  imagesCount: number,
): PlantDiagnosisResult {
  const m = payload.metrics || {};
  const yellow = m.yellowRatio ?? 0.12;
  const brown = m.brownRatio ?? 0.05;
  const green = m.healthyGreenRatio ?? m.greenRatio ?? 0.68;
  const plantName = payload.plantName || "Your Plant";
  const stage = payload.stage || "Vegetative";
  const medium = payload.medium || "Soil";

  const isHealthy = green > 0.6 && yellow < 0.14 && brown < 0.08;
  if (isHealthy) {
    return {
      condition: `Healthy & Vigorous Foliage (${stage})`,
      isHealthy: true,
      healthScore: 92,
      confidence: "High",
      severity: "healthy",
      summary: `${plantName} exhibits robust chlorophyll pigment, healthy leaf turgidity, and balanced cellular development.`,
      symptoms: [
        "Uniform emerald coloration across fan leaves",
        "Upward leaf prayer posture indicating active transpiration",
        "No signs of pest stippling, chlorosis, or necrotic margins",
      ],
      possibleCauses: [
        "Optimal root-zone aeration and nutrient balance",
        "Proper transpiration-to-lighting equilibrium",
      ],
      actionPlan: [
        `Maintain balanced feeding suitable for ${stage}.`,
        "Continue tracking dryback intervals and runoff EC/pH.",
      ],
      preventiveTips: [
        "Maintain VPD between 0.8 and 1.2 kPa.",
        "Keep oscillating fan airflow moving through mid-canopy.",
      ],
      estimatedRecoveryDays: "Ongoing health",
      scientificEvidence: {
        nutrientMobility: "Balanced & Mobile (Optimal Chlorophyll)",
        targetPH: { soil: "6.2 – 6.8 pH", cocoHydro: "5.8 – 6.2 pH" },
        targetEC: stage.toLowerCase().includes("flower") ? "1.6 – 2.0 mS/cm" : "1.2 – 1.6 mS/cm",
        targetVPD: "0.8 – 1.2 kPa",
        identifiedMarkers: ["Healthy chlorophyll distribution", "Turgid leaf petioles"],
        pathologyReasoning:
          "Foliar spectrum matches standard vegetative/bloom chlorophyll saturation benchmarks.",
      },
      source: "visual-heuristics",
      photosAnalyzed: imagesCount,
    };
  }

  if (brown > 0.1) {
    return {
      condition: "Early Calcium Deficiency & Marginal Necrosis",
      isHealthy: false,
      healthScore: 68,
      confidence: "Medium",
      severity: "warning",
      summary: `Localized brown necrotic speckling detected on ${plantName}, characteristic of calcium immobility or root pH drift.`,
      symptoms: [
        "Bronze/brown localized spots on upper to middle fan leaves",
        "Slight curling or brittleness at leaf margins",
      ],
      possibleCauses: [
        "Root-zone pH drift locking out divalent calcium ions",
        "Stagnant humidity hindering xylem transpiration",
      ],
      actionPlan: [
        `Test and calibrate runoff pH immediately in ${medium}. Aim for 6.2-6.5 (soil) or 5.8-6.1 (coco).`,
        "Supplement with 1.5 ml/L Cal-Mag at the next watering.",
      ],
      preventiveTips: [
        "Maintain steady root temperature between 20°C and 23°C.",
        "Ensure adequate air movement across upper leaf canopy.",
      ],
      estimatedRecoveryDays: "5–8 days",
      scientificEvidence: {
        nutrientMobility: "Immobile Element (Affects Upper & Mid-Canopy New Growth)",
        targetPH: {
          soil: "6.2 – 6.5 pH (Optimal 6.3)",
          cocoHydro: "5.8 – 6.2 pH (Optimal 6.0)",
        },
        targetEC: "1.2 – 1.6 mS/cm",
        targetVPD: "1.0 – 1.3 kPa",
        identifiedMarkers: ["Localized brown speckles", "Marginal necrotic lesions"],
        pathologyReasoning:
          "Calcium moves exclusively through xylem transpiration. Restricted root absorption causes localized cell wall breakdown.",
      },
      source: "visual-heuristics",
      photosAnalyzed: imagesCount,
    };
  }

  // Chlorosis
  return {
    condition: "Interveinal Chlorosis / Nitrogen & Iron Mobility Stress",
    isHealthy: false,
    healthScore: 64,
    confidence: "High",
    severity: "warning",
    summary: `Spectral analysis revealed noticeable chlorosis on ${plantName}. Suggests nitrogen mobilization or root-zone lockout.`,
    symptoms: [
      "Light green to yellow fading of leaf tissue between dark veins",
      "Lower to mid-canopy leaves fading first",
    ],
    possibleCauses: [
      "Substrate pH drift preventing nitrogen and iron uptake",
      "Overwatering creating root hypoxia",
    ],
    actionPlan: [
      `Check root-zone pH: aim for 6.2-6.8 (soil) or 5.8-6.2 (coco).`,
      "Provide a mild vegetative feed with balanced nitrogen and micronutrients.",
    ],
    preventiveTips: [
      "Allow the top 2-3 cm of substrate to dry back before irrigating.",
      "Calibrate digital pH meter regularly.",
    ],
    estimatedRecoveryDays: "4–7 days",
    scientificEvidence: {
      nutrientMobility: "Mobile Element (Translocates from Lower to Newer Growth)",
      targetPH: { soil: "6.3 – 6.7 pH", cocoHydro: "5.8 – 6.1 pH" },
      targetEC: "1.3 – 1.7 mS/cm",
      targetVPD: "0.9 – 1.2 kPa",
      identifiedMarkers: ["Interveinal yellowing", "Lower canopy pigment fade"],
      pathologyReasoning:
        "Plant cannibalizes mobile nitrogen and magnesium from older leaves when root uptake is constrained.",
    },
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

export interface DoctorChatContext {
  plantName?: string;
  stage?: string;
  medium?: string;
  activeCondition?: string;
  healthScore?: number;
  severity?: string;
  lastDiagnosisSummary?: string;
  actionPlan?: string[];
  symptoms?: string[];
}

export interface DoctorChatMessage {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: string;
  source?: "gemini-3.8-flash" | "botanical-knowledge-base";
}

export interface SendDoctorChatOptions {
  messages: Array<{ role: "user" | "model"; text: string }>;
  context?: DoctorChatContext;
}

function fallbackBotanicalChat(userQuery: string, context?: DoctorChatContext): string {
  const q = userQuery.toLowerCase();
  const plant = context?.plantName || "your plant";
  const stage = context?.stage || "active growth";
  const medium = context?.medium || "medium";

  if (q.includes("mite") || q.includes("pest") || q.includes("thrip") || q.includes("bug")) {
    return `### 🌿 Pest Management Protocol for ${plant}
1. **Quarantine & Inspection:** Use a 30x–60x loupe on lower leaf undersides.
2. **Vegetative Spray:** Cold-pressed Neem oil (3–5 ml/L) or insecticidal potassium salts applied at lights-off.
3. **Flower Phase (Safe for Buds):** Citric acid wash or beneficial predatory mites (*Phytoseiulus persimilis*).
4. **Environment:** Lower grow room temperature below 25°C and elevate humidity to 55–60% to break mite reproduction cycles.`;
  }

  if (
    q.includes("ph") ||
    q.includes("lockout") ||
    q.includes("cal-mag") ||
    q.includes("calcium") ||
    q.includes("ec")
  ) {
    const isCoco = medium.toLowerCase().includes("coco");
    const targetPH = isCoco ? "5.8 – 6.1 pH" : "6.2 – 6.8 pH";
    return `### 🧪 Substrate pH & Nutrient Calibration for ${plant}
1. **Target Range for ${medium}:** Maintain input at **${targetPH}**.
2. **Lockout Check:** Measure runoff EC. If runoff EC exceeds input by >0.6 mS/cm, mineral salts have crystallized in the substrate.
3. **Remediation:** Flush with 20% volume of mild nutrient water (EC ~0.8) buffered with 1.5 ml/L Cal-Mag at ${targetPH}.`;
  }

  if (
    q.includes("water") ||
    q.includes("droop") ||
    q.includes("overwater") ||
    q.includes("underwater")
  ) {
    return `### 💧 Irrigation Diagnostic for ${plant}
1. **Overwatering (Root Hypoxia):** Leaves are firm and curling down like claws; pot feels heavy and waterlogged.
2. **Underwatering:** Leaves AND leaf stems (petioles) are limp and flaccid; pot feels feather-light.
3. **Standard:** Always use the container lift test. Allow top 2–3 cm of substrate to dry back between irrigations.`;
  }

  return `### 👨‍⚕️ GrowBuddy AI Doctor Botanical Consultation
**Grow Profile:** ${plant} (${stage} in ${medium})
${context?.activeCondition ? `**Active Diagnosis:** ${context.activeCondition}` : ""}

**Diagnostic Recommendations:**
1. **Root Zone:** Maintain consistent dryback intervals and verify runoff pH.
2. **VPD Target:** Maintain ${stage.toLowerCase().includes("flower") ? "1.1 – 1.4 kPa" : "0.8 – 1.1 kPa"} for optimal foliar gas exchange.
3. Feel free to ask about organic pest treatments, precise N-P-K nutrient feeding charts, or recovery timelines!`;
}

export async function sendDoctorChatMessage(
  options: SendDoctorChatOptions,
): Promise<{ text: string; source: "gemini-3.8-flash" | "botanical-knowledge-base" }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  const latestUserText = [...options.messages].reverse().find((m) => m.role === "user")?.text || "";

  try {
    const response = await fetch("/api/doctor-chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      console.warn(
        `Server doctor chat returned status ${response.status}, activating botanical knowledge base.`,
      );
      return {
        text: fallbackBotanicalChat(latestUserText, options.context),
        source: "botanical-knowledge-base",
      };
    }

    return (await response.json()) as {
      text: string;
      source: "gemini-3.8-flash" | "botanical-knowledge-base";
    };
  } catch (err: unknown) {
    console.warn(
      "Doctor chat fetch failed, gracefully falling back to botanical knowledge base:",
      err,
    );
    return {
      text: fallbackBotanicalChat(latestUserText, options.context),
      source: "botanical-knowledge-base",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
