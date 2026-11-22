import React, { useState, useEffect } from "react";
import {
  diagnosePlantPhoto,
  type PlantDiagnosisResult,
  type ImageAnalysisMetrics,
  type PhotoSlotType,
} from "@/lib/gemini";
import type { Plant } from "@/hooks/use-plants";
import type { HomemadeFertilizer } from "@/hooks/use-fertilizers";
import { buildPlantJournalSummary, normalizeMediumLabel } from "@/lib/journal-context";
import {
  Camera,
  Upload,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Activity,
  History,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
  BookOpen,
  Check,
  Sprout,
  ChevronRight,
  Clock,
  Loader2,
  Trash2,
  Layers,
  Search,
  Eye,
  Plus,
  FlaskConical,
} from "lucide-react";

export interface SavedScanPhotoItem {
  slot: PhotoSlotType;
  label: string;
  dataUrl: string;
}

interface SavedScan {
  id: string;
  date: string;
  photo: string;
  photos?: SavedScanPhotoItem[];
  result: PlantDiagnosisResult;
  plantName?: string;
  plantIds?: string[];
}

const SCANS_STORAGE_KEY = "canopy-ai-scans-v1";

interface CompressResult {
  dataUrl: string;
  metrics: ImageAnalysisMetrics;
}

interface SlotMeta {
  id: PhotoSlotType;
  title: string;
  shortLabel: string;
  badge: string;
  description: string;
  recommendation: string;
  placeholderPrompt: string;
}

const PHOTO_SLOTS: SlotMeta[] = [
  {
    id: "canopy",
    title: "1. Whole Plant Photo",
    shortLabel: "Whole Plant",
    badge: "Best Starting Photo",
    description:
      "Shows your plant's overall leaf colour, perkiness, and how happily it is growing.",
    recommendation: "Take from 1–2 feet back showing most of the plant",
    placeholderPrompt: "Whole plant or main leaves",
  },
  {
    id: "macro",
    title: "2. Close-Up of a Leaf",
    shortLabel: "Leaf Close-Up",
    badge: "Great for Spots & Bugs",
    description:
      "Helps spot tiny garden bugs, little brown or yellow spots, or powdery marks on leaves.",
    recommendation: "Get a clear close-up of a problem leaf (top or underside)",
    placeholderPrompt: "Close-up of a leaf with spots or marks",
  },
  {
    id: "substrate",
    title: "3. Soil or Pot Base",
    shortLabel: "Soil / Pot",
    badge: "Optional",
    description: "Checks if the soil looks too dry, soggy, or has white fertilizer crust on top.",
    recommendation: "Photo of the top of the soil or pot base",
    placeholderPrompt: "Top of soil or pot base",
  },
];

// Friendly plain-English translator for any older saved scans in localStorage
function simplifyTextForHomeGardener(text: string): string {
  if (!text) return text;
  return text
    .replace(/Healthy Vigorous Canopy/gi, "Happy & Healthy Plant")
    .replace(
      /Calcium \/ Magnesium \(Cal-Mag\) Deficiency/gi,
      "Needs a Little Calcium & Magnesium (Leaf Spots)",
    )
    .replace(
      /Mobile Nitrogen \(N\) Deficiency/gi,
      "Hungry Plant — Needs a General Feed (Yellowing Leaves)",
    )
    .replace(/Canopy Light \/ Heat Stress/gi, "Mild Heat or Bright Light Stress")
    .replace(/Root Zone Overwatering \/ Hypoxia/gi, "Soil Staying Too Wet (Overwatered)")
    .replace(
      /Nutrient Burn \(Excess EC \/ Salt Toxicity\)/gi,
      "Slightly Too Much Plant Food (Fertilizer Tip Burn)",
    )
    .replace(/interveinal chlorosis/gi, "yellowing between the leaf veins")
    .replace(/necrotic margins/gi, "crispy brown leaf edges")
    .replace(/necrotic/gi, "brown and crispy")
    .replace(/chlorosis/gi, "yellowing")
    .replace(/turgidity/gi, "leaf perkiness")
    .replace(/turgor/gi, "perkiness");
}

// Client-side visual color and canopy metric extractor
function extractImageMetrics(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): ImageAnalysisMetrics {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  let totalBrightness = 0;
  let greenCount = 0;
  let healthyGreenCount = 0;
  let yellowCount = 0;
  let brownCount = 0;
  let darkGreenCount = 0;

  // Sample every 4th pixel for high performance and accuracy
  const step = 4;
  let sampled = 0;

  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    sampled++;

    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
    totalBrightness += brightness;

    // RGB to Hue approximation
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;

    if (d > 10) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }

    // Classify foliage hues:
    // Green hues: 75° to 155°
    if (h >= 75 && h <= 155 && g > r * 0.95 && g > b) {
      greenCount++;
      if (g > 100 && g > r * 1.15 && brightness >= 70 && brightness <= 190) {
        healthyGreenCount++;
      } else if (brightness < 60) {
        darkGreenCount++;
      }
    }
    // Chlorosis / Yellow hues: 42° to 74° with high red/green balance
    else if (h >= 42 && h <= 74 && r > 100 && g > 100 && b < 120) {
      yellowCount++;
    }
    // Necrosis / Brown hues: 15° to 41° or dark rusted discoloration
    else if ((h >= 15 && h <= 41 && r > g && r > 60) || (brightness < 45 && r > 50)) {
      brownCount++;
    }
  }

  const denom = sampled || 1;
  return {
    averageBrightness: Math.round(totalBrightness / denom),
    greenRatio: +(greenCount / denom).toFixed(3),
    healthyGreenRatio: +(healthyGreenCount / denom).toFixed(3),
    yellowRatio: +(yellowCount / denom).toFixed(3),
    brownRatio: +(brownCount / denom).toFixed(3),
    darkGreenRatio: +(darkGreenCount / denom).toFixed(3),
  };
}

