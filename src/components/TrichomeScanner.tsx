import React, { useState, useRef, useEffect, useCallback } from "react";
import { scanTrichomeRipeness, type TrichomeResult, type TrichomeMetrics } from "@/lib/trichome";
import type { Plant } from "@/hooks/use-plants";
import { buildPlantJournalSummary } from "@/lib/journal-context";
import {
  Microscope,
  Camera,
  Upload,
  Sparkles,
  Search,
  ZoomIn,
  Clock,
  Loader2,
  RotateCcw,
  BookOpen,
  ArrowRight,
  Check,
  History,
  AlertCircle,
  ShieldCheck,
  Flame,
  Calendar,
} from "lucide-react";

interface SavedTrichomeScan {
  id: string;
  date: string;
  photo: string;
  result: TrichomeResult;
  plantName?: string;
  plantId?: string;
}

const STORAGE_KEY = "canopy-trichome-scans-v1";

interface TrichomeScannerProps {
  plants: Plant[];
  initialSelectedPlantId?: string | null;
  onLogToPlant?: (
    plantIds: string[],
    logData: {
      type: "training" | "water" | "feed" | "note";
      note: string;
      photo?: string;
    },
  ) => Promise<void>;
  onNavigateToPlant?: (plantId: string) => void;
}

function extractTrichomeMetrics(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): TrichomeMetrics {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  let totalBrightness = 0;
  let whiteCount = 0;
  let amberCount = 0;
  let clearCount = 0;

  const step = 4;
  let sampled = 0;

  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    sampled++;

    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
    totalBrightness += brightness;

    // Amber detection: rich amber/orange/reddish hues
    if (r > 130 && g > 75 && g < r * 0.85 && b < 80) {
      amberCount++;
    }
    // Cloudy/milky white detection: high brightness and low color saturation
    else if (brightness > 165 && Math.abs(r - g) < 25 && Math.abs(g - b) < 25) {
      whiteCount++;
    }
    // Clear/glassy detection: mid brightness with background contrast
    else if (brightness > 90 && brightness <= 165 && Math.abs(r - g) < 20) {
      clearCount++;
    }
  }

  const denom = sampled || 1;
  return {
    averageBrightness: Math.round(totalBrightness / denom),
    amberRatio: +(amberCount / denom).toFixed(3),
    whiteRatio: +(whiteCount / denom).toFixed(3),
    clearRatio: +(clearCount / denom).toFixed(3),
  };
}

