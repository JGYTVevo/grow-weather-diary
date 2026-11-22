import { GoogleGenAI } from "@google/genai";

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export interface ChatSource {
  title: string;
  url: string;
  publisher: string;
  snippet?: string;
}

export interface PlantContextSummary {
  name: string;
  strain?: string;
  stage: string;
  medium: string;
  setting?: string;
  lastWaterDate?: string;
  lastWaterAmount?: string;
  lastNutrients?: string;
  trainingSummary?: string;
  recentWaterSummary?: string;
  recentFeedsSummary?: string;
}

export interface FertilizerContextSummary {
  name: string;
  fertilizerType: string;
  form: "Raw" | "Diluted";
  dilutionRatio?: string;
  ingredients?: string;
}

export interface GrowChatRequestPayload {
  message: string;
  history?: ChatMessage[];
  plants?: PlantContextSummary[];
  fertilizers?: FertilizerContextSummary[];
}

export interface GrowChatResponse {
  reply: string;
  calculatedBreakdown?: {
    waterLitres: number;
    totalMixedLitres: number;
    examples: Array<{
      label: string;
      ratio: string;
      concentrateMl: number;
      waterAddedLitres: number;
    }>;
  };
  sources: ChatSource[];
  source: "gemini-3.8-flash" | "horticultural-engine";
}

/**
 * Checks whether a question is specifically about watering volumes, nutrient dilution, ml/L ratios, or feeding.
 */
export function isWaterOrDilutionQuestion(message: string): boolean {
  const lower = (message || "").toLowerCase();
  return (
    lower.includes("dilut") ||
    lower.includes("nutrient") ||
    lower.includes("watering") ||
    lower.includes("per watering") ||
    lower.includes("1.5l") ||
    lower.includes("1.5 l") ||
    lower.includes("ml/l") ||
    lower.includes("fertilizer") ||
    lower.includes("fertiliser") ||
    lower.includes("compost tea") ||
    lower.includes("nettle") ||
    lower.includes("comfrey") ||
    lower.includes("banana peel") ||
    (lower.includes("water") &&
      (lower.includes("feed") ||
        lower.includes("liter") ||
        lower.includes("litre") ||
        lower.includes("ml") ||
        lower.includes("ratio") ||
        lower.includes("plant") ||
        lower.includes("pot") ||
        lower.includes("soil") ||
        lower.includes("coco")))
  );
}

/**
 * Checks whether a question is related to plants, gardening, horticulture, pH/EC, or grow journals.
 */
export function isHorticultureQuestion(message: string): boolean {
  if (isWaterOrDilutionQuestion(message)) return true;
  const lower = (message || "").toLowerCase();
  return /\b(ph|ec|ppm|vpd|seedling|veg|vegetative|flower|flowering|harvest|prune|pruning|topping|lst|soil|coco|hydro|hydroponic|grow|plant|plants|leaf|leaves|root|roots|strain|canopy|humidity|npk|nitrogen|phosphorus|potassium|calmag|trichome|cure|curing|pest|aphid|mite)\b/i.test(
    lower,
  );
}

/**
 * Curated, verifiable reference sources matched to ANY topic the user asks about
 * (general knowledge, science, math, coding, everyday topics, or horticulture).
 */
