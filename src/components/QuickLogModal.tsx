import React, { useState, useEffect } from "react";
import type { Plant, Log, LogType } from "@/hooks/use-plants";
import {
  X,
  Droplets,
  FlaskConical,
  Scissors,
  Camera,
  Upload,
  Ruler,
  Sparkles,
  Check,
  Sprout,
  CheckCircle2,
} from "lucide-react";

interface QuickLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  plants: Plant[];
  defaultPlantId?: string | null;
  onSaveLog: (plantIds: string[], logData: Omit<Log, "id">) => Promise<void>;
}

type QuickCategory = "status" | "water" | "feed" | "training";

const STATUS_PRESETS = [
  {
    label: "Praying / Strong vigor",
    icon: "🌱",
    note: "Foliage praying toward light with high cell turgor",
  },
  {
    label: "Thirsty / Dryback done",
    icon: "💧",
    note: "Substrate dryback complete; ready for irrigation",
  },
  {
    label: "Healthy & Balanced",
    icon: "✨",
    note: "Uniform emerald foliage, no deficiencies observed",
  },
  {
    label: "Rapid Bloom Stretch",
    icon: "🚀",
    note: "Active vertical stretch; canopy nodes spacing out",
  },
  { label: "Light Tip Burn", icon: "⚠️", note: "Slight nutrient tip burn; monitoring EC runoff" },
  { label: "Canopy Adjusted", icon: "✂️", note: "Leaves tucked under bud sites for direct light" },
];

const WATER_AMOUNTS = ["500ml", "1.0L", "1.5L", "2.0L", "To 15% Runoff"];
const PH_PRESETS = ["5.8", "6.0", "6.2", "6.5", "6.8"];
const FEED_TYPES = [
  "Standard Bloom",
  "Vegetative N-P-K",
  "Light Half-Dose",
  "Cal-Mag Boost",
  "Plain Flush",
];
const TRAINING_PRESETS = [
  "LST Branch Ties",
  "Leaf Tucking",
  "Topping",
  "Defoliation Sweep",
  "Lollipopping",
];

