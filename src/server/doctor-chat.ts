import { GoogleGenAI } from "@google/genai";

export interface ChatMessageItem {
  role: "user" | "model";
  text: string;
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

export interface DoctorChatPayload {
  messages: ChatMessageItem[];
  context?: DoctorChatContext;
}

export interface DoctorChatResult {
  text: string;
  source: "gemini-3.8-flash" | "botanical-knowledge-base";
}

// Built-in expert botanical & cannabis cultivation knowledge base for instant heuristic fallback
function generateBotanicalFallbackResponse(userQuery: string, context?: DoctorChatContext): string {
  const query = userQuery.toLowerCase();
  const plant = context?.plantName || "your plant";
  const stage = context?.stage || "active growth";
  const medium = context?.medium || "substrate";
  const condition = context?.activeCondition;

  // 1. Spider Mites / Broad Mites / Pests
  if (
    query.includes("mite") ||
    query.includes("spider") ||
    query.includes("web") ||
    query.includes("pest") ||
    query.includes("bug") ||
    query.includes("thrip") ||
    query.includes("aphid") ||
    query.includes("gnat")
  ) {
    return `### 🌿 Pest Control Protocol for ${plant} (${stage})

1. **Immediate Quarantine & Leaf Inspection:**
   - Inspect the **undersides of lower and mid-canopy leaves** using a 30x–60x jeweller's loupe.
   - Sponge or spray with cold water or insecticidal soap to mechanically knock down adult populations.

2. **Organic Foliar Treatments:**
   - **Vegetative Phase:** Cold-pressed Neem oil (3–5 ml/L) emulsified with organic dish soap, or horticultural potassium salts (insecticidal soap) sprayed right at lights-off / dusk to avoid leaf scorching.
   - **Flowering Phase (Safe for Buds):** Do NOT spray neem on flowers. Use **pure citric acid wash**, diluted hydrogen peroxide (3% diluted 1:4 with water), or predatory beneficial insects:
     * *Phytoseiulus persimilis* (high appetite spider mite predators)
     * *Amblyseius swirskii* (for thrips and broad mites)
     * *Hypoaspis miles* (for fungus gnat larvae in the soil)

3. **Substrate & Canopy Environment:**
   - If fungus gnats: let the top 2 inches of ${medium} thoroughly dry out and apply yellow sticky traps at pot rim level.
   - Increase air circulation: spider mites thrive in stagnant, hot, dry air (>27°C / <40% RH). Lower canopy temps and boost oscillating fan breeze.`;
  }

  // 2. pH Lockout / Cal-Mag / Nutrient Lockout
  if (
    query.includes("ph") ||
    query.includes("lockout") ||
    query.includes("cal-mag") ||
    query.includes("calcium") ||
    query.includes("magnesium") ||
    query.includes("ec") ||
    query.includes("ppm") ||
    query.includes("flush")
  ) {
    const isCoco = medium.toLowerCase().includes("coco");
    const isSoil = medium.toLowerCase().includes("soil");
    const targetPH = isSoil ? "6.2 – 6.8 pH" : "5.7 – 6.1 pH (optimal 5.8)";

    return `### 🧪 pH & Nutrient Lockout Diagnosis for ${plant}

1. **Target Substrate pH Range:**
   - Your medium: **${medium}** → Maintain **${targetPH}** input.
   - In ${isCoco ? "Coco Coir / Hydro" : "Soil"}, nutrient availability curves drop sharply outside this band. Iron and Cal-Mag lock out above 6.5 in coco; phosphorus and potassium lock out below 6.0 in soil.

2. **Lockout vs True Deficiency:**
   - Yellowing or rust spotting is almost always **salt crystallization or root zone pH drift**, NOT an actual lack of fertilizer.
   - Adding extra feed to locked-out roots increases EC, causing further osmotic root burn.

3. **Remediation Protocol:**
   - **Step 1:** Measure the runoff EC and runoff pH from the base of the container.
   - **Step 2:** If runoff EC is >2.2 mS/cm or pH is skewed, flush with 20–30% container volume of mild nutrient water (EC ~0.8) buffered with 1.5 ml/L Cal-Mag at ${targetPH}.
   - **Step 3:** Never flush with pure 0.0 EC RO water in coco—coco requires cation saturation (Ca/Mg) to avoid stripping the cation exchange sites.`;
  }

  // 3. Powdery Mildew / Mold / Bud Rot / Botrytis
  if (
    query.includes("mildew") ||
    query.includes("pm") ||
    query.includes("mold") ||
    query.includes("rot") ||
    query.includes("botrytis") ||
    query.includes("fungus")
  ) {
    return `### 🛡️ Fungal & Mildew Treatment Protocol

1. **Immediate Containment:**
   - Turn off oscillating fans before touching leaves to avoid dispersing spores throughout your grow space.
   - Carefully wipe visible white patches with wet paper towels soaked in 3% hydrogen peroxide or a 1:9 milk-to-water solution.
   - Prune heavily affected lower leaves directly into a sealed plastic bag.

2. **Environmental Correction (Root Cause):**
   - Powdery mildew spores germinate during rapid humidity spikes when lights go off.
   - Lower relative humidity to **40%–50%** in flower.
   - Ensure continuous gentle air movement around the lower third and inner branches of the canopy.

3. **Organic Sprays:**
   - **Potassium Bicarbonate:** 3g/L with a drop of organic castile soap elevates leaf surface pH, killing fungal mycelium upon contact.
   - **Bacillus subtilis / Bacillus amyloliquefaciens:** Biological fungicides that outcompete pathogenic spores on leaf margins.`;
  }

  // 4. Overwatering / Underwatering / Root Hypoxia
  if (
    query.includes("water") ||
    query.includes("droop") ||
    query.includes("overwater") ||
    query.includes("underwater") ||
    query.includes("dry") ||
    query.includes("lift")
  ) {
    return `### 💧 Irrigation & Foliar Turgor Diagnostic

1. **Distinguishing Overwatering vs Underwatering:**
   - **Overwatering (Hypoxia):** Leaves are firm, stiff, and curling downward from the stem like claws; leaf stems (petioles) may be horizontal while leaf blades curve down. Substrate feels heavy.
   - **Underwatering:** Both the leaf blade AND the petiole (leaf stem) are completely limp and limp-drooping. Substrate is pull-away dry from pot rims.

2. **The "Lift Test" Standard:**
   - Always verify water need by picking up the container. A dry pot feels surprisingly feather-light.
   - In ${medium}, water until approximately 10%–15% drains freely into runoff trays, then discard runoff promptly—never let containers sit in stagnant standing water.

3. **Dryback Cycles:**
   - Roots require oxygen (O2) just as much as water. Allow adequate dryback intervals between feeds so roots search outward and air can re-enter porous substrate pockets.`;
  }

  // 5. Lighting / VPD / Temperature & Humidity
  if (
    query.includes("vpd") ||
    query.includes("light") ||
    query.includes("burn") ||
    query.includes("temp") ||
    query.includes("humidity") ||
    query.includes("par") ||
    query.includes("ppfd")
  ) {
    return `### 💡 Lighting & VPD (Vapor Pressure Deficit) Targets

1. **Recommended VPD by Stage:**
   - **Seedling / Clone:** 0.6 – 0.8 kPa (24–26°C / 70–75% RH)
   - **Early Veg:** 0.8 – 1.0 kPa (25–27°C / 60–65% RH)
   - **Late Veg / Early Flower:** 1.0 – 1.2 kPa (24–26°C / 50–55% RH)
   - **Mid / Late Flower:** 1.2 – 1.5 kPa (22–24°C / 40–45% RH)

2. **PPFD & Light Distance:**
   - **Vegetative:** 400 – 600 µmol/m²/s
   - **Bloom:** 700 – 1000 µmol/m²/s (ensure good air flow and adequate calcium delivery)
   - **Signs of Light Stress:** Leaf margins serrating upwards (tacoing), yellowing top leaves while veins stay green, bleached white tips on top buds directly under LED diodes. If observed, raise your fixture by 10–15 cm or dim by 15%.`;
  }

  // 6. Defoliation / Topping / Training / LST
  if (
    query.includes("train") ||
    query.includes("top") ||
    query.includes("lst") ||
    query.includes("defol") ||
    query.includes("lollipop") ||
    query.includes("prun") ||
    query.includes("scrog")
  ) {
    return `### ✂️ Canopy Architecture & Training Strategy for ${plant}

1. **Topping Guidelines:**
   - Optimal timing: 4th to 6th node in vegetative growth. Cut ~5mm above the node with 70% alcohol-sanitized shears.
   - Never top autoflowers after week 3 or photoperiods once light cycle is flipped to 12/12.

2. **Low-Stress Training (LST):**
   - Anchor the main stem in the opposite direction at the base to protect the taproot.
   - Gently tie down lateral shoots with soft rubber garden wire to create an even, flat table-top canopy where every shoot receives equal lumens.

3. **Strategic Defoliation (Day 1 & Day 21 of Flower):**
   - Remove large inner fan leaves that block secondary bud sites.
   - "Lollipop" the lowest 25% of growth where photons cannot penetrate, redirecting mobile plant sugars into top primary colas.`;
  }

  // 7. General Context-Aware Consultation
  return `### 👨‍⚕️ GrowBuddy AI Doctor Consultation for ${plant}

**Current Grow Profile:**
- **Cultivar:** ${plant}
- **Stage:** ${stage}
- **Medium:** ${medium}
${condition ? `- **Active Diagnosis:** ${condition}` : ""}

**General Health Recommendation:**
1. **Foliar Check:** Monitor the newest top growth vs bottom fan leaves. Deficiencies in mobile elements (Nitrogen, Phosphorus, Potassium, Magnesium) show up first on lower leaves; immobile deficiencies (Calcium, Iron, Boron) appear on fresh top growth.
2. **Environment & Root Health:** Maintain steady root zone temps (19°C – 22°C) and consistent watering cycles with appropriate runoff.
3. **Ask me specifically about:**
   - Organic vs chemical remedies for any pests or spotting
   - Precise pH and EC calibrations for ${medium}
   - Lighting distance, DLI, and VPD optimization
   - Step-by-step recovery plans from nutrient burn or lockout`;
}

export async function handleDoctorChat(payload: DoctorChatPayload): Promise<DoctorChatResult> {
  const { messages, context } = payload;

  if (!messages || messages.length === 0) {
    throw new Error("No chat messages provided.");
  }

  const latestUserMessage = [...messages].reverse().find((m) => m.role === "user")?.text || "";
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
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

      // Assemble system instruction with deep horticultural grounding
      let contextPrompt = `You are GrowBuddy AI Doctor, a world-class plant pathologist, master horticulturist, and cannabis cultivation specialist.
Your tone is professional, encouraging, scientifically grounded, and straightforward.
Provide clear diagnostics, organic and conventional remedies, precise pH/EC ranges, VPD targets, lighting advice, and preventive protocols.
Keep answers formatted with crisp markdown headings, bullet points, and actionable steps so growers can easily read on mobile in their garden or tent.`;

      if (context) {
        contextPrompt += `\n\nCURRENT GROW CONTEXT:
- Plant / Cultivar: ${context.plantName || "Not specified"}
- Stage: ${context.stage || "Vegetative"}
- Medium: ${context.medium || "Soil"}
${context.activeCondition ? `- Active Diagnosis: ${context.activeCondition}` : ""}
${context.healthScore ? `- Canopy Health Score: ${context.healthScore}%` : ""}
${context.severity ? `- Severity Level: ${context.severity}` : ""}
${context.lastDiagnosisSummary ? `- Last Scan Summary: ${context.lastDiagnosisSummary}` : ""}
${context.symptoms && context.symptoms.length > 0 ? `- Observed Symptoms: ${context.symptoms.join(", ")}` : ""}
${context.actionPlan && context.actionPlan.length > 0 ? `- Prescribed Action Plan: ${context.actionPlan.join(" | ")}` : ""}
Always ground your answers in this plant's specific stage, medium, and diagnosed symptoms whenever relevant.`;
      }

      // Format conversation turns for Gemini
      const formattedContents = messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini chat call timed out after 3.5s")), 3500),
      );

      const geminiPromise = ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: formattedContents,
        config: {
          systemInstruction: contextPrompt,
          temperature: 0.7,
        },
      });

      const response = await Promise.race([geminiPromise, timeoutPromise]);
      clearTimeout(timeoutId);

      const replyText = response.text;
      if (replyText && replyText.trim().length > 0) {
        return {
          text: replyText.trim(),
          source: "gemini-3.8-flash",
        };
      }
    } catch (err: unknown) {
      console.warn(
        "Gemini doctor chat call timed out or failed, falling back to botanical knowledge base:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Graceful fallback to botanical knowledge base
  const fallbackText = generateBotanicalFallbackResponse(latestUserMessage, context);
  return {
    text: fallbackText,
    source: "botanical-knowledge-base",
  };
}