function compressAndAnalyzeTrichome(
  file: File,
): Promise<{ dataUrl: string; metrics: TrichomeMetrics }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read image file"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Unable to load image"));
      img.onload = () => {
        const MAX_DIM = 1200;
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
        let metrics: TrichomeMetrics = {};
        try {
          metrics = extractTrichomeMetrics(ctx, width, height);
        } catch {
          // ignore
        }
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        resolve({ dataUrl, metrics });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function getTrichomeProgressStage(seconds: number) {
  if (seconds < 1) {
    return {
      step: 1,
      title: "Detecting Trichome Gland Heads",
      detail: "Isolating bulbous glandular heads on calyx surfaces…",
      eta: "~3s remaining",
      progress: 30,
    };
  }
  if (seconds < 2.5) {
    return {
      step: 2,
      title: "Measuring Gland Cloudiness & Amber Oxidation",
      detail: "Calculating clear vs milky vs amber cannabinoid ratio…",
      eta: "~1s remaining",
      progress: 70,
    };
  }
  return {
    step: 3,
    title: "Synthesizing Harvest Window & Flush Window",
    detail: "Computing estimated days to chop, terpene peak, and cure prep…",
    eta: "<1s remaining",
    progress: 92,
  };
}

export function TrichomeScanner({
  plants,
  initialSelectedPlantId,
  onLogToPlant,
  onNavigateToPlant,
}: TrichomeScannerProps) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<TrichomeMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [result, setResult] = useState<TrichomeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [selectedPlantId, setSelectedPlantId] = useState<string>(
    initialSelectedPlantId || (plants[0]?.id ?? ""),
  );
  const [flowerWeek, setFlowerWeek] = useState<string>("Week 8 Flower");
  const [strainContext, setStrainContext] = useState<string>("");

  const [logSuccessMsg, setLogSuccessMsg] = useState<string | null>(null);
  const [savedScans, setSavedScans] = useState<SavedTrichomeScan[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Digital Loupe Magnifier state
  const [loupeActive, setLoupeActive] = useState(true);
  const [loupeZoom, setLoupeZoom] = useState<2 | 4 | 8>(4);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number } | null>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);

  const currentPlant = plants.find((p) => p.id === selectedPlantId);
  const journalSummary = buildPlantJournalSummary(currentPlant);

  // Sync with selected plant
  useEffect(() => {
    if (selectedPlantId) {
      const match = plants.find((p) => p.id === selectedPlantId);
      if (match) {
        setStrainContext(match.strain || match.name);
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

  const saveToHistory = (res: TrichomeResult, imgUrl: string) => {
    const matchedPlant = plants.find((p) => p.id === selectedPlantId);
    const newScan: SavedTrichomeScan = {
      id: Math.random().toString(36).slice(2, 10),
      date: new Date().toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      photo: imgUrl,
      result: res,
      plantName: matchedPlant?.name || "Trichomes",
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
      const { dataUrl, metrics: extractedMetrics } = await compressAndAnalyzeTrichome(file);
      setPhoto(dataUrl);
      setMetrics(extractedMetrics);

      const matchedPlant = plants.find((p) => p.id === selectedPlantId);
      const summary = buildPlantJournalSummary(matchedPlant);
      const scanResult = await scanTrichomeRipeness({
        imageBase64: dataUrl,
        plantName: matchedPlant?.name || "Trichome Sample",
        strain: strainContext || matchedPlant?.strain || "Hybrid",
        flowerWeek,
        medium: summary?.medium || matchedPlant?.medium || "Soil",
        metrics: extractedMetrics,
      });

      setResult(scanResult);
      saveToHistory(scanResult, dataUrl);
    } catch (err: unknown) {
      console.error("Trichome scan failed:", err);
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to analyze trichomes. Please try again.",
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
      const summary = buildPlantJournalSummary(matchedPlant);
      const scanResult = await scanTrichomeRipeness({
        imageBase64: photo,
        plantName: matchedPlant?.name || "Trichome Sample",
        strain: strainContext || matchedPlant?.strain || "Hybrid",
        flowerWeek,
        medium: summary?.medium || matchedPlant?.medium || "Soil",
        metrics: metrics || undefined,
      });
      setResult(scanResult);
      saveToHistory(scanResult, photo);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogToJournal = async () => {
    if (!selectedPlantId || !onLogToPlant || !result) return;
    try {
      const currentPlant = plants.find((p) => p.id === selectedPlantId);
      const note = `[Trichome Harvest Scan]: ${result.cloudyPercent}% Cloudy, ${result.amberPercent}% Amber, ${result.clearPercent}% Clear. Harvest Window: ${result.harvestWindowStatus} (${result.estimatedDaysToHarvest}). ${result.flushRecommendation.status}. Action: ${result.keyActionToday}`;

      await onLogToPlant([selectedPlantId], {
        type: "note",
        note,
        photo: photo || undefined,
      });

      setLogSuccessMsg(`Logged harvest window to ${currentPlant?.name || "plant"}!`);
      setTimeout(() => setLogSuccessMsg(null), 4000);
    } catch (err) {
      console.error("Failed to log trichome scan to plant:", err);
    }
  };

  // Loupe pointer tracking
  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    if (!imgContainerRef.current) return;
    const rect = imgContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    setLoupePos({ x, y });
  }, []);

  const progressInfo = getTrichomeProgressStage(elapsedSeconds);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
              <Microscope className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                Trichome Ripeness & Harvest Scanner
              </h2>
              <p className="text-xs text-muted-foreground">
                Inspect glandular resin heads, clear/cloudy/amber ratios, and precise chop window
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

        {/* Plant and Bloom Week Selector Context */}
        <div className="mt-4 pt-3 border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
              Cultivar / Target Plant
            </label>
            <select
              value={selectedPlantId}
              onChange={(e) => setSelectedPlantId(e.target.value)}
              className="w-full rounded-xl border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">(Select plant from diary)</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.stage} · {p.medium || "Soil"})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
              Flowering Stage / Week
            </label>
            <select
              value={flowerWeek}
              onChange={(e) => setFlowerWeek(e.target.value)}
              className="w-full rounded-xl border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="Week 5 Flower">Week 5 Flower (Early Swell)</option>
              <option value="Week 6 Flower">Week 6 Flower (Cal-Mag Flush Prep)</option>
              <option value="Week 7 Flower">Week 7 Flower (Trichome Bulking)</option>
              <option value="Week 8 Flower">Week 8 Flower (Peak Harvest Window)</option>
              <option value="Week 9 Flower">Week 9 Flower (Late Bloom Amber Shift)</option>
              <option value="Week 10+ Flower">Week 10+ Flower (Heavy Sedative Amber)</option>
            </select>
          </div>
        </div>

        {journalSummary && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-border/50">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mr-1">
              Synced Journal:
            </span>
            {journalSummary.journalContextBadges.map((b, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-lg bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-foreground"
              >
                {b}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* History Drawer */}
      {showHistory && (
        <div className="rounded-2xl border border-amber-500/30 bg-card p-4 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600">
              Past Trichome Scans & Harvest Forecasts
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
                      {scan.plantName || "Trichomes"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Cloudy:{" "}
                      <span className="text-foreground font-medium">
                        {scan.result.cloudyPercent}%
                      </span>{" "}
                      · Amber:{" "}
                      <span className="text-amber-500 font-medium">
                        {scan.result.amberPercent}%
                      </span>
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
              ? "border-amber-500 bg-amber-500/10"
              : "border-border bg-card/60 hover:border-amber-500/50"
          }`}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-amber-600 shadow-xs mb-3">
            <Microscope className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-bold text-foreground">Upload Macro Bud or Trichome Photo</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-5">
            Use a jeweller’s loupe, macro phone lens, or high-zoom crop focusing directly on the
            swollen flower calyxes (avoid outer fan leaf tips).
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* Dual Pickers: Camera & Gallery */}
            <label className="inline-flex items-center gap-2 rounded-xl bg-amber-600 text-white px-4 py-2.5 text-xs font-semibold hover:bg-amber-700 cursor-pointer active:scale-95 transition shadow-sm">
              <Camera className="h-4 w-4" />
              <span>Take Photo with Camera</span>
              <input
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
                <span>Use current photo of {currentPlant.name}</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="rounded-2xl border border-amber-500/30 bg-card p-6 sm:p-8 space-y-5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
              <span className="text-sm font-bold text-foreground">
                Analyzing Trichome Glands & Ripeness…
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
                className="h-full bg-amber-600 transition-all duration-300"
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

      {/* Active Photo Workspace with Digital Loupe */}
      {photo && !loading && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            {/* Loupe Controls Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border-b border-border bg-secondary/30">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLoupeActive(!loupeActive)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    loupeActive
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Digital Loupe {loupeActive ? "ON" : "OFF"}</span>
                </button>

                {loupeActive && (
                  <div className="flex items-center gap-1 bg-secondary p-1 rounded-lg border border-border/60">
                    {([2, 4, 8] as const).map((z) => (
                      <button
                        key={z}
                        onClick={() => setLoupeZoom(z)}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                          loupeZoom === z
                            ? "bg-card text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {z}x
                      </button>
                    ))}
                  </div>
                )}
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

            {/* Interactive Image & Loupe Viewport */}
            <div
              ref={imgContainerRef}
              onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
              onTouchMove={(e) => {
                if (e.touches[0]) handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
              }}
              className="relative aspect-4/3 sm:aspect-16/10 bg-black/95 flex items-center justify-center overflow-hidden cursor-crosshair select-none"
            >
              <img
                src={photo}
                alt="Trichome macro"
                className="h-full w-full object-contain pointer-events-none"
              />

              {/* Digital Loupe Magnifier Lens */}
              {loupeActive && loupePos && (
                <div
                  className="absolute pointer-events-none z-20 h-40 w-40 rounded-full border-4 border-amber-500 shadow-[0_0_24px_rgba(245,158,11,0.6)] overflow-hidden bg-black -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${loupePos.x}%`,
                    top: `${loupePos.y}%`,
                  }}
                >
                  <div
                    className="absolute inset-0 bg-no-repeat"
                    style={{
                      backgroundImage: `url(${photo})`,
                      backgroundSize: `${loupeZoom * 100}%`,
                      backgroundPosition: `${loupePos.x}% ${loupePos.y}%`,
                    }}
                  />
                  {/* Loupe Crosshairs */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-full w-0.5 bg-amber-500/30" />
                    <div className="w-full h-0.5 bg-amber-500/30 absolute" />
                    <div className="h-3 w-3 rounded-full border border-amber-400 absolute" />
                  </div>
                  <div className="absolute bottom-1 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-[9px] font-mono text-amber-400">
                    {loupeZoom}x MAG
                  </div>
                </div>
              )}

              <div className="absolute bottom-2 left-2 z-10 pointer-events-none rounded-lg bg-black/70 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur-xs">
                Hover or touch to inspect resin heads
              </div>
            </div>

            {/* Quick Re-take Bar */}
            <div className="p-3 border-t border-border bg-secondary/30 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Analyzing as: <strong className="text-foreground">{flowerWeek}</strong>
              </span>
              <button
                onClick={handleReanalyzeWithCurrentPhoto}
                className="text-primary font-semibold hover:underline inline-flex items-center gap-1"
              >
                <span>Re-run scan</span>
                <RotateCcw className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Analysis Results Display */}
          {result && (
            <div className="space-y-5 animate-in fade-in">
              {/* Harvest Status Hero Card */}
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-600 text-white text-xs font-bold shadow-xs">
                    <Flame className="h-3.5 w-3.5" />
                    <span>{result.harvestWindowStatus}</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary border border-border text-xs font-semibold text-foreground">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    <span>Chop Window: {result.estimatedDaysToHarvest}</span>
                  </div>
                </div>

                <p className="text-sm font-semibold text-foreground">{result.keyActionToday}</p>
                <p className="text-xs text-muted-foreground">{result.summary}</p>
              </div>

              {/* Trichome Gland Ratio Breakdown */}
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center justify-between">
                  <span>Trichome Head Ratios</span>
                  <span className="text-xs text-muted-foreground font-normal">
                    Pistils: {result.pistilBrowningPercent}% Brown
                  </span>
                </h3>

                {/* Stacked Visual Bar */}
                <div className="h-6 w-full rounded-xl overflow-hidden flex shadow-inner border border-border">
                  <div
                    style={{ width: `${result.cloudyPercent}%` }}
                    className="bg-zinc-200 text-zinc-900 font-bold text-[11px] flex items-center justify-center transition-all duration-500"
                    title={`${result.cloudyPercent}% Cloudy / Milky`}
                  >
                    {result.cloudyPercent > 12 && `${result.cloudyPercent}% Cloudy`}
                  </div>
                  <div
                    style={{ width: `${result.amberPercent}%` }}
                    className="bg-amber-500 text-white font-bold text-[11px] flex items-center justify-center transition-all duration-500"
                    title={`${result.amberPercent}% Amber`}
                  >
                    {result.amberPercent > 12 && `${result.amberPercent}% Amber`}
                  </div>
                  <div
                    style={{ width: `${result.clearPercent}%` }}
                    className="bg-cyan-600 text-white font-bold text-[11px] flex items-center justify-center transition-all duration-500"
                    title={`${result.clearPercent}% Clear`}
                  >
                    {result.clearPercent > 12 && `${result.clearPercent}% Clear`}
                  </div>
                </div>

                {/* Metric Cards */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl border border-zinc-500/30 bg-secondary/40 p-3">
                    <span className="text-[11px] font-semibold text-foreground block">
                      Cloudy / Milky
                    </span>
                    <p className="text-2xl font-black text-foreground">{result.cloudyPercent}%</p>
                    <span className="text-[10px] text-muted-foreground">Peak THC & Terpenes</span>
                  </div>

                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                    <span className="text-[11px] font-semibold text-amber-600 block">Amber</span>
                    <p className="text-2xl font-black text-amber-600">{result.amberPercent}%</p>
                    <span className="text-[10px] text-muted-foreground">Sedative CBN / Body</span>
                  </div>

                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3">
                    <span className="text-[11px] font-semibold text-cyan-600 block">Clear</span>
                    <p className="text-2xl font-black text-cyan-600">{result.clearPercent}%</p>
                    <span className="text-[10px] text-muted-foreground">Immature / Developing</span>
                  </div>
                </div>
              </div>

              {/* Psychoactive Vibe & Flush Guidelines */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Effect Profile */}
                <div className="rounded-2xl border border-border bg-card p-4 space-y-2.5">
                  <span className="text-[11px] font-bold text-primary uppercase tracking-wider block">
                    Anticipated High & Effect
                  </span>
                  <p className="text-xs font-bold text-foreground">
                    {result.effectProfile.headline}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {result.effectProfile.psychoactiveVibe}
                  </p>
                  <div className="pt-2 flex items-center justify-between text-xs border-t border-border">
                    <span className="text-muted-foreground">Couch-Lock Index:</span>
                    <strong className="text-amber-500">
                      {result.effectProfile.couchLockLevel}
                    </strong>
                  </div>
                </div>

                {/* Flush Guidance */}
                <div className="rounded-2xl border border-border bg-card p-4 space-y-2.5">
                  <span className="text-[11px] font-bold text-cyan-500 uppercase tracking-wider block">
                    Pre-Harvest Flush Status
                  </span>
                  <p className="text-xs font-bold text-foreground">
                    {result.flushRecommendation.status}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {result.flushRecommendation.advice}
                  </p>
                  <div className="pt-2 flex items-center justify-between text-xs border-t border-border">
                    <span className="text-muted-foreground">Watering Regime:</span>
                    <strong className="text-foreground">
                      {result.flushRecommendation.waterType}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Drying Room Setup (60/60 rule) */}
              <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Drying Room Preparation
                </span>
                <p className="text-xs text-foreground/90">{result.dryingPrep}</p>
              </div>

              {/* Direct Journal Logging Button */}
              {selectedPlantId && onLogToPlant && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-foreground">
                      Record Trichome Scan in {currentPlant?.name}'s Diary
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Saves cloudy/amber percentages, countdown, and photo as a Journal note
                    </p>
                  </div>
                  <button
                    onClick={handleLogToJournal}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-amber-700 transition active:scale-95 shadow-sm shrink-0"
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
