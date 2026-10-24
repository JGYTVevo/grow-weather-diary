import React, { useState, useRef, useEffect, useCallback } from "react";
import type { Plant } from "@/hooks/use-plants";
import {
  type LstComparisonItem,
  type TrainingTechnique,
  loadSavedLstComparisons,
  saveLstComparison,
  deleteLstComparison,
  SAMPLE_LST_COMPARISON,
} from "@/lib/lst-comparison";
import {
  SlidersHorizontal,
  Columns2,
  Eye,
  Camera,
  Upload,
  Layers,
  Sparkles,
  Calendar,
  Check,
  Trash2,
  Plus,
  BookOpen,
  ArrowRight,
  TrendingUp,
} from "lucide-react";

interface LSTSliderProps {
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

const TECHNIQUES: TrainingTechnique[] = [
  "LST",
  "Topping",
  "FIM",
  "SCROG",
  "Supercropping",
  "Defoliation",
  "Lollipopping",
  "Branch Spreading",
];

function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed reading file"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed loading image"));
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
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function LSTSlider({
  plants,
  initialSelectedPlantId,
  onLogToPlant,
  onNavigateToPlant,
}: LSTSliderProps) {
  const [selectedPlantId, setSelectedPlantId] = useState<string>(initialSelectedPlantId || "");
  const [comparisons, setComparisons] = useState<LstComparisonItem[]>([]);
  const [activeComparison, setActiveComparison] =
    useState<LstComparisonItem>(SAMPLE_LST_COMPARISON);

  // View mode
  const [viewMode, setViewMode] = useState<"split" | "side-by-side" | "fade">("split");
  const [sliderPosition, setSliderPosition] = useState<number>(50); // 0 to 100%
  const [fadeOpacity, setFadeOpacity] = useState<number>(50); // 0 to 100%
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Journal Photo Picker Modal
  const [showPhotoPickerFor, setShowPhotoPickerFor] = useState<"before" | "after" | null>(null);

  // Editing state for active comparison
  const [title, setTitle] = useState(SAMPLE_LST_COMPARISON.title);
  const [technique, setTechnique] = useState<TrainingTechnique>(SAMPLE_LST_COMPARISON.technique);
  const [beforePhoto, setBeforePhoto] = useState<string>(SAMPLE_LST_COMPARISON.beforePhoto);
  const [beforeDate, setBeforeDate] = useState<string>(SAMPLE_LST_COMPARISON.beforeDate);
  const [beforeNote, setBeforeNote] = useState<string>(SAMPLE_LST_COMPARISON.beforeNote || "");
  const [afterPhoto, setAfterPhoto] = useState<string>(SAMPLE_LST_COMPARISON.afterPhoto);
  const [afterDate, setAfterDate] = useState<string>(SAMPLE_LST_COMPARISON.afterDate);
  const [afterNote, setAfterNote] = useState<string>(SAMPLE_LST_COMPARISON.afterNote || "");
  const [canopyNotes, setCanopyNotes] = useState<string>(SAMPLE_LST_COMPARISON.canopyNotes || "");
  const [spreadIncrease, setSpreadIncrease] = useState<number>(
    SAMPLE_LST_COMPARISON.spreadIncreasePercent || 35,
  );
  const [shootsExposed, setShootsExposed] = useState<number>(
    SAMPLE_LST_COMPARISON.newShootsExposed || 4,
  );

  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [showSavedList, setShowSavedList] = useState(false);

  // Load comparisons from storage
  useEffect(() => {
    const loaded = loadSavedLstComparisons();
    setComparisons(loaded);
    if (loaded.length > 0) {
      applyComparison(loaded[0]!);
    }
  }, []);

  const applyComparison = (item: LstComparisonItem) => {
    setActiveComparison(item);
    setTitle(item.title);
    setTechnique(item.technique);
    setBeforePhoto(item.beforePhoto);
    setBeforeDate(item.beforeDate);
    setBeforeNote(item.beforeNote || "");
    setAfterPhoto(item.afterPhoto);
    setAfterDate(item.afterDate);
    setAfterNote(item.afterNote || "");
    setCanopyNotes(item.canopyNotes || "");
    setSpreadIncrease(item.spreadIncreasePercent ?? 35);
    setShootsExposed(item.newShootsExposed ?? 4);
    if (item.plantId) setSelectedPlantId(item.plantId);
  };

  // Dragging slider handle logic
  const handleMove = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(Math.round(pct));
    },
    [containerRef],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) handleMove(e.clientX);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (isDragging && e.touches[0]) handleMove(e.touches[0].clientX);
    };
    const onMouseUp = () => setIsDragging(false);
    const onTouchEnd = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("touchmove", onTouchMove);
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("touchend", onTouchEnd);
    }
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging, handleMove]);

  // Compute days difference between Before and After
  const daysDifference = (() => {
    try {
      const b = new Date(beforeDate).getTime();
      const a = new Date(afterDate).getTime();
      if (isNaN(b) || isNaN(a)) return null;
      const diffDays = Math.round((a - b) / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch {
      return null;
    }
  })();

  const currentPlant = plants.find((p) => p.id === selectedPlantId);

  // Collect photos from current selected plant
  const plantPhotos: Array<{ url: string; date: string; note: string }> = [];
  if (currentPlant) {
    if (currentPlant.cover) {
      plantPhotos.push({
        url: currentPlant.cover,
        date: currentPlant.started,
        note: "Cover Photo",
      });
    }
    currentPlant.logs.forEach((l) => {
      if (l.photo) {
        plantPhotos.push({
          url: l.photo,
          date: l.date,
          note: l.note || `${l.type} log`,
        });
      }
    });
  }

  // Handle Save to Local Comparisons
  const handleSaveComparison = () => {
    const newItem: LstComparisonItem = {
      id: activeComparison.id.startsWith("sample")
        ? Math.random().toString(36).slice(2, 10)
        : activeComparison.id,
      title: title.trim() || `${technique} Progress Comparison`,
      plantId: selectedPlantId || undefined,
      plantName: currentPlant?.name || activeComparison.plantName,
      technique,
      beforePhoto,
      beforeDate,
      beforeNote,
      afterPhoto,
      afterDate,
      afterNote,
      canopyNotes,
      spreadIncreasePercent: spreadIncrease,
      newShootsExposed: shootsExposed,
    };

    const updated = saveLstComparison(newItem);
    setComparisons(updated);
    setActiveComparison(newItem);
    setSaveSuccessMsg("Comparison saved to your history!");
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // Handle Save to Plant's Journal
  const handleLogToJournal = async () => {
    if (!selectedPlantId || !onLogToPlant) return;
    const daysLabel =
      daysDifference !== null && daysDifference > 0
        ? ` (${daysDifference} day(s) after training)`
        : "";
    const note = `[${technique} Visual Comparison${daysLabel}]: ${title}. ${
      canopyNotes ? `Canopy notes: ${canopyNotes}. ` : ""
    }Estimated canopy spread: +${spreadIncrease}%, new shoots illuminated: ${shootsExposed}.`;

    await onLogToPlant([selectedPlantId], {
      type: "training",
      note,
      photo: afterPhoto,
      technique,
    });

    setSaveSuccessMsg(
      `Logged training comparison into ${currentPlant?.name || "plant"}'s journal!`,
    );
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  const handleStartNewComparison = () => {
    const emptyItem: LstComparisonItem = {
      id: Math.random().toString(36).slice(2, 10),
      title: `${currentPlant ? currentPlant.name : "Plant"} LST Progression`,
      plantId: selectedPlantId || undefined,
      plantName: currentPlant?.name,
      technique: "LST",
      beforePhoto: currentPlant?.cover || SAMPLE_LST_COMPARISON.beforePhoto,
      beforeDate: new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10),
      beforeNote: "Before tie-down / bending",
      afterPhoto: currentPlant?.cover || SAMPLE_LST_COMPARISON.afterPhoto,
      afterDate: new Date().toISOString().slice(0, 10),
      afterNote: "After lateral training",
      canopyNotes: "",
      spreadIncreasePercent: 30,
      newShootsExposed: 4,
    };
    applyComparison(emptyItem);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Before & After LST Slider</h2>
              <p className="text-xs text-muted-foreground">
                Inspect canopy leveling, lateral shoot flare, and branch angles in real time
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSavedList(!showSavedList)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary/80 px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary transition active:scale-95"
            >
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>Saved ({comparisons.length})</span>
            </button>
            <button
              onClick={handleStartNewComparison}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition active:scale-95 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Comparison</span>
            </button>
          </div>
        </div>

        {/* Plant Selector */}
        <div className="mt-4 pt-3 border-t border-border/60 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Target Plant:</span>
          <select
            value={selectedPlantId}
            onChange={(e) => {
              setSelectedPlantId(e.target.value);
              const p = plants.find((x) => x.id === e.target.value);
              if (p && beforePhoto === SAMPLE_LST_COMPARISON.beforePhoto && p.cover) {
                setBeforePhoto(p.cover);
              }
            }}
            className="rounded-xl border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">(No specific plant selected)</option>
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.stage} · {p.strain || "Unknown"})
              </option>
            ))}
          </select>

          {currentPlant && onNavigateToPlant && (
            <button
              onClick={() => onNavigateToPlant(currentPlant.id)}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1 ml-auto"
            >
              <span>View plant journal</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Saved Comparisons Drawer */}
      {showSavedList && (
        <div className="rounded-2xl border border-primary/30 bg-card p-4 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
              Saved Training Progress Milestones
            </h3>
            <button
              onClick={() => setShowSavedList(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close ✕
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {comparisons.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  applyComparison(item);
                  setShowSavedList(false);
                }}
                className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition ${
                  activeComparison.id === item.id
                    ? "border-primary bg-primary/10"
                    : "border-border bg-secondary/40 hover:bg-secondary"
                }`}
              >
                <div className="flex -space-x-2 shrink-0">
                  <img
                    src={item.beforePhoto}
                    alt="Before"
                    className="h-10 w-10 rounded-lg object-cover border border-background shadow-xs"
                  />
                  <img
                    src={item.afterPhoto}
                    alt="After"
                    className="h-10 w-10 rounded-lg object-cover border border-background shadow-xs"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="text-primary font-medium">{item.technique}</span> ·{" "}
                    {item.plantName || "Plant"}
                  </p>
                </div>
                {item.id !== "sample-lst-demo" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const updated = deleteLstComparison(item.id);
                      setComparisons(updated);
                      if (activeComparison.id === item.id && updated.length > 0) {
                        applyComparison(updated[0]!);
                      }
                    }}
                    className="p-1 text-muted-foreground hover:text-destructive rounded-lg transition"
                    title="Delete saved comparison"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Interactive Comparison Workspace */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        {/* View Mode Switcher Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-1.5 bg-secondary p-1 rounded-xl border border-border/60">
            <button
              onClick={() => setViewMode("split")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === "split"
                  ? "bg-card text-foreground shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
              <span>Interactive Split</span>
            </button>
            <button
              onClick={() => setViewMode("side-by-side")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === "side-by-side"
                  ? "bg-card text-foreground shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Columns2 className="h-3.5 w-3.5 text-primary" />
              <span>Side-by-Side</span>
            </button>
            <button
              onClick={() => setViewMode("fade")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                viewMode === "fade"
                  ? "bg-card text-foreground shadow-xs border border-border/80"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="h-3.5 w-3.5 text-primary" />
              <span>Fade / Overlay</span>
            </button>
          </div>

          {/* Days Elapsed Pill */}
          {daysDifference !== null && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
              <Calendar className="h-3 w-3" />
              <span>
                {daysDifference === 0
                  ? "Same day comparison"
                  : daysDifference > 0
                    ? `+${daysDifference} day(s) post-training`
                    : `${Math.abs(daysDifference)} days prior`}
              </span>
            </div>
          )}
        </div>

        {/* Interactive Viewer Body */}
        <div className="p-3 sm:p-5">
          {viewMode === "split" && (
            <div className="space-y-3">
              {/* Draggable Split Canvas */}
              <div
                ref={containerRef}
                className="relative select-none aspect-4/3 sm:aspect-16/10 w-full overflow-hidden rounded-xl border border-border bg-black/90 cursor-ew-resize touch-none shadow-inner"
                onMouseDown={(e) => {
                  setIsDragging(true);
                  handleMove(e.clientX);
                }}
                onTouchStart={(e) => {
                  setIsDragging(true);
                  if (e.touches[0]) handleMove(e.touches[0].clientX);
                }}
              >
                {/* After Photo (Full background) */}
                <img
                  src={afterPhoto}
                  alt="After training"
                  className="absolute inset-0 h-full w-full object-contain pointer-events-none"
                />

                {/* Before Photo (Clipped overlay) */}
                <div
                  className="absolute inset-0 overflow-hidden pointer-events-none"
                  style={{ width: `${sliderPosition}%` }}
                >
                  <img
                    src={beforePhoto}
                    alt="Before training"
                    className="absolute inset-0 h-full w-full object-contain max-w-none"
                    style={{
                      width: containerRef.current
                        ? `${containerRef.current.clientWidth}px`
                        : "100%",
                    }}
                  />
                </div>

                {/* Split Line & Handle */}
                <div
                  className="absolute top-0 bottom-0 z-20 w-0.75 bg-primary shadow-[0_0_12px_rgba(34,197,94,0.8)] pointer-events-none"
                  style={{ left: `${sliderPosition}%` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-xs shadow-lg border-2 border-background">
                    ↔
                  </div>
                </div>

                {/* Floating Labels */}
                <div className="absolute top-3 left-3 z-10 pointer-events-none rounded-lg bg-black/70 backdrop-blur px-2.5 py-1 text-[11px] font-bold text-white border border-white/10">
                  BEFORE ({beforeDate || "Day 0"})
                </div>
                <div className="absolute top-3 right-3 z-10 pointer-events-none rounded-lg bg-primary/90 backdrop-blur px-2.5 py-1 text-[11px] font-bold text-primary-foreground shadow">
                  AFTER ({afterDate || "Trained"})
                </div>
              </div>

              {/* Slider Scrub Control */}
              <div className="flex items-center gap-3 px-1">
                <span className="text-xs font-semibold text-muted-foreground w-12 text-left">
                  Before
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderPosition}
                  onChange={(e) => setSliderPosition(Number(e.target.value))}
                  className="flex-1 accent-primary h-2 rounded-lg bg-secondary cursor-pointer"
                />
                <span className="text-xs font-semibold text-primary w-12 text-right">After</span>
                <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">
                  {sliderPosition}%
                </span>
              </div>
            </div>
          )}

          {viewMode === "side-by-side" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Before Card */}
              <div className="space-y-2 rounded-xl border border-border/80 bg-secondary/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">Before Training</span>
                  <span className="text-[11px] text-muted-foreground">{beforeDate}</span>
                </div>
                <div className="aspect-4/3 rounded-lg overflow-hidden bg-black/90 border border-border flex items-center justify-center">
                  <img
                    src={beforePhoto}
                    alt="Before training"
                    className="h-full w-full object-contain"
                  />
                </div>
                {beforeNote && (
                  <p className="text-xs text-muted-foreground italic">"{beforeNote}"</p>
                )}
              </div>

              {/* After Card */}
              <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary">After Training</span>
                  <span className="text-[11px] text-primary font-medium">{afterDate}</span>
                </div>
                <div className="aspect-4/3 rounded-lg overflow-hidden bg-black/90 border border-primary/30 flex items-center justify-center">
                  <img
                    src={afterPhoto}
                    alt="After training"
                    className="h-full w-full object-contain"
                  />
                </div>
                {afterNote && <p className="text-xs text-foreground/80 italic">"{afterNote}"</p>}
              </div>
            </div>
          )}

          {viewMode === "fade" && (
            <div className="space-y-3">
              <div className="relative aspect-4/3 sm:aspect-16/10 w-full overflow-hidden rounded-xl border border-border bg-black/90 shadow-inner">
                {/* Before Image */}
                <img
                  src={beforePhoto}
                  alt="Before"
                  className="absolute inset-0 h-full w-full object-contain"
                />
                {/* After Image with Opacity */}
                <img
                  src={afterPhoto}
                  alt="After"
                  className="absolute inset-0 h-full w-full object-contain transition-opacity duration-75"
                  style={{ opacity: fadeOpacity / 100 }}
                />

                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                  <span className="rounded-lg bg-black/80 px-2 py-0.5 text-[11px] text-white">
                    0% Before
                  </span>
                  <span className="rounded-lg bg-primary/90 px-2 py-0.5 text-[11px] font-bold text-primary-foreground shadow">
                    {fadeOpacity}% Overlay
                  </span>
                  <span className="rounded-lg bg-black/80 px-2 py-0.5 text-[11px] text-white">
                    100% After
                  </span>
                </div>
              </div>

              {/* Opacity Slider */}
              <div className="flex items-center gap-3 px-1">
                <span className="text-xs font-semibold text-muted-foreground">Fade Opacity:</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={fadeOpacity}
                  onChange={(e) => setFadeOpacity(Number(e.target.value))}
                  className="flex-1 accent-primary h-2 rounded-lg bg-secondary cursor-pointer"
                />
                <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">
                  {fadeOpacity}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Photo Upload & Replacement Toolbar */}
        <div className="border-t border-border bg-secondary/20 p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Change Comparison Photos
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Before Photo Input */}
            <div className="space-y-2 rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Before Photo</span>
                <input
                  type="date"
                  value={beforeDate}
                  onChange={(e) => setBeforeDate(e.target.value)}
                  className="rounded-lg border border-border bg-secondary px-2 py-1 text-xs text-foreground outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex-1 min-w-[110px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary cursor-pointer active:scale-95 transition">
                  <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Gallery</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/gif"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setBeforePhoto(await compressPhoto(f));
                      e.target.value = "";
                    }}
                  />
                </label>

                <label className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 cursor-pointer active:scale-95 transition">
                  <Camera className="h-3.5 w-3.5" />
                  <span>Camera</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setBeforePhoto(await compressPhoto(f));
                      e.target.value = "";
                    }}
                  />
                </label>

                {plantPhotos.length > 0 && (
                  <button
                    onClick={() => setShowPhotoPickerFor("before")}
                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-secondary px-2.5 py-2 text-xs font-medium text-foreground hover:bg-secondary/80 transition"
                  >
                    <BookOpen className="h-3 w-3 text-primary" />
                    <span>Journal ({plantPhotos.length})</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="Note: e.g. Day 18 vegetative apex before topping..."
                value={beforeNote}
                onChange={(e) => setBeforeNote(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* After Photo Input */}
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary">After Photo</span>
                <input
                  type="date"
                  value={afterDate}
                  onChange={(e) => setAfterDate(e.target.value)}
                  className="rounded-lg border border-border bg-secondary px-2 py-1 text-xs text-foreground outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex-1 min-w-[110px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary cursor-pointer active:scale-95 transition">
                  <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Gallery</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/gif"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setAfterPhoto(await compressPhoto(f));
                      e.target.value = "";
                    }}
                  />
                </label>

                <label className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold hover:bg-primary/90 cursor-pointer active:scale-95 transition shadow-xs">
                  <Camera className="h-3.5 w-3.5" />
                  <span>Camera</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setAfterPhoto(await compressPhoto(f));
                      e.target.value = "";
                    }}
                  />
                </label>

                {plantPhotos.length > 0 && (
                  <button
                    onClick={() => setShowPhotoPickerFor("after")}
                    className="inline-flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition"
                  >
                    <BookOpen className="h-3 w-3 text-primary" />
                    <span>Journal ({plantPhotos.length})</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="Note: e.g. Day 22 flat table canopy after 4-point wire tie..."
                value={afterNote}
                onChange={(e) => setAfterNote(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Training Details & Canopy Progression Metrics */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4 shadow-sm">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
          Training Details & Canopy Progression
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Comparison Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Main Stem Tie-Down & Lateral Shoot Flare"
              className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Training Technique
            </label>
            <div className="flex flex-wrap gap-1.5">
              {TECHNIQUES.map((tech) => (
                <button
                  key={tech}
                  onClick={() => setTechnique(tech)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                    technique === tech
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tech}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Canopy Spread & Shoot Count Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                Canopy Area Expansion
              </span>
              <span className="text-xs font-bold text-primary font-mono">+{spreadIncrease}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="150"
              step="5"
              value={spreadIncrease}
              onChange={(e) => setSpreadIncrease(Number(e.target.value))}
              className="w-full accent-primary h-2 rounded-lg bg-secondary cursor-pointer"
            />
            <p className="text-[11px] text-muted-foreground">
              Estimated percentage increase in horizontal light-absorbing surface area
            </p>
          </div>

          <div className="rounded-xl border border-border bg-secondary/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Secondary Tops Exposed
              </span>
              <span className="text-xs font-bold text-primary font-mono">
                {shootsExposed} Colas
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="24"
              value={shootsExposed}
              onChange={(e) => setShootsExposed(Number(e.target.value))}
              className="w-full accent-primary h-2 rounded-lg bg-secondary cursor-pointer"
            />
            <p className="text-[11px] text-muted-foreground">
              Number of emerging side branches now receiving vertical direct lighting
            </p>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Canopy Observation & Stem Suppleness Notes
          </label>
          <textarea
            rows={2}
            value={canopyNotes}
            onChange={(e) => setCanopyNotes(e.target.value)}
            placeholder="e.g. Main stem softened prior to bending with light stem massage. Rubber-coated ties anchored to pot rim. Auxin redistributed to 6 equal top shoots within 48 hours."
            className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Action Buttons: Save Comparison & Log to Journal */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={handleSaveComparison}
            className="inline-flex items-center gap-2 rounded-xl bg-secondary border border-border px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-secondary/80 transition active:scale-95 shadow-xs"
          >
            <Check className="h-4 w-4 text-primary" />
            <span>Save Comparison to App</span>
          </button>

          {selectedPlantId && onLogToPlant && (
            <button
              onClick={handleLogToJournal}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition active:scale-95 shadow-sm ml-auto"
            >
              <BookOpen className="h-4 w-4" />
              <span>Log Comparison to {currentPlant?.name}'s Diary</span>
            </button>
          )}
        </div>

        {saveSuccessMsg && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs font-medium text-primary flex items-center gap-2 animate-in fade-in">
            <Check className="h-4 w-4 shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* Plant Journal Photo Picker Modal */}
      {showPhotoPickerFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 space-y-4 max-h-[85vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Select {showPhotoPickerFor === "before" ? "Before" : "After"} Photo from Journal
                </h3>
                <p className="text-xs text-muted-foreground">
                  {currentPlant?.name}: pick any photo from previous growth logs
                </p>
              </div>
              <button
                onClick={() => setShowPhotoPickerFor(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {plantPhotos.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    if (showPhotoPickerFor === "before") {
                      setBeforePhoto(item.url);
                      setBeforeDate(item.date);
                      if (item.note) setBeforeNote(item.note);
                    } else {
                      setAfterPhoto(item.url);
                      setAfterDate(item.date);
                      if (item.note) setAfterNote(item.note);
                    }
                    setShowPhotoPickerFor(null);
                  }}
                  className="rounded-xl border border-border overflow-hidden bg-secondary/50 hover:border-primary cursor-pointer transition active:scale-95 group"
                >
                  <div className="aspect-square relative overflow-hidden bg-black/90">
                    <img
                      src={item.url}
                      alt={item.note}
                      className="h-full w-full object-cover group-hover:scale-105 transition"
                    />
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] font-semibold text-foreground truncate">
                      {item.date}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">{item.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
