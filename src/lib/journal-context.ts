import type { Plant, Log } from "@/hooks/use-plants";
import type { HomemadeFertilizer } from "@/hooks/use-fertilizers";

export interface PlantJournalSummary {
  plantId: string;
  plantName: string;
  strain: string;
  plantType: "Photoperiod" | "Autoflower";
  setting: "Indoor" | "Outdoor" | "Greenhouse";
  medium: string;
  rawMedium: string;
  stage: string;
  ageDays: number;
  stageDays: number;
  isLivingSoil: boolean;
  isInGround: boolean;
  totalLogs: number;
  wateringsCount: number;
  lastWater: {
    date: string;
    daysAgo: number;
    amount?: string;
    ph?: string;
    note?: string;
  } | null;
  feedsCount: number;
  lastFeed: {
    date: string;
    daysAgo: number;
    nutrients?: string;
    form?: "Raw" | "Diluted";
    dilutionRatio?: string;
    amount?: string;
    ph?: string;
    ec?: string;
    note?: string;
  } | null;
  trainingsCount: number;
  trainingTechniques: string[];
  lastTraining: {
    date: string;
    daysAgo: number;
    technique?: string;
    note?: string;
  } | null;
  latestHeight?: string;
  latestEnvironment: {
    date: string;
    temp?: string;
    humidity?: string;
  } | null;
  recentWaterSummary: string;
  recentFeedsSummary: string;
  trainingSummary: string;
  recentNotes: string[];
  latestPhoto?: string;
  journalContextBadges: string[];
  promptBlock: string;
}