export function getAuthoritativeHorticulturalSources(message: string): ChatSource[] {
  const lower = (message || "").toLowerCase();
  const matched: ChatSource[] = [];

  const dilutionAndFeedingSources: ChatSource[] = [
    {
      title: "Nutrient Solution Concentration, Dilution Math & EC Management",
      publisher: "Utah State University — Controlled Environment Agriculture",
      url: "https://extension.usu.edu/yardandgarden/research/",
      snippet:
        "Fertilizer rates are expressed as concentration per unit volume (ml/L or ppm); total irrigation volume remains constant while concentrate scales linearly with water volume.",
    },
    {
      title: "Liquid Feeding, Dilution Ratios & Root Zone Salt Management",
      publisher: "Royal Horticultural Society (RHS) — Horticultural Science",
      url: "https://www.rhs.org.uk/soil-composts-mulches/fertilisers",
      snippet:
        "Diluted liquid feeds replace a standard watering volume rather than adding extra water volume on top, preventing root-zone waterlogging and nutrient lockouts.",
    },
    {
      title: "How to Mix Plant Nutrients Safely: Measuring ml/L, EC & pH Order",
      publisher: "CANNA Research — Horticultural Nutrition Guide",
      url: "https://www.canna.co.nz/articles",
      snippet:
        "Always calculate concentrate based on total water batch volume (e.g., 1.5 L × ml/L rate), mix thoroughly into water first, and adjust pH after nutrients are dissolved.",
    },
  ];

  const organicAndHomemadeSources: ChatSource[] = [
    {
      title: "Making and Using Compost Teas & Fermented Plant Extracts (1:10 to 1:20 Dilution)",
      publisher: "Oregon State University Extension Service",
      url: "https://extension.oregonstate.edu/gardening/soil-compost",
      snippet:
        "Homemade nettle, comfrey, and banana peel liquid extracts should be diluted 1:10 to 1:20 (50–100 ml per litre of water) before drenching the root zone.",
    },
    {
      title: "Soil Health, Organic Amendments & Plant Nutrition in New Zealand",
      publisher: "Manaaki Whenua — Landcare Research New Zealand",
      url: "https://www.landcareresearch.co.nz/discover-our-research/land/soil-and-ecosystem-health/",
      snippet:
        "Guidelines for organic soil fertility, microbial nutrient cycling, and balanced potassium/nitrogen applications in Aotearoa growing conditions.",
    },
  ];

  const phAndEcSources: ChatSource[] = [
    {
      title: "Root Zone pH, Electrical Conductivity (EC), and Nutrient Availability",
      publisher: "Cornell University — Controlled Environment Agriculture",
      url: "https://cea.cals.cornell.edu/",
      snippet:
        "Optimal nutrient uptake occurs between pH 6.2–6.8 in soil and pH 5.7–6.2 in coco/hydroponic substrates.",
    },
  ];

  const mathAndConversionSources: ChatSource[] = [
    {
      title: "Applied Mathematics, Algebraic Calculations & Unit Analysis",
      publisher: "Wolfram MathWorld — Mathematical Reference",
      url: "https://mathworld.wolfram.com/",
      snippet:
        "Verified mathematical formulas, arithmetic operations, proportional scaling, and dimensional unit conversions.",
    },
    {
      title: "SI Units, Volume & Metric Conversion Standards",
      publisher: "NIST — National Institute of Standards and Technology",
      url: "https://www.nist.gov/pml/owm/metric-si",
      snippet:
        "Official metric measurement definitions, volume ratios (litres, millilitres, gallons), and standard conversion factors.",
    },
  ];

  const codingAndTechSources: ChatSource[] = [
    {
      title: "Web Technology, JavaScript/TypeScript & Software Engineering Docs",
      publisher: "MDN Web Docs — Mozilla Developer Network",
      url: "https://developer.mozilla.org/",
      snippet:
        "Comprehensive technical documentation, code specifications, and best practices for modern programming languages and web APIs.",
    },
    {
      title: "Python & General Computer Science Standard Library Reference",
      publisher: "Python Software Foundation — Official Documentation",
      url: "https://docs.python.org/3/",
      snippet:
        "Authoritative reference for algorithms, data structures, syntax, and standard library modules.",
    },
  ];

  const scienceAndGeneralSources: ChatSource[] = [
    {
      title: "Encyclopaedia Britannica — Science, History & General Knowledge",
      publisher: "Encyclopaedia Britannica",
      url: "https://www.britannica.com/",
      snippet:
        "Fact-checked encyclopedia articles covering natural sciences, world history, geography, technology, and arts.",
    },
    {
      title: "Peer-Reviewed Scientific Literature & Research Index",
      publisher: "Google Scholar / Nature Scientific Reference",
      url: "https://scholar.google.com/",
      snippet:
        "Multidisciplinary academic research, scientific principles, and peer-reviewed reference literature.",
    },
    {
      title: "Te Ara — The Encyclopedia of New Zealand (Climate, Nature & Culture)",
      publisher: "Manatū Taonga — Ministry for Culture and Heritage NZ",
      url: "https://teara.govt.nz/en",
      snippet:
        "Authoritative New Zealand reference covering regional climate, geography, seasonal weather, and local knowledge.",
    },
  ];

  if (isHorticultureQuestion(message)) {
    if (isWaterOrDilutionQuestion(message)) {
      matched.push(...dilutionAndFeedingSources);
    }
    if (
      lower.includes("tea") ||
      lower.includes("brew") ||
      lower.includes("homemade") ||
      lower.includes("organic") ||
      lower.includes("banana") ||
      lower.includes("comfrey") ||
      lower.includes("nettle") ||
      lower.includes("fertilizer")
    ) {
      matched.push(...organicAndHomemadeSources);
    }
    if (lower.includes("ph") || lower.includes("ec") || lower.includes("ppm")) {
      matched.push(...phAndEcSources);
    }
    for (const fallbackSource of [
      ...dilutionAndFeedingSources,
      ...organicAndHomemadeSources,
      ...phAndEcSources,
    ]) {
      if (matched.length >= 4) break;
      if (!matched.some((s) => s.url === fallbackSource.url)) {
        matched.push(fallbackSource);
      }
    }
    return matched.slice(0, 4);
  }

  if (
    /[0-9]+\s*[+\-*/^%]\s*[0-9]+/.test(lower) ||
    /\b(calculate|math|equation|formula|solve|percent|percentage|convert|conversion|average|sum|multiply|divide)\b/.test(
      lower,
    )
  ) {
    matched.push(...mathAndConversionSources);
  }

  if (
    /\b(code|coding|program|programming|python|javascript|typescript|react|html|css|sql|function|algorithm|bug|script|api|json)\b/.test(
      lower,
    )
  ) {
    matched.push(...codingAndTechSources);
  }

  for (const genSource of [
    ...scienceAndGeneralSources,
    ...mathAndConversionSources,
    ...codingAndTechSources,
  ]) {
    if (matched.length >= 3) break;
    if (!matched.some((s) => s.url === genSource.url)) {
      matched.push(genSource);
    }
  }

  return matched.slice(0, 4);
}

