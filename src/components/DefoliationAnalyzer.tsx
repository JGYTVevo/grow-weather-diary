import React, { useState, useRef, useEffect } from "react";
import {
  analyzeDefoliationCanopy,
  type DefoliationResult,
  type CanopyMetrics,
} from "@/lib/defoliation";
import type { Plant } from "@/hooks/use-plants";
import {
  Scissors,
  Camera,
  Upload,
  Sparkles,
  Layers,
  Wind,
  Sun,
  ShieldAlert,
  CheckCircle,
  Clock,
  Loader2,
  RotateCcw,
  BookOpen,
  ArrowRight,
  Check,
  History,
  Info,
} from "lucide-react";

interface SavedDefoliationScan {
  id: string;
  date: string;
  photo: string;
  result: DefoliationResult;
  plantName?: string;
  plantId?: string;
}

const STORAGE_KEY = "canopy-defoliation-scans-v1";

interface DefoliationAnalyzerProps {
  plants: Plant[];
  initialSelectedPlantId?: string | null;
  onLogToPlant?: (
    plantIds: string[],
    logData: {
      type: "training" | "water" | "feed" | "note";
      note: string;
      photo?: string;
      technique?: string;
    },
  ) => Promise<void>;
  onNavigateToPlant?: (plantId: string) => void;
}

function extractCanopyMetrics(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): CanopyMetrics {
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
  const greenRatio = +(greenCount / denom).toFixed(3);
  return {
    averageBrightness: Math.round(totalBrightness / denom),
    greenRatio,
    healthyGreenRatio: +(healthyGreenCount / denom).toFixed(3),
    yellowRatio: +(yellowCount / denom).toFixed(3),
    brownRatio: +(brownCount / denom).toFixed(3),
    darkGreenRatio: +(darkGreenCount / denom).toFixed(3),
    canopyCoverageEstimate: Math.min(95, Math.round(greenRatio * 115)),
  };
}

function compressAndAnalyzeCanopy(
  file: File,
): Promise<{ dataUrl: string; metrics: CanopyMetrics }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read image file"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Unable to load image"));
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
          resolve({ dataUrl: e.target?.result as string, metrics: {} });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        let metrics: CanopyMetrics = {};
        try {
          metrics = extractCanopyMetrics(ctx, width, height);
        } catch {
          // ignore
        }
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        resolve({ dataUrl, metrics });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function getCanopyProgressStage(seconds: number) {
  if (seconds < 1) {
    return {
      step: 1,
      title: "Measuring Leaf Area Index & Overlap",
      detail: "Scanning canopy density and lower node shadow patterns…",
      eta: "~3s remaining",
      progress: 30,
    };
  }
  if (seconds < 2.5) {
    return {
      step: 2,
      title: "Calculating Light Penetration & Airflow Pockets",
      detail: "Assessing PAR penetration, microclimate humidity, and lollipop line…",
      eta: "~1s remaining",
      progress: 70,
    };
  }
  return {
    step: 3,
    title: "Synthesizing Schwazzing & Pruning Strategy",
    detail: "Computing fan leaf targets, light dimming, and recovery feed…",
    eta: "<1s remaining",
    progress: 92,
  };
}