function calcDaysAgo(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function formatDaysAgoLabel(daysAgo: number): string {
  if (daysAgo <= 0) return "today";
  if (daysAgo === 1) return "yesterday (1 day ago)";
  return `${daysAgo} days ago`;
}

export function normalizeMediumLabel(medium?: string): string {
  const raw = (medium || "Soil").trim();
  const lower = raw.toLowerCase();
  if (lower.includes("living") && lower.includes("ground")) {
    return "Living Soil (In the Ground)";
  }
  if (lower.includes("in the ground") || lower === "ground" || lower.includes("garden bed")) {
    return "In the Ground";
  }
  if (lower.includes("living")) {
    return "Living Soil";
  }
  if (lower.includes("coco")) {
    return "Coco Coir";
  }
  if (lower.includes("hydro") || lower.includes("dwc")) {
    return "Hydro / DWC";
  }
  return "Soil";
}

export function buildPlantJournalSummary(
  plant: Plant,
  fertilizers: HomemadeFertilizer[] = [],
): PlantJournalSummary {
  const logs: Log[] = Array.isArray(plant.logs)
    ? [...plant.logs].sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    : [];

  const normalizedMedium = normalizeMediumLabel(plant.medium);
  const allNotesText = logs
    .map((l) => `${l.note || ""} ${l.nutrients || ""} ${l.technique || ""}`)
    .join(" ")
    .toLowerCase();
  const mediumLower = `${plant.medium || ""} ${normalizedMedium}`.toLowerCase();

  const isLivingSoil =
    mediumLower.includes("living") ||
    mediumLower.includes("no-till") ||
    allNotesText.includes("living soil") ||
    allNotesText.includes("no-till");

  const isInGround =
    mediumLower.includes("ground") ||
    mediumLower.includes("garden bed") ||
    allNotesText.includes("in the ground") ||
    allNotesText.includes("in ground") ||
    allNotesText.includes("garden bed");

  const effectiveMedium =
    isLivingSoil && isInGround
      ? "Living Soil (In the Ground)"
      : isInGround && !mediumLower.includes("ground")
        ? `${normalizedMedium} (In the Ground)`
        : normalizedMedium;

  const ageDays = calcDaysAgo(plant.started) + 1;
  const stageDays = calcDaysAgo(plant.stageStarted) + 1;

  const waterLogs = logs.filter((l) => l.type === "water");
  const feedLogs = logs.filter((l) => l.type === "feed");
  const trainingLogs = logs.filter((l) => l.type === "training");
  const envLogs = logs.filter((l) => l.type === "environment" && (l.temp || l.humidity));

  // Watering summary
  const latestWaterLog = waterLogs[0] || logs.find((l) => l.type === "feed" && l.amount) || null;
  const lastWater = latestWaterLog
    ? {
        date: latestWaterLog.date,
        daysAgo: calcDaysAgo(latestWaterLog.date),
        amount: latestWaterLog.amount,
        ph: latestWaterLog.ph,
        note: latestWaterLog.note,
      }
    : null;

  const recentWaterSummary = lastWater
    ? `Last watered ${formatDaysAgoLabel(lastWater.daysAgo)}${
        lastWater.amount ? ` (${lastWater.amount})` : ""
      }${lastWater.ph ? ` at pH ${lastWater.ph}` : ""}`
    : "No waterings logged in journal yet";

  // Feeding summary
  const latestFeedLog = feedLogs[0] || null;
  const lastFeed = latestFeedLog
    ? {
        date: latestFeedLog.date,
        daysAgo: calcDaysAgo(latestFeedLog.date),
        nutrients: latestFeedLog.nutrients,
        form: latestFeedLog.fertilizerForm,
        dilutionRatio: latestFeedLog.dilutionRatio,
        amount: latestFeedLog.amount,
        ph: latestFeedLog.ph,
        ec: latestFeedLog.ec,
        note: latestFeedLog.note,
      }
    : null;

  const recentFeedsSummary = lastFeed
    ? `Last fed ${formatDaysAgoLabel(lastFeed.daysAgo)} with ${lastFeed.nutrients || "plant food"}${
        lastFeed.form
          ? ` (${lastFeed.form}${lastFeed.dilutionRatio ? ` · ${lastFeed.dilutionRatio}` : ""})`
          : ""
      }${lastFeed.amount ? `, ${lastFeed.amount}` : ""}`
    : isLivingSoil
      ? "Growing in Living Soil (relying on soil food web; no liquid feeds logged yet)"
      : "No fertilizer feeds logged in journal yet";

  // Training summary
  const trainingTechniques = Array.from(
    new Set(
      trainingLogs
        .map((l) => l.technique || l.note || "Training")
        .filter((t): t is string => Boolean(t && t.trim())),
    ),
  );
  const latestTrainingLog = trainingLogs[0] || null;
  const lastTraining = latestTrainingLog
    ? {
        date: latestTrainingLog.date,
        daysAgo: calcDaysAgo(latestTrainingLog.date),
        technique: latestTrainingLog.technique,
        note: latestTrainingLog.note,
      }
    : null;

  const trainingSummary =
    trainingLogs.length > 0
      ? `Trained (${trainingLogs.length} session${trainingLogs.length > 1 ? "s" : ""}: ${trainingTechniques.join(", ")}${
          lastTraining ? ` — last ${formatDaysAgoLabel(lastTraining.daysAgo)}` : ""
        })`
      : "Untrained / natural canopy (no training logged yet)";

  const latestHeight = logs.find((l) => l.height)?.height;
  const latestEnvLog = envLogs[0] || null;
  const latestEnvironment = latestEnvLog
    ? {
        date: latestEnvLog.date,
        temp: latestEnvLog.temp,
        humidity: latestEnvLog.humidity,
      }
    : null;

  const recentNotes = logs
    .filter((l) => l.note && l.note.trim().length > 0)
    .slice(0, 6)
    .map(
      (l) =>
        `[${l.date} · ${l.type.toUpperCase()}${l.technique ? ` (${l.technique})` : ""}${
          l.nutrients ? ` (${l.nutrients})` : ""
        }]: ${l.note}`,
    );

  const latestPhoto = plant.cover || logs.find((l) => l.photo)?.photo;

  const journalContextBadges: string[] = [
    `🌱 ${plant.name} (${plant.strain || plant.type})`,
    `🌍 ${plant.setting} · ${effectiveMedium}`,
    `📅 ${plant.stage} (Day ${ageDays})`,
    trainingLogs.length > 0
      ? `✂️ Trained: ${trainingTechniques.slice(0, 3).join(", ")}`
      : "🌿 Untrained / Natural",
    lastFeed
      ? `🧪 Fed ${formatDaysAgoLabel(lastFeed.daysAgo)}: ${lastFeed.nutrients || "Nutrients"}`
      : isLivingSoil
        ? "🪱 Living Soil Web"
        : "🧪 No feeds logged yet",
    lastWater
      ? `💧 Watered ${formatDaysAgoLabel(lastWater.daysAgo)}${
          lastWater.amount ? ` (${lastWater.amount})` : ""
        }`
      : "💧 No water logged yet",
  ];

  const savedFertsLine =
    fertilizers.length > 0
      ? `Saved Fertilizers in Gardener's Shed: ${fertilizers
          .map(
            (f) =>
              `${f.name} (${f.fertilizerType}, ${f.form}${
                f.dilutionRatio ? ` @ ${f.dilutionRatio}` : ""
              })`,
          )
          .join("; ")}`
      : "";

  const promptBlock = [
    `=== LINKED PLANT JOURNAL FOR "${plant.name.toUpperCase()}" ===`,
    `- Name & Strain: ${plant.name} (${plant.strain || "Unknown strain"})`,
    `- Genetics & Stage: ${plant.type}, currently in ${plant.stage} (Total Age: Day ${ageDays}, In ${plant.stage}: ${stageDays} days)`,
    `- Growing Environment & Medium: ${plant.setting} · ${effectiveMedium}${
      isInGround
        ? " (Planted directly IN THE GROUND / garden bed — do NOT tell the gardener to lift a pot or check a runoff saucer!)"
        : ""
    }${
      isLivingSoil
        ? " (Growing in LIVING SOIL — focus on gentle organic care, soil moisture, mulch, worm castings, compost teas, and homemade brews rather than synthetic salt flushes!)"
        : ""
    }`,
    `- Watering History (${waterLogs.length} logged): ${recentWaterSummary}`,
    `- Nutrient / Feeding History (${feedLogs.length} logged): ${recentFeedsSummary}`,
    `- Training History (${trainingLogs.length} logged): ${trainingSummary}`,
    latestHeight ? `- Recorded Plant Height: ${latestHeight} cm` : "",
    latestEnvironment
      ? `- Latest Logged Environment: ${latestEnvironment.temp || "?"}°C, ${
          latestEnvironment.humidity || "?"
        }% RH`
      : "",
    savedFertsLine ? `- ${savedFertsLine}` : "",
    recentNotes.length > 0 ? `- Recent Journal Log Notes:\n  ${recentNotes.join("\n  ")}` : "",
    `========================================================`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    plantId: plant.id,
    plantName: plant.name,
    strain: plant.strain || "Home Garden Cultivar",
    plantType: plant.type || "Photoperiod",
    setting: plant.setting || "Outdoor",
    medium: effectiveMedium,
    rawMedium: plant.medium,
    stage: plant.stage,
    ageDays,
    stageDays,
    isLivingSoil,
    isInGround,
    totalLogs: logs.length,
    wateringsCount: waterLogs.length,
    lastWater,
    feedsCount: feedLogs.length,
    lastFeed,
    trainingsCount: trainingLogs.length,
    trainingTechniques,
    lastTraining,
    latestHeight,
    latestEnvironment,
    recentWaterSummary,
    recentFeedsSummary,
    trainingSummary,
    recentNotes,
    latestPhoto,
    journalContextBadges,
    promptBlock,
  };
}