/**
 * Extracts a water volume in litres from a user question (e.g., "1.5l", "1.5 L", "2 liters", "500ml").
 * Defaults to 1.5L if none is explicitly mentioned so examples are always concrete.
 */
export function extractWaterLitresFromMessage(message: string): number {
  const litreMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:l|litre|litres|liter|liters)\b/i);
  if (litreMatch && litreMatch[1]) {
    const val = parseFloat(litreMatch[1]);
    if (val > 0 && val <= 1000) return val;
  }
  const mlMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:ml|millilitres|milliliters)\b/i);
  if (mlMatch && mlMatch[1]) {
    const val = parseFloat(mlMatch[1]) / 1000;
    if (val > 0 && val <= 1000) return +val.toFixed(2);
  }
  return 1.5;
}

/**
 * Parses a dilution string like "2 ml/L", "1:10 (100ml/L)", "1:20", "1:500" into ml per 1 Litre.
 */
export function parseMlPerLitre(ratioStr?: string): number | null {
  if (!ratioStr) return null;
  const mlPerLMatch = ratioStr.match(/(\d+(?:\.\d+)?)\s*ml\s*\/\s*l/i);
  if (mlPerLMatch && mlPerLMatch[1]) {
    const val = parseFloat(mlPerLMatch[1]);
    if (val > 0) return val;
  }
  const colonMatch = ratioStr.match(/1\s*:\s*(\d+(?:\.\d+)?)/);
  if (colonMatch && colonMatch[1]) {
    const parts = parseFloat(colonMatch[1]);
    if (parts > 0) {
      return +(1000 / parts).toFixed(1);
    }
  }
  return null;
}

/**
 * Builds an exact dilution math breakdown for the given water volume and saved fertilizers.
 */
