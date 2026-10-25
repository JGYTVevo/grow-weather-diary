import React, { useState, useEffect } from "react";
import {
  diagnosePlantPhoto,
  type PlantDiagnosisResult,
  type ImageAnalysisMetrics,
  type PhotoSlotType,
  type DoctorChatContext,
} from "@/lib/gemini";
import type { Plant } from "@/hooks/use-plants";
import { AIDoctorChat } from "./AIDoctorChat";
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
  Bot,
  MessageSquare,
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
    title: "1. Canopy / Overall View",
    shortLabel: "Canopy",
    badge: "Required / Primary",
    description:
      "Evaluates overall plant posture, leaf droop vs praying, light intensity, and top-down vs bottom-up chlorosis progression.",
    recommendation: "Take from 1-2 feet back showing entire canopy",
    placeholderPrompt: "Whole plant or main canopy posture",
  },
  {
    id: "macro",
    title: "2. Macro Leaf Underside / Close-up",
    shortLabel: "Leaf Underside",
    badge: "Recommended for Pests",
    description:
      "Crucial for microscopic pests (spider mites, thrips, aphid molts), webbing, stippling, and powdery mildew patches.",
    recommendation: "Close-up of affected leaf surface or underside in focus",
    placeholderPrompt: "Close-up of affected leaf or underside",
  },
  {
    id: "substrate",
    title: "3. Substrate & Root Zone",
    shortLabel: "Substrate",
    badge: "Optional for Lockout",
    description:
      "Inspects soil or coco coir surface, salt crust accumulation, moisture saturation, and root aeration.",
    recommendation: "Top of growing medium, pot drainage, or root collar",
    placeholderPrompt: "Soil/coco surface, runoff, or pot base",
  },
];

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
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 800;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const metrics = extractImageMetrics(ctx, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      resolve({ dataUrl, metrics });
    };
    img.src = URL.createObjectURL(file);
  });
}

export interface AIDoctorProps {
  plants?: Plant[];
  initialSelectedPlantId?: string | null;
  initialMode?: "scan" | "chat";
  onSaveDiagnosisToPlants?: (
    plantIds: string[],
    logData: { note: string; photo: string },
  ) => Promise<void> | void;
  onNavigateToPlant?: (plantId: string) => void;
  onNavigateToPlantsList?: () => void;
}