function compressAndAnalyzeImage(file: File): Promise<CompressResult> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        URL.revokeObjectURL(objectUrl);
        const maxDim = 640;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((img.width || 640) * scale));
        canvas.height = Math.max(1, Math.round((img.height || 640) * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const metrics = extractImageMetrics(ctx, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.65);
        resolve({ dataUrl, metrics });
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Failed to compress image"));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to decode image file"));
    };
    img.src = objectUrl;
  });
}

export interface AIDoctorProps {
  plants?: Plant[];
  fertilizers?: HomemadeFertilizer[];
  initialSelectedPlantId?: string | null;
  onSaveDiagnosisToPlants?: (
    plantIds: string[],
    logData: { note: string; photo: string },
  ) => Promise<void> | void;
  onNavigateToPlant?: (plantId: string) => void;
  onNavigateToPlantsList?: () => void;
}

export const AIDoctor: React.FC<AIDoctorProps> = ({
  plants = [],
  fertilizers = [],
  initialSelectedPlantId = null,
  onSaveDiagnosisToPlants,
  onNavigateToPlant,
  onNavigateToPlantsList,
}) => {
  // Multi-angle photo state: supports Canopy, Macro Leaf Underside, and Substrate
  const [photoSlots, setPhotoSlots] = useState<
    Record<PhotoSlotType, { dataUrl: string | null; metrics: ImageAnalysisMetrics | null }>
  >({
    canopy: { dataUrl: null, metrics: null },
    macro: { dataUrl: null, metrics: null },
    substrate: { dataUrl: null, metrics: null },
  });

  const [activeSlot, setActiveSlot] = useState<PhotoSlotType>("canopy");
  const [activeResultPhotoIndex, setActiveResultPhotoIndex] = useState(0);

  const [loading, setLoading] = useState(false);
  const [stageContext, setStageContext] = useState("Vegetative");
  const [mediumContext, setMediumContext] = useState("Soil");
  const [plantNotes, setPlantNotes] = useState("");
  const [result, setResult] = useState<PlantDiagnosisResult | null>(null);
  const [savedScans, setSavedScans] = useState<SavedScan[]>([]);
  const [selectedScan, setSelectedScan] = useState<SavedScan | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Multi-plant selection: allows logging to 1, multiple, or all plants!
  const [selectedPlantIds, setSelectedPlantIds] = useState<string[]>(() => {
    if (initialSelectedPlantId) return [initialSelectedPlantId];
    if (plants.length > 0) return [plants[0]!.id];
    return [];
  });
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [isDragging, setIsDragging] = useState(false);
  const [showAdvancedNumbers, setShowAdvancedNumbers] = useState(false);

  // Active elapsed seconds timer during diagnosis
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (loading) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(timer);
  }, [loading]);

  const countAddedPhotos = () => {
    return (Object.keys(photoSlots) as PhotoSlotType[]).filter(
      (s) => photoSlots[s].dataUrl !== null,
    ).length;
  };

  const getProgressStage = (seconds: number) => {
    const photoCount = countAddedPhotos();
    if (seconds < 1.5) {
      return {
        step: 1,
        title:
          photoCount > 1
            ? `Checking your ${photoCount} plant photos…`
            : "Checking leaf colour & plant perkiness…",
        detail:
          photoCount > 1
            ? "Comparing your whole plant view with your close-up photo…"
            : "Looking at healthy green colour, yellowing, or crispy edges…",
        progress: Math.min(45, 20 + seconds * 20),
        eta: "about 2s left",
      };
    }
    if (seconds < 3) {
      return {
        step: 2,
        title: "Looking closely for hunger signs, bugs, or watering issues…",
        detail:
          "Checking if your plant is thirsty, hungry for plant food, or getting too much light…",
        progress: Math.min(85, 55 + (seconds - 1.5) * 20),
        eta: "about 1s left",
      };
    }
    return {
      step: 3,
      title: "Putting together your easy home-gardener care guide…",
      detail: "Writing simple step-by-step tips to get your plant thriving…",
      progress: Math.min(98, 90 + (seconds - 3) * 5),
      eta: "finishing up…",
    };
  };

  // Sync initial plant selection if prop changes
  useEffect(() => {
    if (initialSelectedPlantId && plants.some((p) => p.id === initialSelectedPlantId)) {
      setSelectedPlantIds([initialSelectedPlantId]);
    } else if (selectedPlantIds.length === 0 && plants.length > 0) {
      setSelectedPlantIds([plants[0]!.id]);
    }
  }, [initialSelectedPlantId, plants, selectedPlantIds.length]);

  // Automatically sync Growth Stage and Growing Medium from the selected plant's journal
  useEffect(() => {
    const primaryId = selectedPlantIds[0];
    if (!primaryId) return;
    const target = plants.find((p) => p.id === primaryId);
    if (target) {
      const summary = buildPlantJournalSummary(target, fertilizers);
      setStageContext(target.stage);
      setMediumContext(summary.medium);
    }
  }, [selectedPlantIds, plants, fertilizers]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SCANS_STORAGE_KEY);
      if (stored) {
        setSavedScans(JSON.parse(stored));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const togglePlantSelection = (id: string) => {
    setSelectedPlantIds((prev) => {
      const next = prev.includes(id) ? prev.filter((pId) => pId !== id) : [id];
      if (next.length >= 1) {
        const p = plants.find((x) => x.id === next[0]);
        if (p) {
          setStageContext(p.stage);
          setMediumContext(normalizeMediumLabel(p.medium));
        }
      }
      return next;
    });
  };

  const selectAllPlants = () => {
    if (selectedPlantIds.length === plants.length) {
      setSelectedPlantIds([]);
    } else {
      setSelectedPlantIds(plants.map((p) => p.id));
    }
  };

  const handleFileForSlot = async (file: File, targetSlot: PhotoSlotType) => {
    const isImage =
      file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name);
    if (!isImage) {
      setErrorMsg("Please select an image file (e.g. JPG, PNG, WEBP, HEIC).");
      return;
    }
    try {
      const { dataUrl, metrics: extractedMetrics } = await compressAndAnalyzeImage(file);
      setPhotoSlots((prev) => ({
        ...prev,
        [targetSlot]: { dataUrl, metrics: extractedMetrics },
      }));
      setResult(null);
      setErrorMsg("");
      setSaveSuccessMsg(null);
    } catch {
      setErrorMsg(`Failed to process image for ${targetSlot}. Please try again.`);
    }
  };

  const handleBatchFiles = async (fileList: FileList, preferredSlot?: PhotoSlotType) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const slotOrder: PhotoSlotType[] = ["canopy", "macro", "substrate"];
    let startIdx = preferredSlot ? slotOrder.indexOf(preferredSlot) : 0;
    if (startIdx === -1) startIdx = 0;

    for (let i = 0; i < files.length && i < 3; i++) {
      const file = files[i];
      if (file) {
        const slot = slotOrder[(startIdx + i) % slotOrder.length]!;
        await handleFileForSlot(file, slot);
      }
    }
  };

  const handleRemovePhoto = (slot: PhotoSlotType, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPhotoSlots((prev) => ({
      ...prev,
      [slot]: { dataUrl: null, metrics: null },
    }));
    setResult(null);
    setErrorMsg("");
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleBatchFiles(e.dataTransfer.files, activeSlot);
    }
  };

  const getActivePhotosList = () => {
    const list: {
      slot: PhotoSlotType;
      dataUrl: string;
      metrics?: ImageAnalysisMetrics;
      label: string;
    }[] = [];

    const slotMetaMap: Record<PhotoSlotType, string> = {
      canopy: "Canopy / Overall View",
      macro: "Macro Leaf Underside",
      substrate: "Substrate & Root Zone",
    };

    (["canopy", "macro", "substrate"] as PhotoSlotType[]).forEach((s) => {
      const item = photoSlots[s];
      if (item.dataUrl) {
        list.push({
          slot: s,
          dataUrl: item.dataUrl,
          metrics: item.metrics || undefined,
          label: slotMetaMap[s],
        });
      }
    });

    return list;
  };

  const saveScanToLocalHistory = (
    res: PlantDiagnosisResult,
    analyzedPhotos: { slot: PhotoSlotType; dataUrl: string; label: string }[],
  ) => {
    const targetNames = plants
      .filter((p) => selectedPlantIds.includes(p.id))
      .map((p) => p.name)
      .join(", ");

    const savedPhotoItems: SavedScanPhotoItem[] = analyzedPhotos.map((p) => ({
      slot: p.slot,
      label: p.label,
      dataUrl: p.dataUrl,
    }));

    const primaryPhoto = analyzedPhotos[0]?.dataUrl || "";

    const newScan: SavedScan = {
      id: Math.random().toString(36).slice(2, 10),
      date: new Date().toISOString(),
      photo: primaryPhoto,
      photos: savedPhotoItems,
      result: res,
      plantName: targetNames || plantNotes.slice(0, 30) || undefined,
      plantIds: selectedPlantIds,
    };
    const updated = [newScan, ...savedScans].slice(0, 10);
    setSavedScans(updated);
    try {
      localStorage.setItem(SCANS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      try {
        localStorage.setItem(SCANS_STORAGE_KEY, JSON.stringify(updated.slice(0, 3)));
      } catch {
        // Storage quota safety
      }
    }
  };

  const runDiagnosis = async () => {
    const activePhotos = getActivePhotosList();
    if (activePhotos.length === 0) {
      setErrorMsg(
        "Please upload or snap at least one photo (e.g. Canopy or Leaf) before diagnosing.",
      );
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSaveSuccessMsg(null);

    const selectedPlants = plants.filter((p) => selectedPlantIds.includes(p.id));
    const linkedSummaries = selectedPlants.map((p) => buildPlantJournalSummary(p, fertilizers));
    const primaryJournal = linkedSummaries[0];
    const targetNames = selectedPlants
      .map((p) => `${p.name} (${p.strain || "No strain"})`)
      .join(", ");

    try {
      const anglesInspectedText = activePhotos.map((p) => p.label).join(", ");
      const journalPromptBlocks = linkedSummaries.map((s) => s.promptBlock).join("\n\n");
      const contextStr = `Stage: ${stageContext}, Medium: ${mediumContext}. Angles provided: [${anglesInspectedText}]. Notes: ${plantNotes} ${
        targetNames ? `[Target Plants: ${targetNames}]` : ""
      }\n${journalPromptBlocks}`;

      const diag = await diagnosePlantPhoto({
        images: activePhotos.map((p) => ({
          imageBase64: p.dataUrl,
          slot: p.slot,
          label: p.label,
          metrics: p.metrics,
        })),
        imageBase64: activePhotos[0]!.dataUrl,
        mimeType: "image/jpeg",
        plantInfo: contextStr,
        plantName: targetNames || (selectedPlants[0]?.name ?? "Cultivar"),
        stage: stageContext,
        medium: mediumContext,
        journalContext: primaryJournal
          ? {
              plantId: primaryJournal.plantId,
              plantName: primaryJournal.plantName,
              strain: primaryJournal.strain,
              plantType: primaryJournal.plantType,
              setting: primaryJournal.setting,
              medium: mediumContext || primaryJournal.medium,
              stage: stageContext || primaryJournal.stage,
              ageDays: primaryJournal.ageDays,
              stageDays: primaryJournal.stageDays,
              isLivingSoil:
                primaryJournal.isLivingSoil || mediumContext.toLowerCase().includes("living"),
              isInGround:
                primaryJournal.isInGround || mediumContext.toLowerCase().includes("ground"),
              recentWaterSummary: primaryJournal.recentWaterSummary,
              recentFeedsSummary: primaryJournal.recentFeedsSummary,
              trainingSummary: primaryJournal.trainingSummary,
              journalContextBadges: primaryJournal.journalContextBadges,
              promptBlock: journalPromptBlocks,
            }
          : undefined,
        metrics: activePhotos[0]?.metrics,
      });

      setResult(diag);
      setActiveResultPhotoIndex(0);
      saveScanToLocalHistory(diag, activePhotos);
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Diagnosis failed. Please check network connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogToSelectedPlants = async (overridePlantIds?: string[]) => {
    const diag = selectedScan ? selectedScan.result : result;
    if (!diag) return;

    const availablePhotos = selectedScan?.photos
      ? selectedScan.photos.map((p) => p.dataUrl)
      : getActivePhotosList().map((p) => p.dataUrl);

    const primaryPhoto =
      availablePhotos[0] || (selectedScan ? selectedScan.photo : photoSlots.canopy.dataUrl);
    if (!primaryPhoto) return;

    const targetIds =
      Array.isArray(overridePlantIds) && overridePlantIds.length > 0
        ? overridePlantIds
        : selectedPlantIds;

    if (targetIds.length === 0) {
      setErrorMsg("Please select at least one plant to save this diagnosis to.");
      return;
    }

    const angleCount = availablePhotos.length;
    const angleText = angleCount > 1 ? ` (${angleCount} photo angles inspected)` : "";

    const note = `[AI Doctor: ${diag.condition}${angleText}] Health: ${diag.healthScore}%. Action: ${
      diag.actionPlan[0] || "Monitor leaves"
    }`;

    if (onSaveDiagnosisToPlants) {
      await onSaveDiagnosisToPlants(targetIds, {
        note,
        photo: primaryPhoto,
      });
    }

    const targetNames = plants.filter((p) => targetIds.includes(p.id)).map((p) => p.name);

    setSaveSuccessMsg(`✓ Successfully saved diagnosis & photo to ${targetNames.join(", ")}!`);
  };

  const handleReset = () => {
    setPhotoSlots({
      canopy: { dataUrl: null, metrics: null },
      macro: { dataUrl: null, metrics: null },
      substrate: { dataUrl: null, metrics: null },
    });
    setResult(null);
    setSelectedScan(null);
    setErrorMsg("");
    setSaveSuccessMsg(null);
    setActiveSlot("canopy");
    setActiveResultPhotoIndex(0);
  };

  const severityBadge = (sev: PlantDiagnosisResult["severity"]) => {
    switch (sev) {
      case "critical":
        return "border-destructive bg-destructive/15 text-destructive";
      case "warning":
        return "border-warning bg-warning/15 text-warning";
      case "mild":
        return "border-amber-500/30 bg-amber-500/10 text-amber-400";
      default:
        return "border-primary bg-primary/15 text-primary";
    }
  };

  const currentResult = selectedScan ? selectedScan.result : result;

  // Get current photos to display in result view
  const resultPhotosToDisplay: { slot: PhotoSlotType; label: string; dataUrl: string }[] =
    selectedScan?.photos && selectedScan.photos.length > 0
      ? selectedScan.photos
      : selectedScan?.photo
        ? [{ slot: "canopy", label: "Canopy / Foliage", dataUrl: selectedScan.photo }]
        : getActivePhotosList();

  const currentResultPhoto =
    resultPhotosToDisplay[activeResultPhotoIndex]?.dataUrl ||
    resultPhotosToDisplay[0]?.dataUrl ||
    "";

  const totalPhotosCount = countAddedPhotos();

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-primary/30 bg-card p-5 relative overflow-hidden">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <Stethoscope className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">GrowBuddy Plant Doctor</h2>
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary border border-primary/30">
                  Home Gardener Friendly
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Snap a photo of your plant for an easy, plain-English health check & care guide
              </p>
            </div>
          </div>

          {currentResult && (
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/80 transition"
            >
              <RotateCcw className="h-3.5 w-3.5 text-primary" />
              <span>New Scan</span>
            </button>
          )}
        </div>
      </div>

      {/* Target Plant Selector & Live Linked Journal Card */}
      {plants.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <Sprout className="h-3.5 w-3.5 text-primary" />
              <span>Linked Plant Journal for Diagnosis</span>
            </span>
            <button
              type="button"
              onClick={selectAllPlants}
              className="text-xs font-semibold text-primary hover:underline"
            >
              {selectedPlantIds.length === plants.length
                ? "Deselect All"
                : `Select All (${plants.length})`}
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            Choose a plant below to automatically link its journal (soil/ground setup, watering,
            fertilizer feeds, and training logs) so your diagnosis is tailored specifically to it:
          </p>

          <div className="flex flex-wrap gap-2">
            {plants.map((p) => {
              const isSelected = selectedPlantIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlantSelection(p.id)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition active:scale-95 ${
                    isSelected
                      ? "border-primary bg-primary/20 text-foreground font-semibold ring-1 ring-primary shadow-sm"
                      : "border-border bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded bg-primary/30 text-[10px] text-primary font-bold">
                    {isSelected ? "✓" : ""}
                  </span>
                  <span>{p.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    ({p.medium} · {p.stage})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Plant Journal Sync Summary */}
          {(() => {
            const activePlant = plants.find((p) => selectedPlantIds.includes(p.id));
            if (!activePlant) return null;
            const summary = buildPlantJournalSummary(activePlant, fertilizers);
            return (
              <div
                data-testid="doctor-linked-journal-card"
                className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-primary">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>
                      Synced with {summary.plantName}&apos;s Journal ({summary.totalLogs} log{" "}
                      {summary.totalLogs === 1 ? "entry" : "entries"})
                    </span>
                  </div>
                  {summary.latestPhoto && !photoSlots.canopy.dataUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setPhotoSlots((prev) => ({
                          ...prev,
                          canopy: {
                            dataUrl: summary.latestPhoto!,
                            metrics: {
                              healthyGreenRatio: 0.72,
                              yellowRatio: 0.08,
                              brownRatio: 0.03,
                            },
                          },
                        }))
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-xs"
                    >
                      <Camera className="h-3 w-3" />
                      <span>Use Latest Photo from {summary.plantName}&apos;s Journal</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg border border-border/60 bg-card/80 px-2.5 py-1.5">
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                      Setup &amp; Growing Medium
                    </span>
                    <strong className="text-foreground">
                      {summary.setting} · {summary.medium} · {summary.stage} (Day {summary.ageDays})
                    </strong>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-card/80 px-2.5 py-1.5">
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                      Training Logged
                    </span>
                    <strong className="text-foreground">{summary.trainingSummary}</strong>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-card/80 px-2.5 py-1.5">
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                      Watering History
                    </span>
                    <strong className="text-foreground">{summary.recentWaterSummary}</strong>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-card/80 px-2.5 py-1.5">
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                      Nutrient &amp; Feed History
                    </span>
                    <strong className="text-foreground">{summary.recentFeedsSummary}</strong>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Main Multi-Photo Upload & Diagnostic Setup */}
      {!currentResult && (
        <div className="space-y-5">
          {/* Angle Slots Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span>Multi-Photo Inspection Angles</span>
                <span className="font-mono text-[11px] text-primary font-bold">
                  ({totalPhotosCount}/3 Angles Attached)
                </span>
              </label>

              {totalPhotosCount > 0 && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-muted-foreground hover:text-destructive transition"
                >
                  Clear all photos
                </button>
              )}
            </div>

            {/* 3 Interactive Photo Slot Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {PHOTO_SLOTS.map((slot) => {
                const photoData = photoSlots[slot.id].dataUrl;
                const isSelected = activeSlot === slot.id;

                return (
                  <div
                    key={slot.id}
                    onClick={() => setActiveSlot(slot.id)}
                    className={`relative rounded-2xl border p-3.5 transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? "border-primary bg-card ring-2 ring-primary/40 shadow-sm"
                        : "border-border bg-card/60 hover:bg-card hover:border-border/80"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span
                          className={`text-xs font-bold truncate ${
                            isSelected ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {slot.title}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                            photoData
                              ? "bg-primary/20 text-primary border border-primary/40"
                              : slot.id === "macro"
                                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {photoData ? "✓ Attached" : slot.badge}
                        </span>
                      </div>

                      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                        {slot.description}
                      </p>
                    </div>

                    {/* Thumbnail or Add CTA */}
                    <div className="mt-3 pt-2.5 border-t border-border/60">
                      {photoData ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={photoData}
                              alt={slot.shortLabel}
                              className="h-10 w-10 shrink-0 rounded-lg object-cover border border-border"
                            />
                            <div className="min-w-0">
                              <span className="text-[11px] font-medium text-foreground block truncate">
                                {slot.shortLabel} ready
                              </span>
                              <span className="text-[10px] text-primary">Click to view/change</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => handleRemovePhoto(slot.id, e)}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition"
                            title="Remove photo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[11px] text-primary font-medium">
                          <Plus className="h-3.5 w-3.5" />
                          <span>Tap to add {slot.shortLabel}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Slot Upload / Preview Dropzone */}
          {(() => {
            const currentSlotMeta = PHOTO_SLOTS.find((s) => s.id === activeSlot)!;
            const currentSlotPhoto = photoSlots[activeSlot].dataUrl;
            const currentSlotMetrics = photoSlots[activeSlot].metrics;

            return (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`rounded-2xl border border-dashed p-6 text-center transition ${
                  isDragging
                    ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                    : "border-border bg-card"
                }`}
              >
                {currentSlotPhoto ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-left max-w-sm mx-auto">
                      <div>
                        <span className="text-xs font-semibold text-primary block">
                          Current Focus: {currentSlotMeta.title}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {currentSlotMeta.recommendation}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleRemovePhoto(activeSlot, e)}
                        className="text-xs text-destructive hover:underline flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Remove</span>
                      </button>
                    </div>

                    <div className="relative mx-auto max-w-sm aspect-square rounded-xl overflow-hidden border border-border bg-secondary shadow">
                      <img
                        src={currentSlotPhoto}
                        alt="Current angle"
                        className="h-full w-full object-cover"
                      />

                      {/* Loading overlay during scan */}
                      {loading ? (
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center">
                          <div className="rounded-2xl bg-black/85 px-5 py-3.5 backdrop-blur border border-primary/40 shadow-xl space-y-1.5">
                            <div className="flex items-center justify-center gap-2 text-primary font-semibold text-xs">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Multi-Angle Scanning</span>
                            </div>
                            <p className="text-[11px] text-zinc-300 font-mono">
                              {elapsedSeconds}s elapsed · {getProgressStage(elapsedSeconds).eta}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="absolute bottom-3 right-3 flex items-center gap-2">
                          <label className="rounded-xl bg-black/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-black flex items-center gap-1.5 shadow cursor-pointer active:scale-95">
                            <Upload className="h-3.5 w-3.5" />
                            <span>Replace</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,.jpg,.jpeg,.png,.webp,.heic,application/octet-stream"
                              className="sr-only"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleFileForSlot(f, activeSlot);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <label className="rounded-xl bg-black/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-black flex items-center gap-1.5 shadow cursor-pointer active:scale-95">
                            <Camera className="h-3.5 w-3.5" />
                            <span>Retake</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="sr-only"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleFileForSlot(f, activeSlot);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Friendly leaf color preview badges */}
                    {currentSlotMetrics && (
                      <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] text-muted-foreground pt-1">
                        <span className="rounded-md bg-secondary px-2 py-1 border border-border">
                          Healthy Green:{" "}
                          <strong className="text-foreground">
                            {Math.round((currentSlotMetrics.healthyGreenRatio ?? 0) * 100)}%
                          </strong>
                        </span>
                        <span className="rounded-md bg-secondary px-2 py-1 border border-border">
                          Yellowing:{" "}
                          <strong className="text-foreground">
                            {Math.round((currentSlotMetrics.yellowRatio ?? 0) * 100)}%
                          </strong>
                        </span>
                        <span className="rounded-md bg-secondary px-2 py-1 border border-border">
                          Brown Spots:{" "}
                          <strong className="text-foreground">
                            {Math.round((currentSlotMetrics.brownRatio ?? 0) * 100)}%
                          </strong>
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 py-6">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-primary">
                      {activeSlot === "canopy" ? (
                        <Upload className="h-8 w-8" />
                      ) : activeSlot === "macro" ? (
                        <Search className="h-8 w-8" />
                      ) : (
                        <Sprout className="h-8 w-8" />
                      )}
                    </div>

                    <div>
                      <h4 className="font-semibold text-base text-foreground">
                        Add {currentSlotMeta.title}
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                        {currentSlotMeta.description}
                      </p>
                      <p className="text-[11px] text-primary/90 font-medium mt-1">
                        💡 {currentSlotMeta.recommendation}
                      </p>
                    </div>

                    <div className="flex flex-col items-center gap-3">
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        {/* Primary Button: Upload from Gallery / Files */}
                        <label className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition active:scale-95 shadow cursor-pointer">
                          <Upload className="h-4 w-4" />
                          <span>Upload {currentSlotMeta.shortLabel}</span>
                          <input
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,.jpg,.jpeg,.png,.webp,.heic,application/octet-stream"
                            className="sr-only"
                            onChange={(e) => {
                              if (e.target.files) handleBatchFiles(e.target.files, activeSlot);
                              e.target.value = "";
                            }}
                          />
                        </label>

                        {/* Secondary Button: Take Photo with Camera */}
                        <label className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-xs font-semibold text-primary hover:bg-primary/20 transition active:scale-95 cursor-pointer">
                          <Camera className="h-4 w-4" />
                          <span>Snap with Camera</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="sr-only"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleFileForSlot(f, activeSlot);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        Tip: You can select multiple images at once to auto-populate Canopy, Macro,
                        and Substrate.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Cultivation context inputs */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3 text-left">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                Plant Setup &amp; Notes (Auto-Synced from Journal)
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Growth Stage
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Germination",
                    "Seedling",
                    "Vegetative",
                    "Flowering",
                    "Early Bloom",
                    "Late Bloom",
                  ].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStageContext(s)}
                      disabled={loading}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        stageContext.toLowerCase() === s.toLowerCase()
                          ? "border-primary bg-primary text-primary-foreground font-semibold"
                          : "border-border text-muted-foreground hover:bg-secondary"
                      } disabled:opacity-60`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Growing Medium / Ground Setup
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Soil",
                    "Living Soil",
                    "Living Soil (In the Ground)",
                    "In the Ground",
                    "Coco Coir",
                    "Hydro / DWC",
                  ].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMediumContext(m)}
                      disabled={loading}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        mediumContext.toLowerCase() === m.toLowerCase()
                          ? "border-primary bg-primary text-primary-foreground font-semibold"
                          : "border-border text-muted-foreground hover:bg-secondary"
                      } disabled:opacity-60`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Optional extra notes (e.g. planted in backyard bed, fed worm tea yesterday, lower leaves yellowing)"
                  value={plantNotes}
                  onChange={(e) => setPlantNotes(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-xl border bg-secondary px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring text-foreground disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          {/* Live Diagnostic Wait Time & Step Progress Card (Shown during analysis) */}
          {loading && (
            <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 space-y-3 text-left">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  <span className="text-xs font-semibold text-foreground truncate">
                    {getProgressStage(elapsedSeconds).title}
                  </span>
                </div>
                <span className="shrink-0 text-[11px] font-mono font-medium text-primary bg-primary/20 px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-primary/30">
                  <Clock className="h-3 w-3" />
                  <span>{elapsedSeconds}s elapsed</span>
                </span>
              </div>

              {/* Animated Progress Bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/80">
                <div
                  className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${getProgressStage(elapsedSeconds).progress}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="truncate pr-2">{getProgressStage(elapsedSeconds).detail}</span>
                <span className="shrink-0 font-medium text-primary font-mono">
                  {getProgressStage(elapsedSeconds).eta}
                </span>
              </div>

              <div className="pt-1 border-t border-primary/20 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Step {getProgressStage(elapsedSeconds).step} of 3</span>
                <span>Expected total wait: ~3–4 seconds</span>
              </div>
            </div>
          )}

          {/* Diagnostic Action Button */}
          <div className="space-y-2">
            <button
              onClick={runDiagnosis}
              disabled={loading || totalPhotosCount === 0}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50 shadow"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
                  <span>
                    Analyzing {totalPhotosCount} photo angle{totalPhotosCount > 1 ? "s" : ""}… (
                    {elapsedSeconds}s)
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>
                    {totalPhotosCount === 0
                      ? "Add at least 1 photo to run diagnosis"
                      : totalPhotosCount === 1
                        ? "Run Diagnosis (1 Photo Angle)"
                        : `Run Multi-Angle Diagnosis (${totalPhotosCount} Angles Cross-Referenced)`}
                    {selectedPlantIds.length > 0 &&
                      ` · ${selectedPlantIds.length} plant${
                        selectedPlantIds.length > 1 ? "s" : ""
                      }`}
                  </span>
                </>
              )}
            </button>

            {totalPhotosCount === 1 && !loading && (
              <p className="text-[11px] text-center text-muted-foreground">
                💡 Tip: Add a <strong>Macro Leaf Underside</strong> photo above for spider mite,
                thrip, and powdery mildew detection!
              </p>
            )}

            {!loading && totalPhotosCount > 0 && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-1">
                <Clock className="h-3.5 w-3.5 text-primary" />
                <span>
                  Estimated wait time:{" "}
                  <strong className="text-foreground font-semibold">~3–4 seconds</strong> (Instant
                  multimodal AI)
                </span>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* Diagnosis Results Card */}
      {currentResult && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>New Diagnosis</span>
            </button>
            <div className="flex items-center gap-2">
              {currentResult.photosAnalyzed && currentResult.photosAnalyzed > 1 && (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  <span>{currentResult.photosAnalyzed} Angles Cross-Referenced</span>
                </span>
              )}
              {currentResult.source === "visual-heuristics" && (
                <span className="rounded-full border border-info/30 bg-info/10 px-2 py-0.5 text-[10px] font-medium text-info">
                  Visual Metric Scan
                </span>
              )}
              {currentResult.source === "gemini-3.8-flash" && (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  ✨ Gemini 3.8 Vision
                </span>
              )}
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${severityBadge(
                  currentResult.severity,
                )}`}
              >
                {currentResult.severity}
              </span>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
            {/* Multi-Photo Switcher Bar in Results */}
            {resultPhotosToDisplay.length > 1 && (
              <div className="px-5 pt-4 pb-2 border-b border-border/60 bg-secondary/30 flex items-center gap-2 overflow-x-auto">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5 text-primary" />
                  <span>Inspected Angles:</span>
                </span>
                {resultPhotosToDisplay.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveResultPhotoIndex(idx)}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition shrink-0 ${
                      activeResultPhotoIndex === idx
                        ? "border-primary bg-primary text-primary-foreground font-semibold shadow-sm"
                        : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <img
                      src={p.dataUrl}
                      alt={p.label}
                      className="h-4 w-4 rounded object-cover border border-white/20"
                    />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Split Header with Photo & Friendly Summary */}
            <div className="p-5 border-b border-border space-y-4">
              <div className="flex gap-4 items-start">
                {currentResultPhoto && (
                  <div className="h-24 w-24 shrink-0 rounded-xl overflow-hidden border border-border bg-secondary shadow">
                    <img
                      src={currentResultPhoto}
                      alt="Analyzed angle"
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs uppercase tracking-wider text-primary font-semibold">
                      What&apos;s Going On With Your Plant
                    </p>
                    {resultPhotosToDisplay.length > 1 && (
                      <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.2 rounded-full border border-primary/20">
                        {resultPhotosToDisplay.length} Photos Checked
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-foreground mt-0.5 leading-snug">
                    {simplifyTextForHomeGardener(currentResult.condition)}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Activity className="h-3.5 w-3.5 text-primary" />
                      Plant Health Score:{" "}
                      <strong className="text-foreground">{currentResult.healthScore}%</strong>
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      Match Confidence:{" "}
                      <strong className="text-foreground">{currentResult.confidence}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5 space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary block">
                  In Plain English:
                </span>
                <p className="text-sm text-foreground leading-relaxed">
                  {simplifyTextForHomeGardener(currentResult.summary)}
                </p>

                {currentResult.journalContextUsed &&
                  currentResult.journalContextUsed.length > 0 && (
                    <div className="pt-2 border-t border-primary/20">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary block mb-1.5">
                        ✓ Tailored Using Your Linked Plant Journal:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {currentResult.journalContextUsed.map((badge, bIdx) => (
                          <span
                            key={bIdx}
                            className="rounded-lg border border-primary/30 bg-card/90 px-2 py-0.5 text-[11px] font-medium text-foreground"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </div>

            {/* Step-by-Step Fix Plan First (Most Helpful for Home Gardeners!) */}
            <div className="p-5 border-b border-border bg-card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-primary" />
                  <span>Easy Step-by-Step Care Plan</span>
                </h4>
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground border border-border">
                  Expected bounce-back:{" "}
                  <strong className="text-foreground">{currentResult.estimatedRecoveryDays}</strong>
                </span>
              </div>

              <div className="space-y-2">
                {currentResult.actionPlan.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 rounded-xl border border-border bg-secondary/50 p-3.5 text-xs sm:text-sm"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm">
                      {idx + 1}
                    </span>
                    <span className="text-foreground leading-relaxed pt-0.5">
                      {simplifyTextForHomeGardener(step)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* What We Spotted & Why It Happens */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 border-b border-border bg-secondary/20">
              <div className="rounded-xl border border-border/70 bg-card/70 p-3.5">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  <span>What We Spotted on the Plant</span>
                </h4>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  {currentResult.symptoms.map((sym, idx) => (
                    <li key={idx} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-primary font-bold">•</span>
                      <span className="text-foreground/90">{simplifyTextForHomeGardener(sym)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-border/70 bg-card/70 p-3.5">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-info" />
                  <span>Why This Usually Happens</span>
                </h4>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  {currentResult.possibleCauses.map((cause, idx) => (
                    <li key={idx} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-info font-bold">•</span>
                      <span className="text-foreground/90">
                        {simplifyTextForHomeGardener(cause)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Friendly Explanation & Optional Advanced Numbers */}
            {currentResult.scientificEvidence && (
              <div className="p-5 border-b border-border bg-card/60 space-y-3.5">
                <div className="rounded-xl border border-border bg-secondary/40 p-3.5 text-xs leading-relaxed text-foreground">
                  <strong className="text-primary font-semibold block mb-1">
                    🌱 Why Your Plant Is Acting This Way:
                  </strong>
                  {simplifyTextForHomeGardener(currentResult.scientificEvidence.pathologyReasoning)}
                </div>

                {/* Identified Markers Chips */}
                {currentResult.scientificEvidence.identifiedMarkers &&
                  currentResult.scientificEvidence.identifiedMarkers.length > 0 && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">
                        Visual Clues Found in Your Photo:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {currentResult.scientificEvidence.identifiedMarkers.map((marker, mIdx) => (
                          <span
                            key={mIdx}
                            className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/60 px-2.5 py-1 text-[11px] font-medium text-foreground"
                          >
                            <Check className="h-3 w-3 text-primary" />
                            <span>{simplifyTextForHomeGardener(marker)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Collapsible Optional Water & Feeding Numbers for Curious Growers */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedNumbers((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition"
                  >
                    <FlaskConical className="h-3.5 w-3.5 text-primary" />
                    <span>
                      {showAdvancedNumbers
                        ? "Hide Optional Water & Feeding Numbers (pH / Strength)"
                        : "Show Optional Water & Feeding Numbers (pH / Strength)"}
                    </span>
                    <ChevronRight
                      className={`h-3.5 w-3.5 transition-transform ${
                        showAdvancedNumbers ? "rotate-90" : ""
                      }`}
                    />
                  </button>

                  {showAdvancedNumbers && (
                    <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="rounded-xl border border-border bg-secondary/40 p-2.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-medium">
                          Where It Shows First
                        </span>
                        <span className="text-xs font-bold text-foreground mt-0.5 block">
                          {currentResult.scientificEvidence.nutrientMobility}
                        </span>
                      </div>

                      <div className="rounded-xl border border-border bg-secondary/40 p-2.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-medium">
                          Ideal Water pH
                        </span>
                        <span className="text-xs font-bold text-foreground mt-0.5 block">
                          Soil: {currentResult.scientificEvidence.targetPH.soil}
                        </span>
                        <span className="text-[9px] text-muted-foreground block">
                          Coco/Hydro: {currentResult.scientificEvidence.targetPH.cocoHydro}
                        </span>
                      </div>

                      <div className="rounded-xl border border-border bg-secondary/40 p-2.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-medium">
                          Feed Strength
                        </span>
                        <span className="text-xs font-bold text-foreground mt-0.5 block">
                          {currentResult.scientificEvidence.targetEC}
                        </span>
                        <span className="text-[9px] text-muted-foreground block">
                          Light to Medium Feed
                        </span>
                      </div>

                      <div className="rounded-xl border border-border bg-secondary/40 p-2.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-medium">
                          Room Comfort
                        </span>
                        <span className="text-xs font-bold text-foreground mt-0.5 block">
                          {currentResult.scientificEvidence.targetVPD}
                        </span>
                        <span className="text-[9px] text-muted-foreground block">
                          Gentle Warmth & Air
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Preventive Tips */}
            {currentResult.preventiveTips.length > 0 && (
              <div className="p-5 border-t border-border bg-secondary/10 space-y-2">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Easy Tips to Keep Your Plant Happy
                </h4>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  {currentResult.preventiveTips.map((tip, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-primary font-bold">✓</span>
                      <span className="text-foreground/90">{simplifyTextForHomeGardener(tip)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Multi-Plant Diary Logger */}
            <div className="p-5 border-t border-border bg-card space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span>Log to Plant Journal</span>
                </span>
                {plants.length > 0 && (
                  <button
                    type="button"
                    onClick={selectAllPlants}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    {selectedPlantIds.length === plants.length
                      ? "Clear All"
                      : `Select All (${plants.length})`}
                  </button>
                )}
              </div>

              {plants.length > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Select which plant(s) to attach this multi-angle diagnosis to:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {plants.map((p) => {
                      const isChecked = selectedPlantIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => togglePlantSelection(p.id)}
                          className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left text-xs transition ${
                            isChecked
                              ? "border-primary bg-primary/15 text-foreground ring-1 ring-primary font-medium"
                              : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary"
                          }`}
                        >
                          <div
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              isChecked
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background"
                            }`}
                          >
                            {isChecked && <Check className="h-3 w-3" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-foreground">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {p.strain || "Cultivar"} · {p.stage}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <button
                      onClick={() => handleLogToSelectedPlants()}
                      disabled={selectedPlantIds.length === 0}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50 shadow"
                    >
                      <BookOpen className="h-4 w-4" />
                      <span>
                        Save to {selectedPlantIds.length} Selected Plant
                        {selectedPlantIds.length === 1 ? "" : "s"}
                      </span>
                    </button>

                    {selectedPlantIds.length < plants.length && (
                      <button
                        onClick={() => {
                          const allIds = plants.map((p) => p.id);
                          setSelectedPlantIds(allIds);
                          void handleLogToSelectedPlants(allIds);
                        }}
                        className="rounded-xl border border-border bg-secondary px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-secondary/80 transition"
                      >
                        Save to All {plants.length} Plants
                      </button>
                    )}
                  </div>

                  {saveSuccessMsg && (
                    <div className="rounded-xl border border-primary/40 bg-primary/10 p-3 text-xs text-foreground flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                        <span>{saveSuccessMsg}</span>
                      </div>
                      {onNavigateToPlantsList && (
                        <button
                          onClick={onNavigateToPlantsList}
                          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline shrink-0"
                        >
                          <span>View in Diary</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-4 text-center space-y-2">
                  <p className="text-xs text-muted-foreground">
                    You haven't added any plants yet to attach this diagnosis to.
                  </p>
                  {onNavigateToPlantsList && (
                    <button
                      onClick={onNavigateToPlantsList}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    >
                      <Sprout className="h-3.5 w-3.5" />
                      <span>Go to My Grows to create a plant</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History of Past Scans */}
      {savedScans.length > 0 && (
        <section className="space-y-3 pt-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <History className="h-4 w-4" />
            <h3 className="text-sm font-semibold text-foreground">Diagnosis History</h3>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {savedScans.map((scan) => (
              <button
                key={scan.id}
                onClick={() => {
                  setSelectedScan(scan);
                  setSaveSuccessMsg(null);
                  setActiveResultPhotoIndex(0);
                }}
                className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition ${
                  selectedScan?.id === scan.id
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border bg-card hover:bg-secondary/60"
                }`}
              >
                <div className="relative h-10 w-10 shrink-0">
                  <img
                    src={scan.photo}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg object-cover bg-secondary"
                  />
                  {scan.photos && scan.photos.length > 1 && (
                    <span className="absolute -bottom-1 -right-1 rounded bg-black/80 px-1 py-0.2 text-[8px] font-mono text-white backdrop-blur">
                      +{scan.photos.length - 1}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {scan.result.condition}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(scan.date).toLocaleDateString()} · {scan.result.healthScore}%
                    {scan.photos && scan.photos.length > 1 ? ` · ${scan.photos.length} angles` : ""}
                  </p>
                  {scan.plantName && (
                    <p className="truncate text-[10px] text-primary/80">🌿 {scan.plantName}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