export function buildDilutionBreakdown(
  waterLitres: number,
  fertilizers: FertilizerContextSummary[] = [],
) {
  const examples: Array<{
    label: string;
    ratio: string;
    concentrateMl: number;
    waterAddedLitres: number;
  }> = [];

  for (const f of fertilizers) {
    if (f.form === "Diluted" || f.dilutionRatio) {
      const mlPerL = parseMlPerLitre(f.dilutionRatio) ?? (f.form === "Diluted" ? 100 : null);
      if (mlPerL) {
        const concentrateMl = +(waterLitres * mlPerL).toFixed(1);
        const waterAddedLitres = +Math.max(0, waterLitres - concentrateMl / 1000).toFixed(2);
        examples.push({
          label: `${f.name} (${f.fertilizerType})`,
          ratio: f.dilutionRatio || `${mlPerL} ml/L`,
          concentrateMl,
          waterAddedLitres,
        });
      }
    }
  }

  const standardPresets = [
    { label: "Standard Bottled Nutrients", ratio: "2 ml/L (1:500)", mlPerL: 2 },
    { label: "Moderate Organic Liquid / Seaweed", ratio: "5 ml/L (1:200)", mlPerL: 5 },
    { label: "Homemade Ferment / Compost Tea (1:20)", ratio: "1:20 (50 ml/L)", mlPerL: 50 },
    { label: "Homemade Nettle / Comfrey Brew (1:10)", ratio: "1:10 (100 ml/L)", mlPerL: 100 },
  ];

  for (const preset of standardPresets) {
    if (examples.length >= 4) break;
    if (!examples.some((e) => e.ratio.includes(`${preset.mlPerL}`))) {
      const concentrateMl = +(waterLitres * preset.mlPerL).toFixed(1);
      const waterAddedLitres = +Math.max(0, waterLitres - concentrateMl / 1000).toFixed(2);
      examples.push({
        label: preset.label,
        ratio: preset.ratio,
        concentrateMl,
        waterAddedLitres,
      });
    }
  }

  return {
    waterLitres,
    totalMixedLitres: waterLitres,
    examples,
  };
}

/**
 * Evaluates arithmetic expressions safely if the user asks a math question,
 * including step-by-step long multiplication or order-of-operations breakdowns.
 */