export const AIDoctor: React.FC<AIDoctorProps> = ({
  plants = [],
  initialSelectedPlantId = null,
  initialMode = "scan",
  onSaveDiagnosisToPlants,
  onNavigateToPlant,
  onNavigateToPlantsList,
}) => {
  // Mode: Visual Scan vs Interactive AI Doctor Chat
  const [doctorMode, setDoctorMode] = useState<"scan" | "chat">(initialMode);
  const [chatContext, setChatContext] = useState<DoctorChatContext | undefined>(undefined);

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
            ? `Scanning ${photoCount} photo angles for foliar pigmentation & pests`
            : "Scanning foliar pigmentation & leaf structure",
        detail:
          photoCount > 1
            ? "Cross-referencing canopy foliar balance with macro leaf underside…"
            : "Evaluating chlorophyll balance, color spectrum & margins…",
        progress: Math.min(45, 20 + seconds * 20),
        eta: "approx. 2s remaining",
      };
    }
    if (seconds < 3) {
      return {
        step: 2,
        title: "Cross-referencing symptoms with diagnostic engine",
        detail:
          "Inspecting for two-spotted spider mites, thrips, cal-mag, nutrient lockouts & pathogens…",
        progress: Math.min(85, 55 + (seconds - 1.5) * 20),
        eta: "approx. 1s remaining",
      };
    }
    return {
      step: 3,
      title: "Finalizing multi-angle diagnosis report & health score",
      detail: "Synthesizing remediation action plan and recovery timeline…",
      progress: Math.min(98, 90 + (seconds - 3) * 5),
      eta: "completing now…",
    };
  };

  // Sync initial plant selection if prop changes
  useEffect(() => {
    if (initialSelectedPlantId && plants.some((p) => p.id === initialSelectedPlantId)) {
      setSelectedPlantIds([initialSelectedPlantId]);
      const target = plants.find((p) => p.id === initialSelectedPlantId);
      if (target) {
        setStageContext(target.stage);
        setMediumContext(target.medium);
      }
    }
  }, [initialSelectedPlantId, plants]);

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
      const next = prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id];
      if (next.length === 1) {
        const p = plants.find((x) => x.id === next[0]);
        if (p) {
          setStageContext(p.stage);
          setMediumContext(p.medium);
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
    const updated = [newScan, ...savedScans].slice(0, 20);
    setSavedScans(updated);
    try {
      localStorage.setItem(SCANS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Storage quota safety
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
    const targetNames = selectedPlants
      .map((p) => `${p.name} (${p.strain || "No strain"})`)
      .join(", ");

    try {
      const anglesInspectedText = activePhotos.map((p) => p.label).join(", ");
      const contextStr = `Stage: ${stageContext}, Medium: ${mediumContext}. Angles provided: [${anglesInspectedText}]. Notes: ${plantNotes} ${
        targetNames ? `[Target Plants: ${targetNames}]` : ""
      }`;

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

  const handleLogToSelectedPlants = async () => {
    const diag = selectedScan ? selectedScan.result : result;
    if (!diag) return;

    const availablePhotos = selectedScan?.photos
      ? selectedScan.photos.map((p) => p.dataUrl)
      : getActivePhotosList().map((p) => p.dataUrl);

    const primaryPhoto =
      availablePhotos[0] || (selectedScan ? selectedScan.photo : photoSlots.canopy.dataUrl);
    if (!primaryPhoto) return;

    if (selectedPlantIds.length === 0) {
      setErrorMsg("Please select at least one plant to save this diagnosis to.");
      return;
    }

    const angleCount = availablePhotos.length;
    const angleText = angleCount > 1 ? ` (${angleCount} photo angles inspected)` : "";

    const note = `[AI Doctor: ${diag.condition}${angleText}] Health: ${diag.healthScore}%. Action: ${
      diag.actionPlan[0] || "Monitor leaves"
    }`;

    if (onSaveDiagnosisToPlants) {
      await onSaveDiagnosisToPlants(selectedPlantIds, {
        note,
        photo: primaryPhoto,
      });
    }

    const targetNames = plants.filter((p) => selectedPlantIds.includes(p.id)).map((p) => p.name);

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

  const handleOpenChatWithDiagnosis = (diag: PlantDiagnosisResult) => {
    const targetPlants = plants.filter((p) => selectedPlantIds.includes(p.id));
    const plantName = targetPlants.map((p) => p.name).join(", ") || "My Plant";
    setChatContext({
      plantName,
      stage: stageContext,
      medium: mediumContext,
      activeCondition: diag.condition,
      healthScore: diag.healthScore,
      severity: diag.severity,
      lastDiagnosisSummary: diag.summary,
      symptoms: diag.symptoms,
      actionPlan: diag.actionPlan,
    });
    setDoctorMode("chat");
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
                <h2 className="text-xl font-semibold">GrowBuddy AI Doctor</h2>
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary border border-primary/30">
                  Multi-Angle Vision
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Inspect canopy posture, macro leaf underside pests, and root medium with AI
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

      {/* Mode Switcher: Multi-Angle Visual Scan vs Interactive AI Doctor Chatbot */}
      <div className="flex rounded-2xl border border-border bg-card p-1.5 gap-1.5 shadow-xs">
        <button
          type="button"
          onClick={() => setDoctorMode("scan")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-semibold transition active:scale-98 cursor-pointer ${
            doctorMode === "scan"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          }`}
        >
          <Camera className="h-4 w-4" />
          <span>Multi-Angle Visual Scan</span>
        </button>

        <button
          type="button"
          onClick={() => setDoctorMode("chat")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-semibold transition active:scale-98 cursor-pointer ${
            doctorMode === "chat"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          }`}
        >
          <Bot className="h-4 w-4" />
          <span>AI Doctor Chatbot</span>
          <span className="rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] px-1.5 py-0.2 border border-emerald-500/30 font-bold">
            Interactive
          </span>
        </button>
      </div>

      {doctorMode === "chat" ? (
        <AIDoctorChat
          plants={plants}
          activePlantId={selectedPlantIds[0] || initialSelectedPlantId}
          initialContext={chatContext}
          onLogAdviceToPlant={async (plantIds, logData) => {
            if (onSaveDiagnosisToPlants) {
              await onSaveDiagnosisToPlants(plantIds, {
                note: logData.note,
                photo: photoSlots.canopy.dataUrl || "",
              });
            }
          }}
        />
      ) : (
        <>
          {/* Target Plant Selector */}
          {plants.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                  <Sprout className="h-3.5 w-3.5 text-primary" />
                  <span>Target Plant(s) for Diagnosis</span>
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
                Select the plant you are scanning to personalize recommendations and log directly to
                its grow journal:
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
                        ({p.strain || p.stage})
                      </span>
                    </button>
                  );
                })}
              </div>
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
                                  <span className="text-[10px] text-primary">
                                    Click to view/change
                                  </span>
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

                        {/* Foliar metric preview badges */}
                        {currentSlotMetrics && (
                          <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] text-muted-foreground pt-1">
                            <span className="rounded-md bg-secondary px-2 py-1 border border-border">
                              Healthy Chlorophyll:{" "}
                              <strong className="text-foreground">
                                {Math.round((currentSlotMetrics.healthyGreenRatio ?? 0) * 100)}%
                              </strong>
                            </span>
                            <span className="rounded-md bg-secondary px-2 py-1 border border-border">
                              Chlorosis (Yellow):{" "}
                              <strong className="text-foreground">
                                {Math.round((currentSlotMetrics.yellowRatio ?? 0) * 100)}%
                              </strong>
                            </span>
                            <span className="rounded-md bg-secondary px-2 py-1 border border-border">
                              Necrosis (Brown):{" "}
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
                            Tip: You can select multiple images at once to auto-populate Canopy,
                            Macro, and Substrate.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Cultivation context inputs */}
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3 text-left">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                  Cultivation Context & Notes
                </span>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                      Growth Stage
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {["Seedling", "Vegetative", "Early Bloom", "Late Bloom"].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStageContext(s)}
                          disabled={loading}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            stageContext === s
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
                      Growing Medium
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {["Soil", "Coco Coir", "Hydro / DWC", "Living Soil"].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMediumContext(m)}
                          disabled={loading}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            mediumContext === m
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
                      placeholder="Optional notes (e.g. pH 6.3, week 4 flower, leaf rust speckles, clawing tips)"
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
                      <strong className="text-foreground font-semibold">~3–4 seconds</strong>{" "}
                      (Instant multimodal AI)
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

                {/* Split Header with Photo & Summary */}
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
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                          Primary Diagnosis
                        </p>
                        {resultPhotosToDisplay.length > 1 && (
                          <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.2 rounded-full border border-primary/20">
                            {resultPhotosToDisplay.length} Angles Integrated
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-bold text-foreground truncate mt-0.5">
                        {currentResult.condition}
                      </h3>
                      <div className="mt-2 flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Activity className="h-3.5 w-3.5 text-primary" />
                          Health:{" "}
                          <strong className="text-foreground">{currentResult.healthScore}%</strong>
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                          Confidence:{" "}
                          <strong className="text-foreground">{currentResult.confidence}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed bg-secondary/40 p-3 rounded-xl border border-border/50">
                    {currentResult.summary}
                  </p>
                </div>

                {/* Scientific Evidence & Benchmarks Card for Trust & Transparency */}
                {currentResult.scientificEvidence && (
                  <div className="p-5 border-b border-border bg-card/60 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                        <FlaskConical className="h-4 w-4 text-primary" />
                        <span>Horticultural Science & Diagnostic Evidence</span>
                      </h4>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Verified Benchmark
                      </span>
                    </div>

                    {/* Biological Pathology Reasoning */}
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-foreground">
                      <strong className="text-primary font-semibold block mb-1">
                        Biological Mechanism & Rationale:
                      </strong>
                      {currentResult.scientificEvidence.pathologyReasoning}
                    </div>

                    {/* Metric Benchmarks Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="rounded-xl border border-border bg-secondary/40 p-2.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-medium">
                          Nutrient Mobility
                        </span>
                        <span className="text-xs font-bold text-foreground mt-0.5 block truncate">
                          {currentResult.scientificEvidence.nutrientMobility.split("(")[0]?.trim()}
                        </span>
                        <span className="text-[9px] text-muted-foreground block truncate">
                          {currentResult.scientificEvidence.nutrientMobility.includes("(")
                            ? currentResult.scientificEvidence.nutrientMobility
                                .split("(")[1]
                                ?.replace(")", "")
                            : "Systemic"}
                        </span>
                      </div>

                      <div className="rounded-xl border border-border bg-secondary/40 p-2.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-medium">
                          Target Substrate pH
                        </span>
                        <span className="text-xs font-bold text-foreground mt-0.5 block">
                          {currentResult.scientificEvidence.targetPH.soil}
                        </span>
                        <span className="text-[9px] text-muted-foreground block">
                          Coco: {currentResult.scientificEvidence.targetPH.cocoHydro}
                        </span>
                      </div>

                      <div className="rounded-xl border border-border bg-secondary/40 p-2.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-medium">
                          Target EC / PPM
                        </span>
                        <span className="text-xs font-bold text-foreground mt-0.5 block">
                          {currentResult.scientificEvidence.targetEC}
                        </span>
                        <span className="text-[9px] text-muted-foreground block">
                          Measured at Runoff
                        </span>
                      </div>

                      <div className="rounded-xl border border-border bg-secondary/40 p-2.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-medium">
                          Target VPD
                        </span>
                        <span className="text-xs font-bold text-foreground mt-0.5 block">
                          {currentResult.scientificEvidence.targetVPD}
                        </span>
                        <span className="text-[9px] text-muted-foreground block">
                          Leaf-to-Air Deficit
                        </span>
                      </div>
                    </div>

                    {/* Identified Markers Chips */}
                    {currentResult.scientificEvidence.identifiedMarkers &&
                      currentResult.scientificEvidence.identifiedMarkers.length > 0 && (
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block mb-1.5">
                            Identified Foliar Markers in Photo:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {currentResult.scientificEvidence.identifiedMarkers.map(
                              (marker, mIdx) => (
                                <span
                                  key={mIdx}
                                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/60 px-2 py-0.5 text-[11px] font-medium text-foreground"
                                >
                                  <Check className="h-3 w-3 text-primary" />
                                  <span>{marker}</span>
                                </span>
                              ),
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                )}

                {/* Symptoms & Possible Causes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 border-b border-border bg-secondary/20">
                  <div>
                    <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                      <span>Key Symptoms</span>
                    </h4>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      {currentResult.symptoms.map((sym, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-primary font-bold">•</span>
                          <span>{sym}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-info" />
                      <span>Probable Causes</span>
                    </h4>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      {currentResult.possibleCauses.map((cause, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-info font-bold">•</span>
                          <span>{cause}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Action Plan */}
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-primary" />
                      <span>Remediation Action Plan</span>
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      Recovery: <strong>{currentResult.estimatedRecoveryDays}</strong>
                    </span>
                  </div>

                  <div className="space-y-2">
                    {currentResult.actionPlan.map((step, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2.5 rounded-xl border border-border bg-secondary/50 p-3 text-xs"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                          {idx + 1}
                        </span>
                        <span className="text-foreground leading-relaxed">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Direct AI Doctor Consultation Banner */}
                <div className="p-4 mx-5 my-2 rounded-2xl border border-primary/30 bg-primary/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground">
                        Have questions about this {currentResult.condition}?
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        Ask Dr. GrowBuddy for exact organic spray recipes, flushing ratios, or
                        recovery timelines.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenChatWithDiagnosis(currentResult)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-xs shrink-0 cursor-pointer"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Chat with AI Doctor</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Preventive Tips */}
                {currentResult.preventiveTips.length > 0 && (
                  <div className="p-5 border-t border-border bg-secondary/10 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Preventative Cultivation Tips
                    </h4>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {currentResult.preventiveTips.map((tip, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-primary">✓</span>
                          <span>{tip}</span>
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
                          onClick={handleLogToSelectedPlants}
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
                              setSelectedPlantIds(plants.map((p) => p.id));
                              setTimeout(() => {
                                handleLogToSelectedPlants();
                              }, 0);
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
                        {scan.photos && scan.photos.length > 1
                          ? ` · ${scan.photos.length} angles`
                          : ""}
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
        </>
      )}
    </div>
  );
};
