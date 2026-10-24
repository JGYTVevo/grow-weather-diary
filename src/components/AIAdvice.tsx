import React, { useState, useRef, useEffect } from "react";
import { getPlantAdvice, type PlantAdviceResult, type ImageAnalysisMetrics } from "@/lib/advice";
import type { Plant, Stage } from "@/hooks/use-plants";
import { DefoliationAnalyzer } from "@/components/DefoliationAnalyzer";
import { LSTSlider } from "@/components/LSTSlider";
import { TrichomeScanner } from "@/components/TrichomeScanner";
import {
  Camera,
  Upload,
  Sparkles,
  Scissors,
  Wrench,
  Droplets,
  FlaskConical,
  CheckCircle,
  AlertTriangle,
  Clock,
  Loader2,
  RotateCcw,
  History,
  ArrowRight,
  BookOpen,
  Info,
  Calendar,
  Layers,
  Compass,
  Check,
  SlidersHorizontal,
  Microscope,
} from "lucide-react";

interface SavedAdviceScan {
  id: string;
  date: string;
  photo: string;
  result: PlantAdviceResult;
  plantName?: string;
  plantId?: string;
}

const ADVICE_STORAGE_KEY = "canopy-ai-advice-scans-v1";

interface CompressResult {
  dataUrl: string;
  metrics: ImageAnalysisMetrics;
}