export function DefoliationAnalyzer({
  plants,
  initialSelectedPlantId,
  onLogToPlant,
  onNavigateToPlant,
}: DefoliationAnalyzerProps) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<CanopyMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [result, setResult] = useState<DefoliationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [overlayMode, setOverlayMode] = useState<"clean" | "zones">("zones");
  const [selectedPlantId, setSelectedPlantId] = useState<string>(initialSelectedPlantId || "");
  const [stageContext, setStageContext] = useState<string>("Day 1 Flower");
  const [plantTypeContext, setPlantTypeContext] = useState<string>("Photoperiod");
  const [notes, setNotes] = useState<string>("");
  const [logSuccessMsg, setLogSuccessMsg] = useState<string | null>(null);
  const [savedScans, setSavedScans] = useState<SavedDefoliationScan[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Sync with selected plant
  useEffect(() => {
    if (selectedPlantId) {
      const match = plants.find((p) => p.id === selectedPlantId);
      if (match) {
        setStageContext(match.stage);
        setPlantTypeContext(match.type || "Photoperiod");
        if (!photo && match.cover) {
          setPhoto(match.cover);
        }
      }
    }
  }, [selectedPlantId, plants, photo]);

  // Load history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSavedScans(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  // Timer for fast UX feedback
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

  const saveToHistory = (res: DefoliationResult, imgUrl: string) => {
    const matchedPlant = plants.find((p) => p.id === selectedPlantId);
    const newScan: SavedDefoliationScan = {
      id: Math.random().toString(36).slice(2, 10),
      date: new Date().toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      photo: imgUrl,
      result: res,
      plantName: matchedPlant?.name || "Plant",
      plantId: selectedPlantId || undefined,
    };
    const updated = [newScan, ...savedScans.slice(0, 14)];
    setSavedScans(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleProcessImage = async (file: File) => {
    setErrorMsg("");
    setResult(null);
    setLoading(true);
    try {
      const { dataUrl, metrics: extractedMetrics } = await compressAndAnalyzeCanopy(file);
      setPhoto(dataUrl);
      setMetrics(extractedMetrics);

      const matchedPlant = plants.find((p) => p.id === selectedPlantId);
      const adviceResult = await analyzeDefoliationCanopy({
        imageBase64: dataUrl,
        plantName: matchedPlant?.name || "Canopy",
        stage: stageContext,
        plantType: plantTypeContext,
        growerNotes: notes,
        metrics: extractedMetrics,
      });

      setResult(adviceResult);
      saveToHistory(adviceResult, dataUrl);
    } catch (err: unknown) {
      console.error("Defoliation scan failed:", err);
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to analyze canopy. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      handleProcessImage(file);
    }
  };

  const handleReanalyzeWithCurrentPhoto = async () => {
    if (!photo) return;
    setErrorMsg("");
    setLoading(true);
    try {
      const matchedPlant = plants.find((p) => p.id === selectedPlantId);
      const adviceResult = await analyzeDefoliationCanopy({
        imageBase64: photo,
        plantName: matchedPlant?.name || "Canopy",
        stage: stageContext,
        plantType: plantTypeContext,
        growerNotes: notes,
        metrics: metrics || undefined,
      });
      setResult(adviceResult);
      saveToHistory(adviceResult, photo);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogToJournal = async () => {
    if (!selectedPlantId || !onLogToPlant || !result) return;
    const currentPlant = plants.find((p) => p.id === selectedPlantId);
    const note = `[Canopy Defoliation Scan]: Density ${result.canopyDensityPercent}% (${result.canopyDensityRating}), Light penetration ${result.lightPenetrationScore}%. Recommendation: ${result.recommendedRemovalPercent} (${result.estimatedLeafCount}). Key action: ${result.keyActionToday}`;

    await onLogToPlant([selectedPlantId], {
      type: "training",
      note,
      photo: photo || undefined,
      technique: "Defoliation",
    });

    setLogSuccessMsg(`Logged defoliation recommendations to ${currentPlant?.name || "plant"}!`);
    setTimeout(() => setLogSuccessMsg(null), 4000);
  };

  const currentPlant = plants.find((p) => p.id === selectedPlantId);
  const progressInfo = getCanopyProgressStage(elapsedSeconds);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <Scissors className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                Defoliation & Schwazzing Analyzer
              </h2>
              <p className="text-xs text-muted-foreground">
                AI canopy light penetration, lower popcorn lollipopping & fan leaf pruning guide
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary/80 px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary transition active:scale-95"
            >
              <History className="h-3.5 w-3.5 text-primary" />
              <span>Past Scans ({savedScans.length})</span>
            </button>
          </div>
        </div>

        {/* Plant and Stage Selector Context */}
        <div className="mt-4 pt-3 border-t border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
              Cultivar / Plant
            </label>
            <select
              value={selectedPlantId}
              onChange={(e) => setSelectedPlantId(e.target.value)}
              className="w-full rounded-xl border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">(Select plant from diary)</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.stage} · {p.strain || "Unknown"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
              Timing / Flower Stage
            </label>
            <select
              value={stageContext}
              onChange={(e) => setStageContext(e.target.value)}
              className="w-full rounded-xl border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="Late Vegetative">Late Vegetative (Pre-Flip)</option>
              <option value="Day 1 Flower">Day 1 of Flowering (Schwazzing Phase 1)</option>
              <option value="Day 21 Flower">Day 21 of Flowering (Schwazzing Phase 2)</option>
              <option value="Mid Flowering">Mid Flowering (Weeks 4-6)</option>
              <option value="Late Flowering">Late Flowering (Ripening / Week 7+)</option>
              <option value="Seedling">Seedling / Early Veg</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
              Genetics
            </label>
            <select
              value={plantTypeContext}
              onChange={(e) => setPlantTypeContext(e.target.value)}
              className="w-full rounded-xl border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="Photoperiod">Photoperiod (Standard Recovery)</option>
              <option value="Autoflower">Autoflower (Light Stress Limit)</option>
            </select>
          </div>
        </div>
      </div>

      {/* History Drawer */}
      {showHistory && (
        <div className="rounded-2xl border border-emerald-500/30 bg-card p-4 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600">
              Past Defoliation Assessments
            </h3>
            <button
              onClick={() => setShowHistory(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close ✕
            </button>
          </div>
          {savedScans.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No previous scans recorded yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {savedScans.map((scan) => (
                <div
                  key={scan.id}
                  onClick={() => {
                    setPhoto(scan.photo);
                    setResult(scan.result);
                    setShowHistory(false);
                  }}
                  className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-secondary/40 hover:bg-secondary cursor-pointer transition"
                >
                  <img
                    src={scan.photo}
                    alt=""
                    className="h-12 w-12 rounded-lg object-cover border border-background shadow-xs shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {scan.plantName || "Canopy"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Density:{" "}
                      <span className="text-primary font-medium">
                        {scan.result.canopyDensityPercent}%
                      </span>{" "}
                      · {scan.date}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload & Photo Capture Card */}
      {!photo && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`rounded-2xl border-2 border-dashed p-6 sm:p-10 text-center transition ${
            isDragging
              ? "border-primary bg-primary/10"
              : "border-border bg-card/60 hover:border-primary/50"
          }`}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary shadow-xs mb-3">
            <Scissors className="h-7 w-7 text-emerald-600" />
          </div>
          <h3 className="text-lg font-bold text-foreground">Upload or Photograph Your Canopy</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-5">
            Take a top-down or 45-degree angle photo showing the canopy density, fan leaf layering,
            and light reaching lower nodes.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* Dual Pickers: Camera & Gallery */}
            <label className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-xs font-semibold hover:bg-emerald-700 cursor-pointer active:scale-95 transition shadow-sm">
              <Camera className="h-4 w-4" />
              <span>Take Photo with Camera</span>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleProcessImage(f);
                  e.target.value = "";
                }}
              />
            </label>

            <label className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-secondary/80 cursor-pointer active:scale-95 transition shadow-xs">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span>Upload from Gallery / Files</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/gif"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleProcessImage(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {currentPlant?.cover && (
            <div className="mt-4 pt-4 border-t border-border/60">
              <button
                onClick={() => {
                  setPhoto(currentPlant.cover!);
                  handleReanalyzeWithCurrentPhoto();
                }}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1.5"
              >
                <span>Use current cover photo of {currentPlant.name}</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Loading Feedback State */}
      {loading && (
        <div className="rounded-2xl border border-emerald-500/30 bg-card p-6 sm:p-8 space-y-5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              <span className="text-sm font-bold text-foreground">
                Analyzing Canopy & Light Penetration…
              </span>
            </div>
            <div className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-mono text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{elapsedSeconds}s elapsed</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all duration-300"
                style={{ width: `${progressInfo.progress}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{progressInfo.title}</span>
              <span>{progressInfo.eta}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground italic bg-secondary/40 p-3 rounded-xl border border-border">
            {progressInfo.detail}
          </p>
        </div>
      )}

      {/* Error Message */}
      {errorMsg && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-xs font-medium text-destructive flex items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button
            onClick={() => handleReanalyzeWithCurrentPhoto()}
            className="rounded-lg bg-destructive px-3 py-1 text-[11px] font-semibold text-destructive-foreground hover:bg-destructive/90"
          >
            Retry
          </button>
        </div>
      )}

      {/* Active Photo & Canopy Workspace */}
      {photo && !loading && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            {/* Image Overlay Workspace Header */}
            <div className="flex items-center justify-between p-3.5 border-b border-border bg-secondary/30">
              <div className="flex items-center gap-1.5 bg-secondary p-1 rounded-xl border border-border/60">
                <button
                  onClick={() => setOverlayMode("zones")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    overlayMode === "zones"
                      ? "bg-card text-foreground shadow-xs border border-border/80"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Layers className="h-3 w-3 text-emerald-600" />
                  <span>Pruning Zones Overlay</span>
                </button>
                <button
                  onClick={() => setOverlayMode("clean")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    overlayMode === "clean"
                      ? "bg-card text-foreground shadow-xs border border-border/80"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>Clean Photo</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setPhoto(null);
                    setResult(null);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>New Photo</span>
                </button>
              </div>
            </div>

            {/* Canvas / Photo Viewer */}
            <div className="relative aspect-4/3 sm:aspect-16/10 bg-black/95 flex items-center justify-center overflow-hidden">
              <img
                src={photo}
                alt="Plant canopy"
                className="h-full w-full object-contain select-none"
              />

              {/* Interactive Visual Zones Overlay */}
              {overlayMode === "zones" && result && (
                <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 sm:p-4 bg-gradient-to-b from-black/40 via-transparent to-black/60">
                  {/* Top Canopy Band */}
                  <div className="rounded-xl border border-amber-400/50 bg-amber-500/15 backdrop-blur-xs p-2 text-left self-start max-w-[280px]">
                    <span className="inline-block rounded-md bg-amber-500 text-black font-extrabold text-[10px] px-1.5 py-0.5 mb-1">
                      ZONE 1: UPPER SHADE LEAVES
                    </span>
                    <p className="text-[11px] text-white font-medium leading-tight">
                      Tuck or snip large fan leaves with red petioles blocking apex tops
                    </p>
                  </div>

                  {/* Mid Canopy Core Band */}
                  <div className="rounded-xl border border-emerald-400/50 bg-emerald-500/15 backdrop-blur-xs p-2 text-left self-center max-w-[300px]">
                    <span className="inline-block rounded-md bg-emerald-500 text-black font-extrabold text-[10px] px-1.5 py-0.5 mb-1">
                      ZONE 2: CORE AIRFLOW CHANNELS
                    </span>
                    <p className="text-[11px] text-white font-medium leading-tight">
                      Remove crisscrossing inward foliage to eliminate humidity traps
                    </p>
                  </div>

                  {/* Lower Lollipop Band */}
                  <div className="rounded-xl border border-cyan-400/50 bg-cyan-500/15 backdrop-blur-xs p-2 text-left self-end max-w-[280px]">
                    <span className="inline-block rounded-md bg-cyan-500 text-black font-extrabold text-[10px] px-1.5 py-0.5 mb-1">
                      ZONE 3: LOLLIPOPPING (LOWER 20%)
                    </span>
                    <p className="text-[11px] text-white font-medium leading-tight">
                      Strip pop-corn bud sites & shaded leaves receiving &lt;200 PPFD
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Re-take Bar */}
            <div className="p-3 border-t border-border bg-secondary/30 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Analyzing as:{" "}
                <strong className="text-foreground">
                  {stageContext} ({plantTypeContext})
                </strong>
              </span>
              <button
                onClick={handleReanalyzeWithCurrentPhoto}
                className="text-primary font-semibold hover:underline inline-flex items-center gap-1"
              >
                <span>Re-run analysis</span>
                <RotateCcw className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Analysis Results Cards */}
          {result && (
            <div className="space-y-5 animate-in fade-in">
              {/* Core Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Density */}
                <div className="rounded-2xl border border-border bg-card p-3.5 space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5 text-primary" />
                    Canopy Density
                  </span>
                  <p className="text-2xl font-black text-foreground">
                    {result.canopyDensityPercent}%
                  </p>
                  <p className="text-[11px] font-medium text-emerald-600">
                    {result.canopyDensityRating}
                  </p>
                </div>

                {/* Light Penetration */}
                <div className="rounded-2xl border border-border bg-card p-3.5 space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Sun className="h-3.5 w-3.5 text-amber-500" />
                    Light to Nodes
                  </span>
                  <p className="text-2xl font-black text-foreground">
                    {result.lightPenetrationScore}%
                  </p>
                  <p className="text-[11px] font-medium text-amber-600 truncate">
                    {result.lightPenetrationRating}
                  </p>
                </div>

                {/* Mold & Airflow Risk */}
                <div className="rounded-2xl border border-border bg-card p-3.5 space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Wind className="h-3.5 w-3.5 text-cyan-500" />
                    Microclimate Risk
                  </span>
                  <p className="text-base font-bold text-foreground mt-1">
                    {result.moldMildewRisk}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Airflow stagnation</p>
                </div>

                {/* Removal Target */}
                <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 space-y-1">
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                    <Scissors className="h-3.5 w-3.5" />
                    Pruning Target
                  </span>
                  <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">
                    {result.recommendedRemovalPercent}
                  </p>
                  <p className="text-[11px] font-medium text-emerald-600">
                    {result.estimatedLeafCount}
                  </p>
                </div>
              </div>

              {/* Schwazzing Readiness Highlight */}
              <div className="rounded-2xl border border-emerald-500/30 bg-card p-4 sm:p-5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-bold shadow-xs">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{result.schwazzingReadiness}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Evaluated via {result.source || "GrowBuddy Botanical Engine"}
                  </span>
                </div>
                <p className="text-sm font-semibold text-foreground">{result.keyActionToday}</p>
                <p className="text-xs text-muted-foreground">{result.summary}</p>
              </div>

              {/* Pruning Zones Breakdown */}
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  Targeted Pruning Zones & Leaf Types
                </h3>

                <div className="space-y-3">
                  {result.zones.map((zone, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-foreground">{zone.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wider ${
                            zone.action === "remove"
                              ? "bg-amber-500/20 text-amber-600"
                              : zone.action === "lollipop_strip"
                                ? "bg-cyan-500/20 text-cyan-600"
                                : "bg-primary/20 text-primary"
                          }`}
                        >
                          Target: {zone.targetPercentage}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/90">
                        <strong>Target Foliage:</strong> {zone.leafTypeToTarget}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        <strong>Rationale:</strong> {zone.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step-by-Step Pruning Checklist */}
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Scissors className="h-4 w-4 text-emerald-600" />
                  Pruning Execution Protocol
                </h3>
                <div className="space-y-2">
                  {result.pruningSteps.map((step, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2.5 text-xs text-foreground bg-secondary/30 p-2.5 rounded-xl border border-border/60"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px] font-bold">
                        {idx + 1}
                      </span>
                      <span className="pt-0.5 leading-relaxed">{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Post-Pruning Recovery & Stress Mitigation */}
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-primary" />
                  Post-Defoliation Recovery Protocol
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-1">
                    <span className="text-muted-foreground font-medium block">
                      Light Intensity Adjustment
                    </span>
                    <p className="font-semibold text-foreground">
                      {result.recoveryProtocol.lightAdjustment}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-1">
                    <span className="text-muted-foreground font-medium block">
                      VPD & Environment Target
                    </span>
                    <p className="font-semibold text-foreground">
                      {result.recoveryProtocol.vpdTarget}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-1">
                    <span className="text-muted-foreground font-medium block">
                      Nutritional Reinforcement
                    </span>
                    <p className="font-semibold text-foreground">
                      {result.recoveryProtocol.recoveryFeeding}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-1">
                    <span className="text-muted-foreground font-medium block">
                      Expected Full Recovery
                    </span>
                    <p className="font-semibold text-primary">
                      {result.recoveryProtocol.expectedRecoveryHours}
                    </p>
                  </div>
                </div>
              </div>

              {/* Direct Diary Logging Button */}
              {selectedPlantId && onLogToPlant && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-foreground">
                      Record Defoliation Event in {currentPlant?.name}'s Diary
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Saves canopy density, pruning percentage, and photo as a Training log
                    </p>
                  </div>
                  <button
                    onClick={handleLogToJournal}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 transition active:scale-95 shadow-sm shrink-0"
                  >
                    <BookOpen className="h-4 w-4" />
                    <span>Log to Plant Journal</span>
                  </button>
                </div>
              )}

              {logSuccessMsg && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 p-3 text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-2 animate-in fade-in">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>{logSuccessMsg}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