function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.onload = () => {
        const MAX_DIM = 960;
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
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function QuickLogModal({
  isOpen,
  onClose,
  plants,
  defaultPlantId,
  onSaveLog,
}: QuickLogModalProps) {
  const activePlants = React.useMemo(() => plants.filter((p) => p.stage !== "Harvested"), [plants]);

  // Multi-plant selection
  const [selectedPlantIds, setSelectedPlantIds] = useState<string[]>([]);
  const [category, setCategory] = useState<QuickCategory>("status");

  // Form values
  const [statusPreset, setStatusPreset] = useState<string>("");
  const [waterAmount, setWaterAmount] = useState<string>("1.0L");
  const [waterPh, setWaterPh] = useState<string>("6.3");
  const [feedType, setFeedType] = useState<string>("Standard Bloom");
  const [feedEc, setFeedEc] = useState<string>("1.4");
  const [trainingType, setTrainingType] = useState<string>("LST Branch Ties");
  const [heightCm, setHeightCm] = useState<string>("");
  const [customNote, setCustomNote] = useState<string>("");
  const [photo, setPhoto] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Initialize selection
  useEffect(() => {
    if (isOpen) {
      if (defaultPlantId && activePlants.some((p) => p.id === defaultPlantId)) {
        setSelectedPlantIds([defaultPlantId]);
      } else if (activePlants.length > 0) {
        setSelectedPlantIds(activePlants.map((p) => p.id));
      }
      setSavedSuccess(false);
    }
  }, [isOpen, defaultPlantId, activePlants]);

  if (!isOpen) return null;

  const togglePlantSelection = (id: string) => {
    setSelectedPlantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAllPlants = () => {
    if (selectedPlantIds.length === activePlants.length) {
      setSelectedPlantIds([]);
    } else {
      setSelectedPlantIds(activePlants.map((p) => p.id));
    }
  };

  const handleSave = async () => {
    if (selectedPlantIds.length === 0) return;
    setSaving(true);

    try {
      let logType: LogType = "note";
      let amount: string | undefined;
      let ph: string | undefined;
      let ec: string | undefined;
      let technique: string | undefined;
      let height: string | undefined;
      let noteContent = customNote.trim();

      if (category === "water") {
        logType = "water";
        amount = waterAmount;
        ph = waterPh;
        if (!noteContent) noteContent = `Watered ${waterAmount} (pH ${waterPh})`;
      } else if (category === "feed") {
        logType = "feed";
        amount = waterAmount;
        ph = waterPh;
        ec = feedEc ? `${feedEc} mS/cm` : undefined;
        if (!noteContent)
          noteContent = `Fed ${feedType} · ${waterAmount} (pH ${waterPh}, EC ${feedEc || "1.4"})`;
      } else if (category === "training") {
        logType = "training";
        technique = trainingType;
        if (!noteContent) noteContent = `Performed ${trainingType}`;
      } else {
        // Daily status vibe
        logType = photo ? "photo" : "note";
        if (statusPreset && !noteContent) {
          noteContent = statusPreset;
        } else if (statusPreset && noteContent) {
          noteContent = `${statusPreset} — ${noteContent}`;
        }
      }

      if (heightCm) {
        height = heightCm;
        noteContent = noteContent
          ? `${noteContent} · Height: ${heightCm}cm`
          : `Height: ${heightCm}cm`;
      }

      await onSaveLog(selectedPlantIds, {
        type: logType,
        note: noteContent || "Daily check-in completed",
        photo: photo || undefined,
        amount,
        ph,
        ec,
        technique,
        height,
        date: new Date().toISOString().slice(0, 10),
      });

      setSavedSuccess(true);
      setTimeout(() => {
        setSaving(false);
        onClose();
      }, 700);
    } catch (err) {
      console.error(err);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/40">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Quick Daily Log</h2>
              <p className="text-[11px] text-muted-foreground">
                One-tap check-in across your plants without filling the full form
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Target Plant Multi-Select Chips */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
                Target Plants ({selectedPlantIds.length}/{activePlants.length})
              </span>
              {activePlants.length > 1 && (
                <button
                  type="button"
                  onClick={selectAllPlants}
                  className="text-primary hover:underline font-medium text-[11px]"
                >
                  {selectedPlantIds.length === activePlants.length ? "Deselect All" : "Select All"}
                </button>
              )}
            </div>

            {activePlants.length === 0 ? (
              <p className="text-muted-foreground py-2 italic">
                No active plants found in your diary. Add a plant first!
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {activePlants.map((p) => {
                  const isSelected = selectedPlantIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePlantSelection(p.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition active:scale-95 ${
                        isSelected
                          ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                          : "border border-border bg-secondary/60 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span>🌱 {p.name}</span>
                      {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action Category Switcher */}
          <div className="flex rounded-xl bg-secondary p-1 border border-border/80 gap-1">
            <button
              type="button"
              onClick={() => setCategory("status")}
              className={`flex-1 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1 transition ${
                category === "status"
                  ? "bg-card text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sprout className="h-3.5 w-3.5 text-primary" />
              <span>Status</span>
            </button>
            <button
              type="button"
              onClick={() => setCategory("water")}
              className={`flex-1 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1 transition ${
                category === "water"
                  ? "bg-card text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Droplets className="h-3.5 w-3.5 text-cyan-500" />
              <span>Water</span>
            </button>
            <button
              type="button"
              onClick={() => setCategory("feed")}
              className={`flex-1 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1 transition ${
                category === "feed"
                  ? "bg-card text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FlaskConical className="h-3.5 w-3.5 text-emerald-500" />
              <span>Feed</span>
            </button>
            <button
              type="button"
              onClick={() => setCategory("training")}
              className={`flex-1 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1 transition ${
                category === "training"
                  ? "bg-card text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Scissors className="h-3.5 w-3.5 text-amber-500" />
              <span>Train</span>
            </button>
          </div>

          {/* Quick Settings Based on Category */}
          {category === "status" && (
            <div className="space-y-2">
              <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px] block">
                Quick Daily Observation (Tap 1)
              </span>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_PRESETS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setStatusPreset(item.label);
                      setCustomNote(item.note);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition flex items-start gap-2 ${
                      statusPreset === item.label
                        ? "border-primary bg-primary/10 text-foreground font-semibold"
                        : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    <span className="text-base shrink-0">{item.icon}</span>
                    <span className="text-[11px] leading-tight">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {category === "water" && (
            <div className="space-y-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3.5">
              <div>
                <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px] block mb-1.5">
                  Water Volume
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {WATER_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setWaterAmount(amt)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                        waterAmount === amt
                          ? "bg-cyan-600 text-white font-semibold"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {amt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px] block mb-1.5">
                  pH Level
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PH_PRESETS.map((ph) => (
                    <button
                      key={ph}
                      type="button"
                      onClick={() => setWaterPh(ph)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                        waterPh === ph
                          ? "bg-cyan-600 text-white font-semibold"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      pH {ph}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {category === "feed" && (
            <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5">
              <div>
                <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px] block mb-1.5">
                  Formula Type
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {FEED_TYPES.map((ft) => (
                    <button
                      key={ft}
                      type="button"
                      onClick={() => setFeedType(ft)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                        feedType === ft
                          ? "bg-emerald-600 text-white font-semibold"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {ft}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Target EC</label>
                  <input
                    type="text"
                    value={feedEc}
                    onChange={(e) => setFeedEc(e.target.value)}
                    placeholder="1.4 mS/cm"
                    className="w-full rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs text-foreground outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Target pH</label>
                  <input
                    type="text"
                    value={waterPh}
                    onChange={(e) => setWaterPh(e.target.value)}
                    placeholder="6.3"
                    className="w-full rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs text-foreground outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {category === "training" && (
            <div className="space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5">
              <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px] block mb-1.5">
                Training Technique
              </span>
              <div className="flex flex-wrap gap-1.5">
                {TRAINING_PRESETS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTrainingType(t)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      trainingType === t
                        ? "bg-amber-600 text-white font-semibold"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Plant Height Input (Optional) */}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 p-2.5">
            <Ruler className="h-4 w-4 text-primary shrink-0" />
            <input
              type="number"
              placeholder="Height check (cm, optional)"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className="flex-1 bg-transparent text-xs text-foreground outline-none"
            />
            {heightCm && (
              <span className="text-[11px] font-mono text-primary font-semibold">
                {heightCm} cm
              </span>
            )}
          </div>

          {/* Optional One-Line Note */}
          <div>
            <input
              type="text"
              placeholder="Quick observation or note (optional)..."
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Photo Snap or Upload */}
          <div className="flex items-center gap-2">
            {photo ? (
              <div className="relative inline-block">
                <img
                  src={photo}
                  alt="Snapshot"
                  className="h-14 w-14 rounded-xl object-cover border border-primary"
                />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px]"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 w-full">
                <label className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 cursor-pointer active:scale-95 transition">
                  <Camera className="h-3.5 w-3.5" />
                  <span>📷 Camera</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setPhoto(await compressPhoto(f));
                      e.target.value = "";
                    }}
                  />
                </label>

                <label className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/80 cursor-pointer active:scale-95 transition">
                  <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>📁 Gallery</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/gif"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setPhoto(await compressPhoto(f));
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer / Save Trigger */}
        <div className="p-4 border-t border-border bg-secondary/30 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={saving || selectedPlantIds.length === 0}
            onClick={handleSave}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-md transition active:scale-95 ${
              savedSuccess ? "bg-emerald-600" : "bg-primary hover:bg-primary/90 disabled:opacity-50"
            }`}
          >
            {savedSuccess ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Saved to Journal!</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                <span>
                  Save Check-in ({selectedPlantIds.length}{" "}
                  {selectedPlantIds.length === 1 ? "Plant" : "Plants"})
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