// Client-side foliage analysis for hue & node contrast metrics
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

  const step = 4;
  let sampled = 0;

  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    sampled++;

    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
    totalBrightness += brightness;

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

    if (h >= 75 && h <= 155 && g > r * 0.95 && g > b) {
      greenCount++;
      if (g > 100 && g > r * 1.15 && brightness >= 70 && brightness <= 190) {
        healthyGreenCount++;
      } else if (brightness < 60) {
        darkGreenCount++;
      }
    } else if (h >= 42 && h <= 74 && r > 100 && g > 100 && b < 120) {
      yellowCount++;
    } else if ((h >= 15 && h <= 41 && r > g && r > 60) || (brightness < 45 && r > 50)) {
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
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read image file"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Unable to load image for compression"));
      img.onload = () => {
        const MAX_DIM = 1024;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve({
            dataUrl: e.target?.result as string,
            metrics: {},
          });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let metrics: ImageAnalysisMetrics = {};
        try {
          metrics = extractImageMetrics(ctx, width, height);
        } catch {
          // ignore metrics error
        }

        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        resolve({ dataUrl, metrics });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function getProgressStage(seconds: number) {
  if (seconds < 1) {
    return {
      step: 1,
      title: "Scanning Canopy & Node Structure",
      detail: "Detecting apical tip, internodal spacing, and branch suppleness…",
      eta: "~3s remaining",
      progress: 25,
    };
  }
  if (seconds < 2.5) {
    return {
      step: 2,
      title: "Measuring Moisture & Foliar Pigment",
      detail: "Assessing leaf turgor, cell hydration, and N-P-K nutrient balance…",
      eta: "~1s remaining",
      progress: 65,
    };
  }
  return {
    step: 3,
    title: "Synthesizing Training & Feeding Schedule",
    detail: "Formulating topping, LST bend plan, and watering window…",
    eta: "<1s remaining",
    progress: 90,
  };
}

export type AdviceToolMode = "advice" | "trichome" | "defoliation" | "lst";

interface AIAdviceProps {
  plants: Plant[];
  initialSelectedPlantId?: string | null;
  initialTool?: AdviceToolMode;
  onToolChange?: (tool: AdviceToolMode) => void;
  onLogToPlant?: (
    plantIds: string[],
    logData: {
      type: "training" | "water" | "feed" | "note";
      note: string;
      photo?: string;
      amount?: string;
      ph?: string;
      ec?: string;
      technique?: string;
    },
  ) => Promise<void>;
  onNavigateToPlant?: (plantId: string) => void;
}

export function AIAdvice({
  plants,
  initialSelectedPlantId,
  initialTool,
  onToolChange,
  onLogToPlant,
  onNavigateToPlant,
}: AIAdviceProps) {
  const [activeTool, setActiveTool] = useState<AdviceToolMode>(initialTool || "advice");

  useEffect(() => {
    if (initialTool) {
      setActiveTool(initialTool);
    }
  }, [initialTool]);

  const handleSwitchTool = (tool: AdviceToolMode) => {
    setActiveTool(tool);
    if (onToolChange) onToolChange(tool);
  };

  const [photo, setPhoto] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ImageAnalysisMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [result, setResult] = useState<PlantAdviceResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeAdviceTab, setActiveAdviceTab] = useState<
    "all" | "topping" | "lst" | "nutrients" | "watering"
  >("all");
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Context settings
  const [selectedPlantId, setSelectedPlantId] = useState<string>(initialSelectedPlantId || "");
  const [stageContext, setStageContext] = useState<string>("Vegetative");
  const [mediumContext, setMediumContext] = useState<string>("Soil");
  const [typeContext, setTypeContext] = useState<string>("Photoperiod");
  const [growerNotes, setGrowerNotes] = useState<string>("");

  // Scan History
  const [savedScans, setSavedScans] = useState<SavedAdviceScan[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedScan, setSelectedScan] = useState<SavedAdviceScan | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Sync with selected plant if provided
  useEffect(() => {
    if (selectedPlantId) {
      const match = plants.find((p) => p.id === selectedPlantId);
      if (match) {
        setStageContext(match.stage);
        setMediumContext(match.medium || "Soil");
        setTypeContext(match.type || "Photoperiod");
      }
    }
  }, [selectedPlantId, plants]);

  // Load history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ADVICE_STORAGE_KEY);
      if (stored) {
        setSavedScans(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  // Timer for live wait feedback
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setElapsedSeconds(0);
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const saveScanToHistory = (res: PlantAdviceResult, imgUrl: string) => {
    const matchedPlant = plants.find((p) => p.id === selectedPlantId);
    const newScan: SavedAdviceScan = {
      id: Math.random().toString(36).slice(2, 10),
      date: new Date().toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      photo: imgUrl,
      result: res,
      plantName: matchedPlant ? matchedPlant.name : "Custom Scan",
      plantId: matchedPlant?.id,
    };

    setSavedScans((prev) => {
      const updated = [newScan, ...prev.slice(0, 19)];
      try {
        localStorage.setItem(ADVICE_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // storage quota
      }
      return updated;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please select an image file (e.g. JPG, PNG, WEBP).");
      return;
    }

    try {
      const { dataUrl, metrics: extractedMetrics } = await compressAndAnalyzeImage(file);
      setPhoto(dataUrl);
      setMetrics(extractedMetrics);
      setResult(null);
      setSelectedScan(null);
      setErrorMsg("");
      setActionSuccessMsg(null);
    } catch {
      setErrorMsg("Failed to process the photo. Please try again.");
    } finally {
      e.target.value = "";
    }
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
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please upload an image file.");
      return;
    }
    try {
      const { dataUrl, metrics: extractedMetrics } = await compressAndAnalyzeImage(file);
      setPhoto(dataUrl);
      setMetrics(extractedMetrics);
      setResult(null);
      setSelectedScan(null);
      setErrorMsg("");
      setActionSuccessMsg(null);
    } catch {
      setErrorMsg("Failed to read dropped image.");
    }
  };

  const runAdviceAnalysis = async () => {
    if (!photo) return;
    setLoading(true);
    setErrorMsg("");
    setActionSuccessMsg(null);

    const matchedPlant = plants.find((p) => p.id === selectedPlantId);
    const plantName = matchedPlant
      ? `${matchedPlant.name} (${matchedPlant.strain || "Plant"})`
      : "Grow Plant";

    try {
      const adv = await getPlantAdvice({
        imageBase64: photo,
        mimeType: "image/jpeg",
        plantName,
        stage: stageContext,
        medium: mediumContext,
        plantType: typeContext,
        plantInfo: growerNotes,
        metrics: metrics || undefined,
      });

      setResult(adv);
      saveScanToHistory(adv, photo);
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Advice request failed. Please check network connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setPhoto(null);
    setMetrics(null);
    setResult(null);
    setSelectedScan(null);
    setErrorMsg("");
    setActionSuccessMsg(null);
  };

  // Quick Action handlers to log training/feed/water directly to plant diary
  const handleQuickLog = async (type: "training" | "water" | "feed") => {
    if (!selectedPlantId) {
      setErrorMsg("Please link this scan to one of your saved plants first.");
      return;
    }
    const currentAdv = selectedScan ? selectedScan.result : result;
    const currentImg = selectedScan ? selectedScan.photo : photo;
    if (!currentAdv || !onLogToPlant) return;

    try {
      let note = "";
      let technique = "";
      let ec = "";
      let ph = "";

      if (type === "training") {
        technique = currentAdv.topping.recommended ? "Topping" : "LST";
        note = `[AI Coach Training: ${technique}] ${
          currentAdv.topping.recommended
            ? currentAdv.topping.cutLocation
            : currentAdv.lst.steps[0] || "LST branch tie-downs"
        }`;
      } else if (type === "feed") {
        ec = currentAdv.nutrients.targetEC;
        ph = currentAdv.nutrients.targetPH;
        note = `[AI Coach Feed] ${currentAdv.nutrients.headline}. Next: ${currentAdv.nutrients.nextFeedSuggestion}`;
      } else if (type === "water") {
        note = `[AI Coach Watering] Status: ${currentAdv.watering.headline}. Lift check: ${currentAdv.watering.liftCheckAdvice}`;
      }

      await onLogToPlant([selectedPlantId], {
        type,
        note,
        photo: currentImg || undefined,
        technique: technique || undefined,
        ec: ec || undefined,
        ph: ph || undefined,
      });

      const plantObj = plants.find((p) => p.id === selectedPlantId);
      setActionSuccessMsg(
        `✓ Logged ${type.toUpperCase()} event directly to ${plantObj?.name || "your plant"}!`,
      );
    } catch (err) {
      setErrorMsg("Failed to save entry to plant diary.");
    }
  };

  const currentResult = selectedScan ? selectedScan.result : result;
  const currentPhoto = selectedScan ? selectedScan.photo : photo;

  return (
    <div className="space-y-6">
      {/* AI Cultivation Hub Navigation */}
      <div className="flex rounded-2xl bg-secondary/80 p-1 border border-border gap-1 shadow-xs overflow-x-auto">
        <button
          type="button"
          onClick={() => handleSwitchTool("advice")}
          className={`flex-1 min-w-[75px] py-2 px-1.5 sm:px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            activeTool === "advice"
              ? "bg-card text-foreground shadow-xs border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Compass className="h-3.5 w-3.5 text-primary" />
          <span>Coach</span>
        </button>
        <button
          type="button"
          onClick={() => handleSwitchTool("trichome")}
          className={`flex-1 min-w-[85px] py-2 px-1.5 sm:px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            activeTool === "trichome"
              ? "bg-card text-foreground shadow-xs border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Microscope className="h-3.5 w-3.5 text-amber-500" />
          <span>Trichomes</span>
        </button>
        <button
          type="button"
          onClick={() => handleSwitchTool("defoliation")}
          className={`flex-1 min-w-[85px] py-2 px-1.5 sm:px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            activeTool === "defoliation"
              ? "bg-card text-foreground shadow-xs border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Scissors className="h-3.5 w-3.5 text-emerald-600" />
          <span>Defoliation</span>
        </button>
        <button
          type="button"
          onClick={() => handleSwitchTool("lst")}
          className={`flex-1 min-w-[80px] py-2 px-1.5 sm:px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            activeTool === "lst"
              ? "bg-card text-foreground shadow-xs border border-border/80"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-blue-500" />
          <span>LST Slider</span>
        </button>
      </div>

      {activeTool === "trichome" ? (
        <TrichomeScanner
          plants={plants}
          initialSelectedPlantId={selectedPlantId}
          onLogToPlant={onLogToPlant}
          onNavigateToPlant={onNavigateToPlant}
        />
      ) : activeTool === "defoliation" ? (
        <DefoliationAnalyzer
          plants={plants}
          initialSelectedPlantId={selectedPlantId}
          onLogToPlant={onLogToPlant}
          onNavigateToPlant={onNavigateToPlant}
        />
      ) : activeTool === "lst" ? (
        <LSTSlider
          plants={plants}
          initialSelectedPlantId={selectedPlantId}
          onLogToPlant={onLogToPlant}
          onNavigateToPlant={onNavigateToPlant}
        />
      ) : (
        <>
          {/* Header Banner */}
          <div className="rounded-2xl border border-primary/30 bg-card p-5 relative overflow-hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/20 text-primary">
                  <Compass className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">AI Grow Coach & Plant Advisor</h2>
                  <p className="text-xs text-muted-foreground">
                    Instant cultivation intelligence for topping, LST, nutrient feeding, and
                    watering schedule.
                  </p>
                </div>
              </div>

              {savedScans.length > 0 && (
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-secondary/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition active:scale-95"
                >
                  <History className="h-3.5 w-3.5 text-primary" />
                  <span>History ({savedScans.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* History Drawer */}
          {showHistory && (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <span>Past AI Advice Scans</span>
                </h3>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {savedScans.map((scan) => (
                  <button
                    key={scan.id}
                    onClick={() => {
                      setSelectedScan(scan);
                      setShowHistory(false);
                      setActiveAdviceTab("all");
                    }}
                    className={`flex flex-col text-left rounded-xl border p-2 transition overflow-hidden ${
                      selectedScan?.id === scan.id
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border bg-secondary/40 hover:bg-secondary"
                    }`}
                  >
                    <div className="aspect-video w-full rounded-lg overflow-hidden bg-black/40 mb-1.5 relative">
                      <img src={scan.photo} alt="" className="h-full w-full object-cover" />
                      <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[9px] text-white font-mono">
                        {scan.result.cultivationStage}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-foreground truncate">
                      {scan.plantName || "Grow Scan"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{scan.date}</span>
                    <span className="text-[10px] text-primary mt-0.5 line-clamp-1">
                      {scan.result.keyActionToday}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Linked Plant Selector */}
          {plants.length > 0 && !currentResult && (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  <span>Target Plant (Optional)</span>
                </span>
                {selectedPlantId && (
                  <button
                    onClick={() => setSelectedPlantId("")}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Clear Selection
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Connect to one of your saved plants to auto-fill its genetics, medium, and stage:
              </p>
              <div className="flex flex-wrap gap-2">
                {plants.map((p) => {
                  const isSelected = selectedPlantId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlantId(isSelected ? "" : p.id)}
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
                      <span className="text-[10px] text-muted-foreground">({p.stage})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Main Upload / Analysis Panel (When no result) */}
          {!currentResult && (
            <div className="space-y-4">
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
                {photo ? (
                  <div className="space-y-4">
                    <div className="relative mx-auto max-w-sm aspect-square rounded-xl overflow-hidden border border-border bg-secondary">
                      <img
                        src={photo}
                        alt="Plant for advice"
                        className="h-full w-full object-cover"
                      />
                      {loading ? (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center">
                          <div className="rounded-2xl bg-black/80 px-4 py-3 backdrop-blur border border-primary/40 shadow-xl space-y-1.5">
                            <div className="flex items-center justify-center gap-2 text-primary font-semibold text-xs">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>AI Grow Analysis in Progress</span>
                            </div>
                            <p className="text-[11px] text-zinc-300 font-mono">
                              {elapsedSeconds}s elapsed · {getProgressStage(elapsedSeconds).eta}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="absolute bottom-3 right-3 flex items-center gap-2">
                          {/* Upload Different from Gallery */}
                          <label className="rounded-xl bg-black/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-black flex items-center gap-1.5 shadow cursor-pointer active:scale-95">
                            <Upload className="h-3.5 w-3.5" />
                            <span>Upload Different</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,.jpg,.jpeg,.png,.webp,.heic,application/octet-stream"
                              className="sr-only"
                              onChange={handleFileChange}
                            />
                          </label>
                          {/* Retake with Camera */}
                          <label className="rounded-xl bg-black/80 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-black flex items-center gap-1.5 shadow cursor-pointer active:scale-95">
                            <Camera className="h-3.5 w-3.5" />
                            <span>Retake</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="sr-only"
                              onChange={handleFileChange}
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Cultivation Context Adjustments */}
                    <div className="text-left space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-muted-foreground block">
                          Growth Stage
                        </label>
                        <span className="text-[10px] text-primary">{stageContext}</span>
                      </div>
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

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground block mb-1">
                            Growing Medium
                          </label>
                          <select
                            value={mediumContext}
                            onChange={(e) => setMediumContext(e.target.value)}
                            disabled={loading}
                            className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="Soil">Soil</option>
                            <option value="Coco Coir">Coco Coir</option>
                            <option value="Hydro / DWC">Hydro / DWC</option>
                            <option value="Living Soil">Living Soil / No-Till</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-semibold text-muted-foreground block mb-1">
                            Genetics Type
                          </label>
                          <select
                            value={typeContext}
                            onChange={(e) => setTypeContext(e.target.value)}
                            disabled={loading}
                            className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="Photoperiod">Photoperiod</option>
                            <option value="Autoflower">Autoflower</option>
                          </select>
                        </div>
                      </div>

                      <input
                        type="text"
                        placeholder="Optional details (e.g. 5 weeks from seed, last fed 2 days ago, topped once)"
                        value={growerNotes}
                        onChange={(e) => setGrowerNotes(e.target.value)}
                        disabled={loading}
                        className="w-full rounded-xl border bg-secondary px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring text-foreground disabled:opacity-60"
                      />
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

                        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/80">
                          <div
                            className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
                            style={{ width: `${getProgressStage(elapsedSeconds).progress}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="truncate pr-2">
                            {getProgressStage(elapsedSeconds).detail}
                          </span>
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

                    {/* Primary Action Button */}
                    <button
                      onClick={runAdviceAnalysis}
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50 shadow"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" />
                          <span>Analyzing plant… ({elapsedSeconds}s · ~3–4s wait time)</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          <span>Get AI Topping, LST, Feed & Water Advice</span>
                        </>
                      )}
                    </button>

                    {/* Clear Wait Time Assurance Banner */}
                    {!loading && (
                      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-1">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        <span>
                          Estimated wait time:{" "}
                          <strong className="text-foreground font-semibold">~3–4 seconds</strong>
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 py-6">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-primary">
                      <Sparkles className="h-8 w-8" />
                    </div>
                    <div>
                      <p className="font-semibold text-base">
                        Upload a plant photo or snap a new one
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                        Get precise canopy training advice (topping & LST), plus custom nutrient
                        feeding and watering schedules.
                      </p>
                    </div>

                    <div className="flex flex-col items-center gap-3">
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        {/* Primary Button: Upload from Gallery / Files (NO capture attribute) */}
                        <label className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition active:scale-95 shadow cursor-pointer">
                          <Upload className="h-4 w-4" />
                          <span>Upload from Gallery / Files</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,.jpg,.jpeg,.png,.webp,.heic,application/octet-stream"
                            className="sr-only"
                            onChange={handleFileChange}
                          />
                        </label>

                        {/* Secondary Button: Take Photo with Camera (HAS capture="environment") */}
                        <label className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-xs font-semibold text-primary hover:bg-primary/20 transition active:scale-95 cursor-pointer">
                          <Camera className="h-4 w-4" />
                          <span>Take Photo with Camera</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="sr-only"
                            onChange={handleFileChange}
                          />
                        </label>
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        Or drag and drop any image file directly onto this box
                      </p>
                    </div>

                    {/* 4 Feature Badges */}
                    <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-left">
                      <div className="rounded-xl border border-border/80 bg-secondary/30 p-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-1">
                          <Scissors className="h-3.5 w-3.5 text-primary" />
                          <span>Topping</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Node counts, cut locations & bounce-back times.
                        </p>
                      </div>

                      <div className="rounded-xl border border-border/80 bg-secondary/30 p-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-1">
                          <Wrench className="h-3.5 w-3.5 text-primary" />
                          <span>LST Training</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Branch tie-downs, stem flexibility & leveling.
                        </p>
                      </div>

                      <div className="rounded-xl border border-border/80 bg-secondary/30 p-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-1">
                          <FlaskConical className="h-3.5 w-3.5 text-primary" />
                          <span>Nutrient Feeding</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Stage formulas, target EC/PPM & pH balance.
                        </p>
                      </div>

                      <div className="rounded-xl border border-border/80 bg-secondary/30 p-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-1">
                          <Droplets className="h-3.5 w-3.5 text-primary" />
                          <span>Watering Timing</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Container lift checks, leaf turgor & dryback.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success Notification */}
          {actionSuccessMsg && (
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-3.5 text-xs text-primary font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>{actionSuccessMsg}</span>
            </div>
          )}

          {/* RESULT REPORT VIEW */}
          {currentResult && currentPhoto && (
            <div className="space-y-6">
              {/* Top Result Card */}
              <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <div className="relative h-28 w-28 sm:h-32 sm:w-32 shrink-0 rounded-xl overflow-hidden border border-border bg-secondary">
                    <img src={currentPhoto} alt="" className="h-full w-full object-cover" />
                    <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-mono text-white">
                      {currentResult.cultivationStage}
                    </span>
                  </div>

                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                          {currentResult.cultivationStage}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {selectedPlantId
                            ? plants.find((p) => p.id === selectedPlantId)?.name
                            : "Canopy Scan"}
                        </span>
                      </div>

                      <button
                        onClick={handleReset}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>New Scan</span>
                      </button>
                    </div>

                    <h3 className="text-base font-semibold text-foreground">
                      {currentResult.keyActionToday}
                    </h3>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {currentResult.summary}
                    </p>

                    {/* Quick Log Buttons Bar */}
                    {selectedPlantId && onLogToPlant && (
                      <div className="pt-2 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-muted-foreground font-medium">
                          Quick Log:
                        </span>
                        <button
                          type="button"
                          onClick={() => handleQuickLog("training")}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/70 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary active:scale-95"
                        >
                          <Scissors className="h-3 w-3 text-primary" />
                          <span>Log Training</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickLog("feed")}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/70 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary active:scale-95"
                        >
                          <FlaskConical className="h-3 w-3 text-primary" />
                          <span>Log Feed</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickLog("water")}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/70 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary active:scale-95"
                        >
                          <Droplets className="h-3 w-3 text-primary" />
                          <span>Log Water</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="pt-2 border-t border-border flex items-center gap-1.5 overflow-x-auto pb-1">
                  {(
                    [
                      { id: "all", label: "All Insights", icon: Layers },
                      { id: "topping", label: "Topping", icon: Scissors },
                      { id: "lst", label: "LST Training", icon: Wrench },
                      { id: "nutrients", label: "Nutrients", icon: FlaskConical },
                      { id: "watering", label: "Watering", icon: Droplets },
                    ] as const
                  ).map((t) => {
                    const Icon = t.icon;
                    const isActive = activeAdviceTab === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setActiveAdviceTab(t.id)}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                          isActive
                            ? "bg-primary text-primary-foreground shadow"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 1. TOPPING CARD */}
              {(activeAdviceTab === "all" || activeAdviceTab === "topping") && (
                <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary">
                        <Scissors className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold">1. Topping & Apical Pruning</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Apical dominance breaking & shoot multiplication
                        </p>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                        currentResult.topping.recommended
                          ? "border-primary/50 bg-primary/20 text-primary"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                      }`}
                    >
                      {currentResult.topping.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Node Location & Timing
                      </span>
                      <p className="text-xs font-semibold text-foreground">
                        {currentResult.topping.nodeCount}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {currentResult.topping.timing}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Cut Location
                      </span>
                      <p className="text-xs font-semibold text-foreground">
                        {currentResult.topping.cutLocation}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 space-y-1.5 text-xs">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary block">
                      Sterile Technique & Execution
                    </span>
                    <p className="text-muted-foreground leading-relaxed">
                      {currentResult.topping.technique}
                    </p>
                  </div>

                  {currentResult.topping.riskAlert && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-start gap-2">
                      <Info className="h-4 w-4 shrink-0 mt-0.5" />
                      <p className="leading-relaxed">{currentResult.topping.riskAlert}</p>
                    </div>
                  )}
                </div>
              )}

              {/* 2. LOW-STRESS TRAINING (LST) CARD */}
              {(activeAdviceTab === "all" || activeAdviceTab === "lst") && (
                <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary">
                        <Wrench className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold">2. Low-Stress Training (LST)</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Gentle stem bending & flat canopy leveling
                        </p>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                        currentResult.lst.recommended
                          ? "border-primary/50 bg-primary/20 text-primary"
                          : "border-border bg-secondary text-muted-foreground"
                      }`}
                    >
                      {currentResult.lst.recommended ? "Recommended Now" : "Observe Stalk"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Stem Flexibility & Timing
                      </span>
                      <p className="text-xs font-semibold text-foreground">
                        {currentResult.lst.stemFlexibility}
                      </p>
                      <p className="text-xs text-muted-foreground">{currentResult.lst.timing}</p>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Recommended Tools
                      </span>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {currentResult.lst.toolsNeeded.map((tool, idx) => (
                          <span
                            key={idx}
                            className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium text-foreground border border-border/60"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Step by Step Training Guide */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                      Tie-Down Instructions
                    </span>
                    <div className="space-y-1.5">
                      {currentResult.lst.steps.map((step, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-secondary/20 p-2.5 text-xs text-foreground"
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold">
                            {idx + 1}
                          </span>
                          <p className="leading-relaxed">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary block">
                      Canopy Architecture Goal
                    </span>
                    <p className="text-muted-foreground leading-relaxed">
                      {currentResult.lst.canopyGoal}
                    </p>
                  </div>
                </div>
              )}

              {/* 3. NUTRIENT FEEDING CARD */}
              {(activeAdviceTab === "all" || activeAdviceTab === "nutrients") && (
                <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary">
                        <FlaskConical className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold">3. Nutrient Feeding Regime</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Stage formula, target EC/PPM & pH target
                        </p>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                        currentResult.nutrients.action === "feed_now"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                          : currentResult.nutrients.action === "light_feed"
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                            : currentResult.nutrients.action === "plain_water"
                              ? "border-blue-500/40 bg-blue-500/10 text-blue-400"
                              : "border-primary/40 bg-primary/10 text-primary"
                      }`}
                    >
                      {currentResult.nutrients.action.replace("_", " ").toUpperCase()}
                    </span>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 space-y-1">
                    <h5 className="text-xs font-semibold text-foreground">
                      {currentResult.nutrients.headline}
                    </h5>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {currentResult.nutrients.stageRecommendation}
                    </p>
                  </div>

                  {/* Target EC and Target pH */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border/80 bg-secondary/40 p-3 text-center">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                        Target EC / PPM
                      </span>
                      <span className="text-sm font-bold font-mono text-primary mt-1 block">
                        {currentResult.nutrients.targetEC}
                      </span>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-secondary/40 p-3 text-center">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                        Target Substrate pH
                      </span>
                      <span className="text-sm font-bold font-mono text-primary mt-1 block">
                        {currentResult.nutrients.targetPH}
                      </span>
                    </div>
                  </div>

                  {/* Foliar Signs Observed */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                      Observed Foliar Indicators
                    </span>
                    <div className="space-y-1">
                      {currentResult.nutrients.signsObserved.map((sign, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                          <span>{sign}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-secondary/20 p-3 text-xs space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary block">
                      Next Irrigation / Feeding Plan
                    </span>
                    <p className="text-foreground leading-relaxed">
                      {currentResult.nutrients.nextFeedSuggestion}
                    </p>
                  </div>
                </div>
              )}

              {/* 4. WATERING CARD */}
              {(activeAdviceTab === "all" || activeAdviceTab === "watering") && (
                <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary">
                        <Droplets className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold">4. Watering & Substrate Moisture</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Cellular turgidity, pot weight & irrigation window
                        </p>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                        currentResult.watering.status === "needs_water"
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                          : currentResult.watering.status === "overwatered"
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : "border-primary/40 bg-primary/10 text-primary"
                      }`}
                    >
                      {currentResult.watering.status === "needs_water"
                        ? "Water Due"
                        : currentResult.watering.status === "overwatered"
                          ? "Over-Saturated"
                          : "Optimal Turgor"}
                    </span>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 space-y-1">
                    <h5 className="text-xs font-semibold text-foreground">
                      {currentResult.watering.headline}
                    </h5>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {currentResult.watering.indicator}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 space-y-1 text-xs">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                        Pot Lift Test
                      </span>
                      <p className="text-muted-foreground leading-relaxed">
                        {currentResult.watering.liftCheckAdvice}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 space-y-1 text-xs">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                        Knuckle Dryback Check
                      </span>
                      <p className="text-muted-foreground leading-relaxed">
                        {currentResult.watering.knuckleTest}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Estimated Next Watering:</span>
                    <span className="font-semibold text-primary font-mono">
                      {currentResult.watering.nextWaterWindow}
                    </span>
                  </div>
                </div>
              )}

              {/* Action Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-secondary transition active:scale-95 shadow-sm"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Scan Another Photo</span>
                </button>

                {selectedPlantId && onNavigateToPlant && (
                  <button
                    onClick={() => onNavigateToPlant(selectedPlantId)}
                    className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition active:scale-95 shadow"
                  >
                    <span>View Plant Grow Diary</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