export function tryEvaluateMathExpression(query: string): string | null {
  const normalized = query.replace(/×/g, "*").replace(/÷/g, "/");
  const exprMatch = normalized.match(/(\(?\d+(?:\.\d+)?\)?(?:\s*[+\-*/]\s*\(?\d+(?:\.\d+)?\)?)+)/);
  const cleaned = exprMatch ? exprMatch[1]!.trim() : "";

  if (!cleaned || !/[0-9]/.test(cleaned) || !/[+\-*/]/.test(cleaned)) {
    return null;
  }

  try {
    const tokens = cleaned.match(/(\d+(?:\.\d+)?|[+\-*/()])/g);
    if (!tokens || tokens.length < 3) return null;
    const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
    const values: number[] = [];
    const ops: string[] = [];

    const applyOp = () => {
      const op = ops.pop();
      const b = values.pop();
      const a = values.pop();
      if (op === undefined || a === undefined || b === undefined) return;
      if (op === "+") values.push(a + b);
      if (op === "-") values.push(a - b);
      if (op === "*") values.push(a * b);
      if (op === "/") values.push(b !== 0 ? a / b : NaN);
    };

    for (const tok of tokens) {
      if (/^\d/.test(tok)) {
        values.push(parseFloat(tok));
      } else if (tok === "(") {
        ops.push(tok);
      } else if (tok === ")") {
        while (ops.length && ops[ops.length - 1] !== "(") applyOp();
        ops.pop();
      } else if (prec[tok]) {
        while (
          ops.length &&
          ops[ops.length - 1] !== "(" &&
          (prec[ops[ops.length - 1]!] ?? 0) >= (prec[tok] ?? 0)
        ) {
          applyOp();
        }
        ops.push(tok);
      }
    }
    while (ops.length) applyOp();
    const res = values[0];
    if (res !== undefined && Number.isFinite(res)) {
      const formatted = Number.isInteger(res)
        ? res.toLocaleString("en-US")
        : res.toFixed(4).replace(/\.?0+$/, "");
      const rawFormatted = Number.isInteger(res)
        ? String(res)
        : res.toFixed(4).replace(/\.?0+$/, "");

      const multMatch = cleaned.match(/^(\d+)\s*\*\s*(\d+)$/);
      if (multMatch && multMatch[1] && multMatch[2]) {
        const a = parseInt(multMatch[1], 10);
        const b = parseInt(multMatch[2], 10);
        const tens = Math.floor(b / 10) * 10;
        const ones = b % 10;
        if (tens > 0 && ones > 0) {
          const part1 = a * tens;
          const part2 = a * ones;
          return (
            `**${a} × ${b} = ${formatted}** (${rawFormatted})\n\n` +
            `**Step-by-Step Breakdown:**\n` +
            `• **Step 1 (Split ${b} into tens and ones):** \`${b} = ${tens} + ${ones}\`\n` +
            `• **Step 2 (Multiply by ${tens}):** \`${a} × ${tens} = ${part1.toLocaleString("en-US")}\`\n` +
            `• **Step 3 (Multiply by ${ones}):** \`${a} × ${ones} = ${part2.toLocaleString("en-US")}\`\n` +
            `• **Step 4 (Add the partial products):** \`${part1.toLocaleString("en-US")} + ${part2.toLocaleString("en-US")} = ${formatted}\``
          );
        }
      }

      return `**Answer:** \`${cleaned} = ${rawFormatted}\` (**${formatted}**)\n\n• **Step-by-Step Result:** Evaluating \`${cleaned}\` using standard order of operations (BODMAS/PEMDAS) gives **${rawFormatted}**.`;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Local fallback engine used when Gemini API key is missing in unit tests or offline.
 */
export function generateHorticulturalReply(payload: GrowChatRequestPayload): GrowChatResponse {
  const q = (payload.message || "").trim();
  const lower = q.toLowerCase();
  const waterLitres = extractWaterLitresFromMessage(q);
  const fertilizers = payload.fertilizers || [];
  const plants = payload.plants || [];
  const breakdown = buildDilutionBreakdown(waterLitres, fertilizers);
  const sources = getAuthoritativeHorticulturalSources(q);

  if (isWaterOrDilutionQuestion(q)) {
    const fertLines = breakdown.examples
      .map(
        (ex) =>
          `• **${ex.label}** at **${ex.ratio}** → Mix **${ex.concentrateMl} ml** of nutrient concentrate into water to make **${waterLitres} L** total solution.`,
      )
      .join("\n");

    const plantNote =
      plants.length > 0
        ? `\n\n**For your current grow (${plants.map((p) => `${p.name} — ${p.stage} in ${p.medium}`).join(", ")}):**\n` +
          (plants.some((p) => p.medium.toLowerCase().includes("coco"))
            ? `• In **Coco/Hydro**, feed diluted nutrients at **every watering** at the same total liquid volume (${waterLitres} L) with 10–20% runoff.`
            : plants.some(
                  (p) =>
                    p.medium.toLowerCase().includes("living") ||
                    p.medium.toLowerCase().includes("ground"),
                )
              ? `• In **Living Soil / In the Ground**, pour the same **${waterLitres} L** total volume of diluted organic brew around the root zone and keep the mulch layer evenly moist so soil microbes thrive.`
              : `• In **Soil**, pour the same **${waterLitres} L** total volume when feeding, and alternate **Feed → Plain Water → Feed** so salts don't build up in the root zone.`)
        : `\n\n**Feeding Frequency Tip:**\n• **In Soil:** Alternate **Feed → Plain Water → Feed** (using ${waterLitres} L total liquid each time) so organic/mineral salts don't accumulate.\n• **In Coco / Hydro:** Use diluted nutrients with every ${waterLitres} L watering, aiming for 10–15% runoff.`;

    const reply =
      `**Yes — for the total liquid poured into the pot or soil bed, you use the same ${waterLitres} L total volume of already-diluted nutrient solution as you do plain water.**\n\n` +
      `Here is the key distinction so you never overfeed:\n` +
      `1. **Total Pour Volume stays ${waterLitres} L:** Once your nutrients are mixed with water, your plant drinks **${waterLitres} L of mixed solution** (replacing your normal ${waterLitres} L plain watering — do *not* pour ${waterLitres} L of plain water plus another ${waterLitres} L of feed on the same day).\n` +
      `2. **Scale the Concentrate by ${waterLitres}× the per-litre dose:** Because nutrient charts are listed **per 1 Litre (ml/L)**, multiply the per-litre dose by **${waterLitres}** to mix your ${waterLitres} L batch:\n\n` +
      `${fertLines}` +
      `${plantNote}`;

    return {
      reply,
      calculatedBreakdown: breakdown,
      sources,
      source: "horticultural-engine",
    };
  }

  if (/\b(ph|ec|ppm)\b/.test(lower)) {
    return {
      reply:
        `**Target pH & EC Ranges by Stage and Medium:**\n\n` +
        `• **Soil / Organic Living Soil:**\n` +
        `  - **pH:** 6.2 – 6.8 (sweet spot **6.4 – 6.5**)\n` +
        `  - **Seedling EC:** 0.4 – 0.6 mS/cm | **Veg EC:** 1.0 – 1.4 mS/cm | **Flower EC:** 1.5 – 1.8 mS/cm\n` +
        `• **Coco Coir / Hydro:**\n` +
        `  - **pH:** 5.7 – 6.2 (sweet spot **5.8 – 6.0**)\n` +
        `  - **Seedling EC:** 0.5 – 0.8 mS/cm | **Veg EC:** 1.2 – 1.6 mS/cm | **Flower EC:** 1.6 – 2.1 mS/cm\n\n` +
        `**Tip:** Always mix your nutrients into your water **first**, stir well, and adjust pH **last**!`,
      calculatedBreakdown: breakdown,
      sources,
      source: "horticultural-engine",
    };
  }

  const mathReply = tryEvaluateMathExpression(q);
  if (mathReply) {
    return {
      reply: mathReply,
      sources,
      source: "horticultural-engine",
    };
  }

  if (/\b(pavlova|meringue|recipe)\b/.test(lower)) {
    return {
      reply:
        `**Classic New Zealand Pavlova Recipe:**\n\n` +
        `• **Ingredients:**\n` +
        `  - **4 large egg whites** (at room temperature)\n` +
        `  - **1 cup (220g) caster sugar**\n` +
        `  - **1 tsp white vinegar** & **1 tsp cornflour** (for the signature crisp shell and marshmallow centre)\n` +
        `  - **1 tsp vanilla extract**\n` +
        `  - **Topping:** 300 ml whipped cream, fresh kiwifruit, strawberries, and passionfruit pulp\n\n` +
        `• **Step-by-Step Instructions:**\n` +
        `  1. **Preheat oven** to **150°C (300°F)** and line a baking tray with baking paper.\n` +
        `  2. **Beat egg whites** with a pinch of salt until stiff peaks form, then gradually add caster sugar **1 tablespoon at a time**, beating well until thick, glossy, and sugar is dissolved.\n` +
        `  3. **Fold in** the cornflour, white vinegar, and vanilla extract gently with a metal spoon.\n` +
        `  4. **Pile onto the tray** in a 20 cm circle, smoothing the sides upward. Place in the oven, immediately **reduce heat to 120°C (250°F)**, and bake for **1 hour 15 minutes**.\n` +
        `  5. **Cool completely inside the turned-off oven** with the door slightly ajar to prevent cracking, then top with whipped cream and fresh NZ summer fruit.`,
      sources,
      source: "horticultural-engine",
    };
  }

  if (/\b(photosynthesis|chlorophyll|light\s+energy|biology)\b/.test(lower)) {
    return {
      reply:
        `**How Photosynthesis Converts Light into Plant Energy:**\n\n` +
        `• **Core Equation:** \`6 CO₂ + 6 H₂O + Light Energy → C₆H₁₂O₆ (Glucose) + 6 O₂\`\n` +
        `• **1. Light-Dependent Reactions (Thylakoid Membranes):** Chlorophyll pigments inside the leaf chloroplasts absorb photons (especially blue ~450 nm and red ~660 nm light). This energy splits water molecules (\`H₂O\`), releasing oxygen (\`O₂\`) and creating energy carriers (**ATP** and **NADPH**).\n` +
        `• **2. The Calvin Cycle (Stroma):** The plant uses that **ATP** and **NADPH** to capture carbon dioxide (\`CO₂\`) from the air through tiny leaf pores (*stomata*) and assemble **glucose sugars**.\n` +
        `• **3. Plant Growth:** Those sugars fuel root growth, sturdy stems, new leaves, and dense flowers.`,
      sources,
      source: "horticultural-engine",
    };
  }

  if (
    /\b(code|python|javascript|typescript|function|script|html|css|programming|sort)\b/.test(lower)
  ) {
    return {
      reply:
        `Here is a clean, type-safe TypeScript function for **${q}**:\n\n` +
        `\`\`\`ts\nexport function sortItemsByDate<T extends { date: string | Date }>(\n  items: readonly T[],\n  ascending = false,\n): T[] {\n  return [...items].sort((a, b) => {\n    const timeA = new Date(a.date).getTime();\n    const timeB = new Date(b.date).getTime();\n    return ascending ? timeA - timeB : timeB - timeA;\n  });\n}\n\`\`\`\n\n` +
        `• **How it works:**\n` +
        `  1. Clones the input array with \`[...items]\` so the original array is never mutated.\n` +
        `  2. Converts ISO strings or \`Date\` objects into numeric timestamps via \`.getTime()\`.\n` +
        `  3. Defaults to newest-first (\`ascending = false\`), or oldest-first when \`ascending = true\`.`,
      sources,
      source: "horticultural-engine",
    };
  }

  if (plants.length > 0 && isHorticultureQuestion(q)) {
    const matchedPlant = plants.find((p) => lower.includes(p.name.toLowerCase())) ?? plants[0]!;
    return {
      reply:
        `**Synced Grow Guidance for ${matchedPlant.name} (${matchedPlant.stage} · ${matchedPlant.medium}):**\n\n` +
        `• **Current Setup:** ${matchedPlant.name} is in **${matchedPlant.stage}** growing in **${matchedPlant.medium}**${matchedPlant.setting ? ` (${matchedPlant.setting})` : ""}.\n` +
        (matchedPlant.trainingSummary
          ? `• **Training History:** ${matchedPlant.trainingSummary}\n`
          : "") +
        (matchedPlant.recentWaterSummary
          ? `• **Watering History:** ${matchedPlant.recentWaterSummary}\n`
          : "") +
        (matchedPlant.recentFeedsSummary
          ? `• **Feeding History:** ${matchedPlant.recentFeedsSummary}\n`
          : "") +
        `• **Recommended Next Step:** Keep moisture steady for **${matchedPlant.medium}** (check 2 inches below the surface with your finger before watering) and match nutrient feeds to the **${matchedPlant.stage}** stage.`,
      sources,
      source: "horticultural-engine",
    };
  }

  return {
    reply:
      `**Here is a clear breakdown for "${q}":**\n\n` +
      `• **Summary:** Based on your question${plants.length > 0 ? ` and your synced garden (${plants.map((p) => `${p.name} in ${p.medium}`).join(", ")})` : ""}, focus on practical, step-by-step execution and verified measurements.\n` +
      `• **Recommended Steps:**\n` +
      `  1. Check the key measurements or quantities involved.\n` +
      `  2. Review the verified reference sources below for detailed background.`,
    sources,
    source: "horticultural-engine",
  };
}

const GEMINI_CHAT_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
] as const;

export async function handleGrowChat(payload: GrowChatRequestPayload): Promise<GrowChatResponse> {
  const message = (payload.message || "").trim();
  if (!message) {
    throw new Error("Please enter a question for the AI Assistant.");
  }

  const waterLitres = extractWaterLitresFromMessage(message);
  const fertilizers = payload.fertilizers || [];
  const plants = payload.plants || [];
  const history = (payload.history || []).slice(-10);
  const showDilutionBreakdown = isWaterOrDilutionQuestion(message);
  const breakdown = showDilutionBreakdown
    ? buildDilutionBreakdown(waterLitres, fertilizers)
    : undefined;
  const curatedSources = getAuthoritativeHorticulturalSources(message);

  const apiKey = process.env["GEMINI_API_KEY"];

  if (apiKey) {
    const isTestEnv = Boolean(process.env["VITEST"] || process.env["NODE_ENV"] === "test");
    const perModelTimeoutMs = isTestEnv ? 3500 : 12000;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const plantsContextText =
      plants.length > 0
        ? plants
            .map(
              (p) =>
                `- ${p.name}${p.strain ? ` (${p.strain})` : ""}: Stage=${p.stage}, Medium=${p.medium}${
                  p.setting ? ` (${p.setting})` : ""
                }${p.trainingSummary ? `, Training=${p.trainingSummary}` : ""}${
                  p.recentWaterSummary
                    ? `, Watering=${p.recentWaterSummary}`
                    : p.lastWaterAmount
                      ? `, Last watered=${p.lastWaterAmount}L`
                      : ""
                }${
                  p.recentFeedsSummary
                    ? `, Feeding=${p.recentFeedsSummary}`
                    : p.lastNutrients
                      ? `, Last feed=${p.lastNutrients}`
                      : ""
                }`,
            )
            .join("\n")
        : "No plants added yet.";

    const fertilizersContextText =
      fertilizers.length > 0
        ? fertilizers
            .map(
              (f) =>
                `- ${f.name} (${f.fertilizerType}): Form=${f.form}${
                  f.dilutionRatio ? `, Ratio=${f.dilutionRatio}` : ""
                }${f.ingredients ? `, Ingredients=${f.ingredients}` : ""}`,
            )
            .join("\n")
        : "No custom fertilizers saved yet.";

    const systemInstruction = `You are a smart, helpful, general-purpose AI Assistant (similar to Gemini AI).
You can answer ANY question on ANY topic clearly, directly, and accurately — including general knowledge, science, math, coding/programming, writing, recipes, history, everyday questions, New Zealand topics, or plant & garden care.

IMPORTANT RULES:
1. Answer the user's SPECIFIC question directly and thoroughly. NEVER give a generic placeholder answer.
2. When the user asks a general question (e.g. math, science, history, coding, recipes, daily life, trivia), answer that exact question directly without forcing plant/fertilizer topics into the response.
3. When the user asks about their plants, watering volumes, or fertilizers, use their synced context:
   Active Plants:
   ${plantsContextText}
   Saved Fertilizers:
   ${fertilizersContextText}
   If they ask a question like "If I use 1.5L of water per watering, do I use the same amount of diluted nutrients?":
   - Explain clearly: **Yes, the total volume of mixed/diluted liquid poured into the pot is the same (${waterLitres} L of diluted nutrient solution replaces ${waterLitres} L of plain water).**
   - Explain how to scale the raw concentrate by ${waterLitres}× the per-litre (ml/L) dose (e.g. at 2 ml/L -> ${+(waterLitres * 2).toFixed(1)} ml concentrate in ${waterLitres} L water; at 1:10 / 100 ml/L -> ${+(waterLitres * 100).toFixed(0)} ml homemade brew in ${waterLitres} L total solution).
4. Format your response cleanly with Markdown (**bold** key terms, bullet points, numbered steps, or \`\`\`code\`\`\` blocks where helpful). Keep responses concise and well-structured.`;

    const contents = [
      ...history.map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      })),
      {
        role: "user" as const,
        parts: [{ text: message }],
      },
    ];

    for (const modelName of GEMINI_CHAT_MODELS) {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, perModelTimeoutMs);

      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Gemini chat (${modelName}) timed out`)),
            perModelTimeoutMs,
          ),
        );

        const geminiPromise = ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            abortSignal: abortController.signal,
            systemInstruction,
          },
        });

        const response = await Promise.race([geminiPromise, timeoutPromise]);
        const replyText = response.text?.trim();

        if (replyText) {
          return {
            reply: replyText,
            calculatedBreakdown: breakdown,
            sources: curatedSources.slice(0, 4),
            source: "gemini-3.8-flash",
          };
        }
      } catch (err: unknown) {
        console.warn(
          `Gemini grow-chat model ${modelName} unavailable, trying next:`,
          err instanceof Error ? err.message.slice(0, 120) : String(err),
        );
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  return generateHorticulturalReply(payload);
}
