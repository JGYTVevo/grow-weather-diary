import { useEffect, useRef, useState } from "react";
import { db, handleFirestoreError, OperationType, type FirebaseUser } from "@/lib/firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import {
  Cloud,
  CloudCheck,
  Sparkles,
  Plus,
  AlertCircle,
  Stethoscope,
  ArrowRight,
  Check,
  Compass,
  Scissors,
  SlidersHorizontal,
  Microscope,
  Loader2,
  Camera,
  Upload,
  X,
  ZoomIn,
  Image as ImageIcon,
} from "lucide-react";
import { usePlants } from "@/hooks/use-plants";
import {
  useFertilizers,
  DILUTION_RATIO_PRESETS,
  RAW_DOSAGE_PRESETS,
  type HomemadeFertilizer,
  type FertilizerForm,
} from "@/hooks/use-fertilizers";
import { compressImage, formatDataUrlSize } from "@/lib/photo-utils";

export type { Stage, LogType, Log, Plant } from "@/hooks/use-plants";
import type { Stage, LogType, Log, Plant } from "@/hooks/use-plants";

const STAGES: Stage[] = [
  "Germination",
  "Seedling",
  "Vegetative",
  "Flowering",
  "Drying",
  "Curing",
  "Harvested",
];
const LOGS: Record<LogType, { icon: string; label: string }> = {
  water: { icon: "💧", label: "Water" },
  feed: { icon: "🧪", label: "Feed" },
  training: { icon: "✂️", label: "Training" },
  environment: { icon: "🌡️", label: "Environment" },
  photo: { icon: "📷", label: "Photo" },
  note: { icon: "📝", label: "Note" },
};
const TECHNIQUES = [
  "LST",
  "Topping",
  "FIM",
  "Defoliation",
  "Lollipopping",
  "SCROG",
  "Supercropping",
  "Transplant",
];
const KEY = "canopy-plants-v2";
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const days = (d?: string | null) => {
  if (!d) return 0;
  const t = new Date(d).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
};
const weekDay = (d?: string | null) => {
  const n = days(d);
  return `Week ${Math.floor(n / 7) + 1} · Day ${(n % 7) + 1}`;
};

const input =
  "w-full rounded-xl border bg-secondary px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const btn = "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground";
const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`;

function PhotoPick({
  onPick,
  label,
  currentPhoto,
  onClear,
  onCompressingChange,
}: {
  onPick: (d: string) => void;
  label: string;
  currentPhoto?: string | null;
  onClear?: () => void;
  compact?: boolean;
  onCompressingChange?: (busy: boolean) => void;
}) {
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (f?: File) => {
    if (!f) return;
    setCompressing(true);
    onCompressingChange?.(true);
    setError(null);
    try {
      const compressed = await compressImage(f, {
        maxDimension: 512,
        quality: 0.6,
        maxBase64Length: 65000,
      });
      if (compressed) {
        onPick(compressed);
      } else {
        setError("Could not read image file.");
      }
    } catch (err) {
      console.error("Failed to compress photo:", err);
      setError("Failed to optimize photo. Please try another image.");
    } finally {
      setCompressing(false);
      onCompressingChange?.(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="inline-flex flex-wrap items-center gap-1.5">
        {/* Gallery / File Picker */}
        <label
          className={`rounded-xl border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:border-primary hover:bg-secondary hover:text-foreground cursor-pointer inline-flex items-center gap-1.5 active:scale-95 transition ${
            compressing ? "opacity-60 pointer-events-none" : ""
          }`}
        >
          {compressing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Optimizing...</span>
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{label}</span>
            </>
          )}
          <input
            type="file"
            accept="image/*,image/jpeg,image/png,image/webp,image/heic,image/heif"
            disabled={compressing}
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              await handleFile(f);
              e.target.value = "";
            }}
          />
        </label>

        {/* Camera Snap */}
        <label
          title="Take photo with camera"
          className={`rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-2 text-xs font-medium text-primary hover:bg-primary/20 cursor-pointer inline-flex items-center gap-1.5 active:scale-95 transition ${
            compressing ? "opacity-60 pointer-events-none" : ""
          }`}
        >
          <Camera className="h-3.5 w-3.5" />
          <span>Camera</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={compressing}
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              await handleFile(f);
              e.target.value = "";
            }}
          />
        </label>

        {/* Optional Clear Button */}
        {currentPhoto && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs font-medium text-destructive hover:bg-destructive/20 transition active:scale-95 inline-flex items-center gap-1"
          >
            <X className="h-3 w-3" />
            <span>Remove</span>
          </button>
        )}
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

export interface PlantsPanelProps {
  currentUser?: FirebaseUser | null;
  onOpenAccount?: () => void;
  externalLog?: {
    type: LogType;
    note: string;
    photo?: string;
    temp?: string;
    humidity?: string;
  } | null;
  onClearExternalLog?: () => void;
  plantsState?: ReturnType<typeof usePlants>;
  fertilizersState?: ReturnType<typeof useFertilizers>;
  onOpenDoctorForPlant?: (plantId: string) => void;
  onOpenAdviceForPlant?: (
    plantId: string,
    initialTool?: "advice" | "visualizer" | "trichome" | "defoliation" | "lst",
  ) => void;
  openedPlantId?: string | null;
  onClosePlant?: () => void;
}

export function PlantsPanel(props: PlantsPanelProps = {}) {
  if (props.plantsState && props.fertilizersState) {
    return (
      <PlantsPanelContent
        {...props}
        plantsState={props.plantsState}
        fertilizersState={props.fertilizersState}
      />
    );
  }
  return <PlantsPanelStandalone {...props} />;
}

function PlantsPanelStandalone(props: PlantsPanelProps) {
  const internalPlantsState = usePlants(props.currentUser);
  const internalFertilizersState = useFertilizers(props.currentUser);
  return (
    <PlantsPanelContent
      {...props}
      plantsState={props.plantsState || internalPlantsState}
      fertilizersState={props.fertilizersState || internalFertilizersState}
    />
  );
}

function PlantsPanelContent({
  currentUser,
  onOpenAccount,
  externalLog,
  onClearExternalLog,
  plantsState,
  fertilizersState,
  onOpenDoctorForPlant,
  onOpenAdviceForPlant,
  openedPlantId = null,
  onClosePlant,
}: PlantsPanelProps & {
  plantsState: ReturnType<typeof usePlants>;
  fertilizersState: ReturnType<typeof useFertilizers>;
}) {
  const { plants, updatePlant, setPlantCover, createPlant, deletePlant, addLogToPlants } =
    plantsState;
  const { fertilizers } = fertilizersState;

  const [openId, setOpenId] = useState<string | null>(openedPlantId);
  const [adding, setAdding] = useState(false);
  const [selectedExternalPlantIds, setSelectedExternalPlantIds] = useState<string[]>([]);

  useEffect(() => {
    if (openedPlantId !== undefined) {
      setOpenId(openedPlantId);
    }
  }, [openedPlantId]);

  const active = plants.filter((p) => p.stage !== "Harvested");

  // Keep selectedExternalPlantIds up to date with active plants
  useEffect(() => {
    if (externalLog && active.length > 0 && selectedExternalPlantIds.length === 0) {
      setSelectedExternalPlantIds(active.map((p) => p.id));
    }
  }, [externalLog, active, selectedExternalPlantIds.length]);

  const handleSaveNew = async (p: Plant) => {
    try {
      await createPlant(p);
      setAdding(false);
    } catch (err) {
      console.error("Failed to create plant:", err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePlant(id);
      setOpenId(null);
      onClosePlant?.();
    } catch (err) {
      console.error("Failed to delete plant:", err);
    }
  };

  const attachExternalLogToPlants = async (plantIds: string[]) => {
    if (!externalLog || plantIds.length === 0) return;
    try {
      await addLogToPlants(plantIds, {
        type: externalLog.type,
        note: externalLog.note,
        photo: externalLog.photo,
        temp: externalLog.temp,
        humidity: externalLog.humidity,
        date: today(),
      });
      onClearExternalLog?.();
    } catch (err) {
      console.error("Failed to attach log to plants:", err);
    }
  };

  const open = plants.find((p) => p.id === openId);

  if (open)
    return (
      <PlantView
        plant={open}
        allPlants={plants}
        fertilizers={fertilizers}
        back={() => {
          setOpenId(null);
          onClosePlant?.();
        }}
        onChange={(fn) => updatePlant(open.id, fn)}
        onSetCover={(cover) => setPlantCover(open.id, cover)}
        onDelete={() => {
          void handleDelete(open.id);
        }}
        onOpenDoctor={onOpenDoctorForPlant}
        onOpenAdvice={onOpenAdviceForPlant}
      />
    );

  return (
    <div className="space-y-4">
      {/* Cloud Sync Status Header Bar */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs">
          <Cloud className={`h-4 w-4 ${currentUser ? "text-primary" : "text-muted-foreground"}`} />
          {currentUser ? (
            <span className="text-foreground">
              Cloud Sync:{" "}
              <strong className="text-primary font-medium">
                {currentUser.displayName || currentUser.email}
              </strong>
            </span>
          ) : (
            <span className="text-muted-foreground">Local storage only (single device)</span>
          )}
        </div>
        <button
          onClick={onOpenAccount}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {currentUser ? "Manage" : "Sign In to Sync"}
        </button>
      </div>

      {/* External Log Multi-Plant Attachment Banner */}
      {externalLog && active.length > 0 && (
        <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Attach incoming note to diary:</span>
            </span>
            <button
              onClick={onClearExternalLog}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Dismiss
            </button>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 bg-secondary/50 p-2.5 rounded-xl border border-border/50">
            {externalLog.note}
          </p>

          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground font-medium">Select target plants:</p>
            <div className="flex flex-wrap gap-2">
              {active.map((p) => {
                const isSelected = selectedExternalPlantIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedExternalPlantIds((prev) =>
                        prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id],
                      );
                    }}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium border transition flex items-center gap-1.5 ${
                      isSelected
                        ? "border-primary bg-primary/20 text-primary font-semibold ring-1 ring-primary"
                        : "border-border bg-secondary/50 text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    <span>{isSelected ? "✓" : "+"}</span>
                    <span>{p.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => attachExternalLogToPlants(selectedExternalPlantIds)}
                disabled={selectedExternalPlantIds.length === 0}
                className="rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
              >
                Save to Selected ({selectedExternalPlantIds.length})
              </button>
              {active.length > 1 && (
                <button
                  onClick={() => attachExternalLogToPlants(active.map((p) => p.id))}
                  className="rounded-xl border border-border bg-secondary px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-secondary/80 transition"
                >
                  Save to All {active.length} Active Plants
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Active", active.length],
          ["Harvested", plants.length - active.length],
          ["Logs", plants.reduce((n, p) => n + (Array.isArray(p.logs) ? p.logs.length : 0), 0)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl border bg-card p-3 text-center">
            <div className="font-display text-2xl">{v}</div>
            <div className="text-xs text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-2xl">My grows</h2>
        <button className={btn} onClick={() => setAdding(!adding)}>
          {adding ? "Cancel" : "+ New plant"}
        </button>
      </div>

      {adding && <NewPlant onSave={handleSaveNew} />}

      {plants.length === 0 && !adding && (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Start your first grow journal.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        {plants.map((p) => (
          <button
            key={p.id}
            onClick={() => setOpenId(p.id)}
            className="overflow-hidden rounded-2xl border bg-card text-left"
          >
            <div className="flex aspect-square items-center justify-center bg-secondary text-4xl">
              {p.cover || p.logs?.find((l) => l.photo)?.photo ? (
                <img
                  src={p.cover || p.logs?.find((l) => l.photo)?.photo}
                  alt={p.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                "🌱"
              )}
            </div>
            <div className="p-3">
              <div className="truncate font-display text-lg">{p.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {p.strain || "Unknown strain"}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">
                  {p.stage}
                </span>
                <span className="text-muted-foreground">D{days(p.started) + 1}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function NewPlant({ onSave }: { onSave: (p: Plant) => void }) {
  const [f, setF] = useState({
    name: "",
    strain: "",
    type: "Photoperiod" as Plant["type"],
    medium: "Soil",
    setting: "Outdoor" as Plant["setting"],
    started: today(),
    cover: "",
  });
  return (
    <form
      className="space-y-3 rounded-2xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.name.trim()) return;
        onSave({
          id: uid(),
          ...f,
          name: f.name.trim(),
          cover: f.cover.trim() ? f.cover : undefined,
          stage: "Germination",
          stageStarted: f.started || today(),
          logs: [],
        });
      }}
    >
      <input
        className={input}
        placeholder="Plant name"
        value={f.name}
        onChange={(e) => setF({ ...f, name: e.target.value })}
      />
      <input
        className={input}
        placeholder="Strain (e.g. Northern Lights)"
        value={f.strain}
        onChange={(e) => setF({ ...f, strain: e.target.value })}
      />
      <div className="flex flex-wrap gap-2">
        {(["Photoperiod", "Autoflower"] as const).map((t) => (
          <button
            type="button"
            key={t}
            className={chip(f.type === t)}
            onClick={() => setF({ ...f, type: t })}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {(["Indoor", "Outdoor", "Greenhouse"] as const).map((t) => (
          <button
            type="button"
            key={t}
            className={chip(f.setting === t)}
            onClick={() => setF({ ...f, setting: t })}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          "Soil",
          "Living soil",
          "Living soil (In the ground)",
          "In the ground",
          "Coco",
          "Hydro",
        ].map((t) => (
          <button
            type="button"
            key={t}
            className={chip(f.medium === t)}
            onClick={() => setF({ ...f, medium: t })}
          >
            {t}
          </button>
        ))}
      </div>
      <label className="block text-xs text-muted-foreground">
        Start date
        <input
          className={`${input} mt-1`}
          type="date"
          value={f.started}
          onChange={(e) => setF({ ...f, started: e.target.value })}
        />
      </label>
      <div className="space-y-1.5 rounded-xl border border-dashed border-border p-3 bg-secondary/20">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground">Cover Photo (Optional)</label>
          {f.cover && (
            <span className="text-[10px] font-mono text-primary font-medium">
              {formatDataUrlSize(f.cover)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <PhotoPick
            label={f.cover ? "Change" : "+ Cover photo"}
            currentPhoto={f.cover}
            onClear={() => setF((prev) => ({ ...prev, cover: "" }))}
            onPick={(cover) => setF((prev) => ({ ...prev, cover }))}
          />
          {f.cover && (
            <img
              src={f.cover}
              alt="Cover preview"
              className="h-12 w-12 rounded-lg object-cover border border-primary shrink-0 shadow-xs"
            />
          )}
        </div>
      </div>
      <button className={`${btn} w-full`}>Create journal</button>
    </form>
  );
}

function PlantView({
  plant: p,
  fertilizers = [],
  back,
  onChange,
  onSetCover,
  onDelete,
  onOpenDoctor,
  onOpenAdvice,
}: {
  plant: Plant;
  allPlants?: Plant[];
  fertilizers?: HomemadeFertilizer[];
  back: () => void;
  onChange: (fn: (p: Plant) => Plant) => Promise<void> | void;
  onSetCover?: (cover?: string) => Promise<void> | void;
  onDelete: () => void;
  onOpenDoctor?: (plantId: string) => void;
  onOpenAdvice?: (
    plantId: string,
    initialTool?: "advice" | "visualizer" | "trichome" | "defoliation" | "lst",
  ) => void;
}) {
  const [logType, setLogType] = useState<LogType | null>(null);
  const [view, setView] = useState<"timeline" | "gallery">("timeline");
  const [lightboxPhoto, setLightboxPhoto] = useState<{
    url: string;
    title: string;
    date?: string;
    note?: string;
    isCover?: boolean;
    logId?: string;
  } | null>(null);
  const [coverStatus, setCoverStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [journalStatus, setJournalStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [localCover, setLocalCover] = useState<string | undefined>(p.cover);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setLocalCover(p.cover);
  }, [p.cover, p.id]);

  const handleUpdateCover = async (newCover?: string) => {
    const previousCover = localCover;
    let targetCover = newCover;
    if (targetCover && targetCover.length > 45000) {
      try {
        targetCover = await compressImage(targetCover, {
          maxDimension: 512,
          quality: 0.6,
          maxBase64Length: 65000,
        });
      } catch {
        // Fallback to original
      }
    }
    setLocalCover(targetCover);
    setCoverStatus("saving");
    try {
      if (onSetCover) {
        await onSetCover(targetCover);
      } else {
        await onChange((x) => ({ ...x, cover: targetCover }));
      }
      setCoverStatus("saved");
      setTimeout(() => setCoverStatus("idle"), 2500);
    } catch (err) {
      console.error("Failed to update cover photo:", err);
      setLocalCover(previousCover);
      setCoverStatus("error");
      setTimeout(() => setCoverStatus("idle"), 3500);
    }
  };

  const handleSaveLogEntry = async (l: Log) => {
    setJournalStatus("saving");
    try {
      let cleanPhoto = l.photo;
      if (cleanPhoto && cleanPhoto.length > 45000) {
        try {
          const compressed = await compressImage(cleanPhoto, {
            maxDimension: 512,
            quality: 0.6,
            maxBase64Length: 65000,
          });
          if (compressed) cleanPhoto = compressed;
        } catch {
          // keep original
        }
      }

      const entryToSave: Log = {
        ...l,
        id: l.id || uid(),
        date: l.date || today(),
        photo: cleanPhoto,
      };

      if (cleanPhoto && !localCover) {
        setLocalCover(cleanPhoto);
      }

      await onChange((x) => {
        const currentLogs = Array.isArray(x.logs) ? x.logs : [];
        if (currentLogs.some((existing) => existing.id === entryToSave.id)) {
          return x;
        }
        const updatedLogs = [entryToSave, ...currentLogs];
        updatedLogs.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        return {
          ...x,
          cover: x.cover || cleanPhoto || undefined,
          logs: updatedLogs,
        };
      });

      setJournalStatus("saved");
      setTimeout(() => setJournalStatus("idle"), 3000);
    } catch (err) {
      console.error("Failed to save journal entry:", err);
      setJournalStatus("error");
      setTimeout(() => setJournalStatus("idle"), 3500);
    }
  };

  const stageIdx = STAGES.indexOf(p.stage);
  const plantLogs = p.logs || [];
  const lastWater = plantLogs.find((l) => l.type === "water" || l.type === "feed");
  const photos = plantLogs.filter((l) => l.photo);
  const latestHeight = plantLogs.find((l) => l.height)?.height;

  // Group all journal entries from the same day into a single unified day group
  const groupedLogsByDay = (() => {
    const map = new Map<string, Log[]>();
    for (const entry of plantLogs) {
      const dateKey = entry.date || today();
      const existing = map.get(dateKey);
      if (existing) {
        existing.push(entry);
      } else {
        map.set(dateKey, [entry]);
      }
    }
    return Array.from(map.entries())
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .map(([date, entries]) => {
        const dayNum = Math.max(
          1,
          Math.floor(
            ((date ? new Date(date).getTime() : Date.now()) -
              (p.started ? new Date(p.started).getTime() : Date.now())) /
              86400000,
          ) + 1,
        );
        return { date, dayNum, entries };
      });
  })();

  return (
    <div className="space-y-4">
      <button onClick={back} className="text-sm text-primary">
        ← All plants
      </button>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="relative flex aspect-video items-center justify-center bg-secondary text-6xl">
          {localCover ? (
            <img
              src={localCover}
              alt={p.name}
              className="h-full w-full object-cover cursor-pointer hover:opacity-95 transition"
              onClick={() =>
                setLightboxPhoto({
                  url: localCover!,
                  title: `${p.name} — Front Cover Photo`,
                  isCover: true,
                })
              }
            />
          ) : (
            "🌱"
          )}

          {/* Cover save status badge */}
          {coverStatus === "saving" && (
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-xl bg-black/80 backdrop-blur-xs px-3 py-1.5 text-xs font-semibold text-white shadow">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Saving front cover...</span>
            </div>
          )}
          {coverStatus === "saved" && (
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-xl bg-emerald-600/95 backdrop-blur-xs px-3 py-1.5 text-xs font-semibold text-white shadow animate-in fade-in">
              <Check className="h-3.5 w-3.5 stroke-[3]" />
              <span>Front cover saved!</span>
            </div>
          )}
          {coverStatus === "error" && (
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-xl bg-destructive/95 backdrop-blur-xs px-3 py-1.5 text-xs font-semibold text-white shadow animate-in fade-in">
              <X className="h-3.5 w-3.5 stroke-[3]" />
              <span>Failed to save front cover</span>
            </div>
          )}

          <div className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-xl bg-black/60 backdrop-blur-xs p-1.5 shadow">
            <PhotoPick
              label={localCover ? "Change cover" : "+ Add cover"}
              onPick={(cover) => handleUpdateCover(cover)}
            />
            {localCover && (
              <button
                type="button"
                onClick={() => handleUpdateCover(undefined)}
                className="rounded-lg bg-red-500/20 px-2.5 py-2 text-xs font-medium text-red-200 hover:bg-red-500/40 transition active:scale-95 inline-flex items-center gap-1"
                title="Remove cover photo"
              >
                <X className="h-3 w-3" />
                <span>Remove</span>
              </button>
            )}
          </div>
        </div>
        <div className="p-4">
          <h2 className="text-3xl">{p.name}</h2>
          <p className="text-sm text-muted-foreground">
            {p.strain || "Unknown strain"} · {p.type} · {p.setting} · {p.medium}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat v={`Day ${days(p.started) + 1}`} l="Total" />
            <Stat v={weekDay(p.stageStarted).split(" · ")[0]!} l={p.stage} />
            <Stat v={latestHeight ? `${latestHeight}cm` : "—"} l="Height" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {lastWater
              ? `Last watered ${days(lastWater.date) === 0 ? "today" : `${days(lastWater.date)} day(s) ago`}`
              : "No watering logged yet"}
          </p>
        </div>
      </div>

      <section className="rounded-2xl border bg-card p-4">
        <h3 className="mb-3 text-lg">Growth stage</h3>
        <div className="flex gap-1">
          {STAGES.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${i <= stageIdx ? "bg-primary" : "bg-secondary"}`}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <button
              key={s}
              className={chip(p.stage === s)}
              onClick={() => onChange((x) => ({ ...x, stage: s, stageStarted: today() }))}
            >
              {s}
            </button>
          ))}
        </div>
        {p.stage === "Harvested" && (
          <input
            className={`${input} mt-3`}
            placeholder="Dry yield (grams)"
            value={p.yieldG ?? ""}
            onChange={(e) => onChange((x) => ({ ...x, yieldG: e.target.value }))}
          />
        )}

        <div className="mt-4 pt-3 border-t border-border/60 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Growing Medium &amp; Location (Synced to AI Doctor &amp; Coach)
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["Outdoor", "Indoor", "Greenhouse"] as const).map((settingOpt) => (
              <button
                type="button"
                key={settingOpt}
                className={chip(p.setting === settingOpt)}
                onClick={() => onChange((x) => ({ ...x, setting: settingOpt }))}
              >
                {settingOpt}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              "Soil",
              "Living soil",
              "Living soil (In the ground)",
              "In the ground",
              "Coco",
              "Hydro",
            ].map((medOpt) => (
              <button
                type="button"
                key={medOpt}
                className={chip(p.medium.toLowerCase() === medOpt.toLowerCase())}
                onClick={() => onChange((x) => ({ ...x, medium: medOpt }))}
              >
                {medOpt}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Direct AI Tools: Health Doctor & Grow Advice for this plant */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {onOpenDoctor && (
          <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">AI Health Doctor</p>
                <p className="text-xs text-muted-foreground">
                  Check foliage for pests, burns, or deficiencies
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenDoctor(p.id)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-sm active:scale-95"
            >
              <span>Scan Health</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {onOpenAdvice && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow">
                <Compass className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">AI Grow Coach & Advice</p>
                <p className="text-xs text-muted-foreground">
                  Topping, LST training, feed & water timing
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenAdvice(p.id, "advice")}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-sm active:scale-95"
            >
              <span>Get Grow Advice</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {onOpenAdvice && (
          <div className="rounded-2xl border border-teal-500/40 bg-teal-500/10 p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow">
                <Scissors className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Defoliation & Schwazzing</p>
                <p className="text-xs text-muted-foreground">
                  Canopy density, lower popcorn lollipopping & airflow
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenAdvice(p.id, "defoliation")}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition shadow-sm active:scale-95"
            >
              <span>Analyze Canopy</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {onOpenAdvice && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white shadow">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">LST Before & After Slider</p>
                <p className="text-xs text-muted-foreground">
                  Inspect branch leveling & canopy spread interactively
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenAdvice(p.id, "lst")}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition shadow-sm active:scale-95"
            >
              <span>Compare Training</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {onOpenAdvice && (
          <div className="rounded-2xl border border-amber-600/40 bg-amber-600/10 p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-700 text-white shadow">
                <Microscope className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Trichome Harvest Scanner</p>
                <p className="text-xs text-muted-foreground">
                  Gland head ratios (clear/cloudy/amber) & chop countdown
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenAdvice(p.id, "trichome")}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800 transition shadow-sm active:scale-95"
            >
              <span>Scan Trichomes</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {onOpenAdvice && (
          <div className="rounded-2xl border border-primary/45 bg-primary/10 p-4 flex flex-col justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">AI Growth Stage Visualizer</p>
                <p className="text-xs text-muted-foreground">
                  Seedling, Veg &amp; Flower photos + daily growth collage
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenAdvice(p.id, "visualizer")}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition shadow-sm active:scale-95"
            >
              <span>Preview Stages &amp; Collage</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <section>
        <h3 className="mb-2 text-lg">Add to journal</h3>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(LOGS) as LogType[]).map((t) => (
            <button
              key={t}
              onClick={() => setLogType(logType === t ? null : t)}
              className={`rounded-2xl border p-3 text-center ${logType === t ? "border-primary bg-primary/15" : "bg-card"}`}
            >
              <div className="text-2xl">{LOGS[t].icon}</div>
              <div className="text-xs">{LOGS[t].label}</div>
            </button>
          ))}
        </div>
        {logType && (
          <LogForm
            key={logType}
            type={logType}
            fertilizers={fertilizers}
            onSave={(l) => {
              setLogType(null);
              void handleSaveLogEntry(l);
            }}
          />
        )}
      </section>

      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button className={chip(view === "timeline")} onClick={() => setView("timeline")}>
              Timeline ({plantLogs.length})
            </button>
            <button className={chip(view === "gallery")} onClick={() => setView("gallery")}>
              Gallery ({photos.length})
            </button>
          </div>

          {/* 1-Tap Direct Photo Add to Journal */}
          <PhotoPick
            label="+ Quick Photo"
            onPick={(photo) => {
              void handleSaveLogEntry({
                id: uid(),
                date: today(),
                type: "photo",
                photo,
                note: `${p.name} journal snapshot`,
              });
            }}
          />
        </div>

        {journalStatus === "saving" && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span>Saving to {p.name} journal...</span>
          </div>
        )}
        {journalStatus === "saved" && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-300 animate-in fade-in">
            <Check className="h-3.5 w-3.5 stroke-[3] shrink-0" />
            <span>Saved to {p.name} journal!</span>
          </div>
        )}
        {journalStatus === "error" && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/15 px-3 py-2 text-xs font-semibold text-destructive animate-in fade-in">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Saved locally — cloud sync will retry automatically.</span>
          </div>
        )}
        {view === "gallery" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {localCover && (
                <div
                  className="relative group aspect-square rounded-xl overflow-hidden border-2 border-primary cursor-pointer shadow-xs bg-secondary"
                  onClick={() =>
                    setLightboxPhoto({
                      url: localCover!,
                      title: `${p.name} — Cover Photo`,
                      isCover: true,
                    })
                  }
                >
                  <img
                    src={localCover}
                    alt="Cover"
                    className="h-full w-full object-cover group-hover:scale-105 transition duration-200"
                  />
                  <span className="absolute bottom-1 left-1 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    ⭐ Cover
                  </span>
                </div>
              )}
              {photos.map((l) => (
                <div
                  key={l.id}
                  className="relative group aspect-square rounded-xl overflow-hidden border border-border cursor-pointer bg-secondary shadow-xs hover:border-primary transition"
                  onClick={() =>
                    setLightboxPhoto({
                      url: l.photo!,
                      title: `${LOGS[l.type].label} Entry`,
                      date: l.date,
                      note: l.note,
                      logId: l.id,
                    })
                  }
                >
                  <img
                    src={l.photo}
                    alt={l.note || "Journal photo"}
                    className="h-full w-full object-cover group-hover:scale-105 transition duration-200"
                  />
                  <span className="absolute bottom-1 right-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[9px] font-mono text-white">
                    {l.date ? l.date.slice(5) : ""}
                  </span>
                </div>
              ))}
            </div>

            {!photos.length && !localCover && (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                <ImageIcon className="mx-auto h-8 w-8 mb-2 opacity-40 text-primary" />
                <p className="font-medium text-foreground">No photos in this journal yet</p>
                <p className="mt-1">
                  Add a photo to any journal entry above or snap with your camera.
                </p>
              </div>
            )}
          </div>
        ) : (
          <ol className="relative space-y-3 border-l border-border/70 pl-4">
            {groupedLogsByDay.map((dayGroup) => {
              const uniqueIcons = Array.from(
                new Set(dayGroup.entries.map((e) => LOGS[e.type].icon)),
              );
              const formattedDate = dayGroup.date
                ? new Date(dayGroup.date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Today";

              return (
                <li
                  key={dayGroup.date}
                  data-testid={`journal-day-group-${dayGroup.date}`}
                  className="relative"
                >
                  <span className="absolute -left-[1.6rem] top-2.5 flex h-6 w-6 items-center justify-center rounded-full border border-primary/40 bg-card text-[10px] font-bold text-primary shadow-2xs">
                    D{dayGroup.dayNum}
                  </span>

                  <div className="rounded-xl bg-card border border-border/60 shadow-xs overflow-hidden">
                    {/* Unified Daily Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-secondary/40 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">{formattedDate}</span>
                        <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          Day {dayGroup.dayNum}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          {uniqueIcons.map((ic, idx) => (
                            <span key={`${ic}-${idx}`}>{ic}</span>
                          ))}
                        </span>
                        <span className="font-medium">
                          {dayGroup.entries.length}{" "}
                          {dayGroup.entries.length === 1 ? "action" : "actions"}
                        </span>
                      </div>
                    </div>

                    {/* Grouped Entries for this Day */}
                    <div className="divide-y divide-border/40">
                      {dayGroup.entries.map((l) => (
                        <div
                          key={l.id}
                          className="p-2.5 text-sm hover:bg-secondary/15 transition flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 font-semibold text-xs text-foreground">
                                <span>{LOGS[l.type].icon}</span>
                                <span>{LOGS[l.type].label}</span>
                              </span>
                              <Details l={l} />
                            </div>

                            {l.note && (
                              <p className="text-xs text-foreground/90 leading-relaxed">{l.note}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {l.photo && (
                              <div
                                className="relative group h-12 w-12 cursor-pointer rounded-lg overflow-hidden border border-border shadow-2xs shrink-0"
                                onClick={() =>
                                  setLightboxPhoto({
                                    url: l.photo!,
                                    title: `${LOGS[l.type].label} Entry`,
                                    date: l.date,
                                    note: l.note,
                                    logId: l.id,
                                  })
                                }
                                title="Click to enlarge photo"
                              >
                                <img
                                  src={l.photo}
                                  alt="Log attachment"
                                  className="h-full w-full object-cover group-hover:scale-105 transition"
                                />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                                  <ZoomIn className="h-3.5 w-3.5 text-white" />
                                </div>
                              </div>
                            )}

                            <button
                              type="button"
                              aria-label="Delete entry"
                              title="Delete entry"
                              className="rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition"
                              onClick={() =>
                                onChange((x) => ({
                                  ...x,
                                  logs: (x.logs || []).filter((y) => y.id !== l.id),
                                }))
                              }
                            >
                              Delete entry
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
            {!plantLogs.length && (
              <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
            )}
          </ol>
        )}
      </section>

      {confirmDelete ? (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
          <span className="text-xs font-medium text-foreground">
            Delete <strong>{p.name}</strong> and all its journal entries?
          </span>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg bg-destructive px-3 py-1 text-xs font-semibold text-white hover:bg-destructive/90 transition"
          >
            Yes, delete
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="rounded-lg bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="text-xs text-destructive hover:underline"
        >
          Delete plant
        </button>
      )}

      {/* Interactive Photo Lightbox Modal */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="relative max-w-2xl w-full rounded-2xl bg-card border border-border overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3.5 border-b border-border bg-secondary/40">
              <div>
                <h4 className="text-sm font-semibold text-foreground">{lightboxPhoto.title}</h4>
                {lightboxPhoto.date && (
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(lightboxPhoto.date).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-black/95 flex items-center justify-center p-3 min-h-[280px]">
              <img
                src={lightboxPhoto.url}
                alt="Enlarged"
                className="max-h-[60vh] w-auto max-w-full object-contain rounded-lg"
              />
            </div>

            <div className="p-3.5 border-t border-border bg-card flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground max-w-md">
                {lightboxPhoto.note || "No note attached"}
              </div>
              {!lightboxPhoto.isCover && (
                <button
                  type="button"
                  onClick={async () => {
                    await handleUpdateCover(lightboxPhoto.url);
                    setLightboxPhoto(null);
                  }}
                  className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition active:scale-95 shadow-sm inline-flex items-center gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Set as Front Cover</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const Stat = ({ v, l }: { v: string; l: string }) => (
  <div className="rounded-xl bg-secondary p-2">
    <div className="font-semibold">{v}</div>
    <div className="text-xs text-muted-foreground">{l}</div>
  </div>
);

function Details({ l }: { l: Log }) {
  const parts = [
    l.amount && `${l.amount} L`,
    l.ph && `pH ${l.ph}`,
    l.ec && `EC ${l.ec}`,
    l.nutrients,
    l.fertilizerForm && `${l.fertilizerForm}${l.dilutionRatio ? ` (${l.dilutionRatio})` : ""}`,
    l.technique,
    l.temp && `${l.temp}°C`,
    l.humidity && `${l.humidity}% RH`,
    l.height && `${l.height} cm`,
  ].filter(Boolean);
  return parts.length ? (
    <div className="flex flex-wrap gap-1">
      {parts.map((x, idx) => (
        <span
          key={`${x as string}-${idx}`}
          className="rounded-full bg-secondary px-2 py-0.5 text-xs"
        >
          {x}
        </span>
      ))}
    </div>
  ) : null;
}

function LogForm({
  type,
  fertilizers = [],
  onSave,
}: {
  type: LogType;
  fertilizers?: HomemadeFertilizer[];
  onSave: (l: Log) => void;
}) {
  const [l, setL] = useState<Log>({ id: uid(), date: today(), type });
  const [selectedFertilizerId, setSelectedFertilizerId] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);

  const savedRef = useRef(false);
  const latestLogRef = useRef<Log>(l);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    latestLogRef.current = l;
  }, [l]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // If the user picked a photo in LogForm and then navigates away or closes the form
  // without clicking the bottom Save button, auto-save the pending photo log so it is never lost.
  useEffect(() => {
    return () => {
      if (!savedRef.current && latestLogRef.current.photo) {
        savedRef.current = true;
        onSaveRef.current({
          ...latestLogRef.current,
          id: latestLogRef.current.id || uid(),
          date: latestLogRef.current.date || today(),
          type,
        });
      }
    };
  }, [type]);

  const set = (k: keyof Log) => (e: { target: { value: string } }) =>
    setL((prev) => ({ ...prev, [k]: e.target.value }));

  const handleSelectSavedFertilizer = (f: HomemadeFertilizer) => {
    setSelectedFertilizerId(f.id);
    setL((prev) => ({
      ...prev,
      nutrients: `${f.name} (${f.fertilizerType})`,
      fertilizerForm: f.form,
      dilutionRatio:
        f.dilutionRatio ||
        (f.form === "Diluted" ? "1:10 (100ml/L)" : "Straight drench (undiluted)"),
    }));
  };

  const selectedFertilizer = fertilizers.find((f) => f.id === selectedFertilizerId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isCompressingPhoto) return;
    if (type === "photo" && !l.photo && (!l.note || !l.note.trim())) {
      setValidationError("Please take or choose a photo (or write a quick observation note).");
      return;
    }
    setValidationError(null);
    savedRef.current = true;
    onSave({
      ...l,
      id: l.id || uid(),
      date: l.date || today(),
      type,
    });
  };

  return (
    <form
      className="mt-3 space-y-3 rounded-2xl border bg-card p-4 shadow-sm"
      onSubmit={handleSubmit}
    >
      <div className="flex items-center justify-between border-b pb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <span>{LOGS[type].icon}</span>
          <span>Log {LOGS[type].label}</span>
        </span>
        <input
          className="rounded-lg border bg-secondary px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
          type="date"
          value={l.date}
          onChange={set("date")}
        />
      </div>

      {(type === "water" || type === "feed") && (
        <div className="grid grid-cols-3 gap-2">
          <input
            className={input}
            inputMode="decimal"
            placeholder="Litres"
            value={l.amount ?? ""}
            onChange={set("amount")}
          />
          <input
            className={input}
            inputMode="decimal"
            placeholder="pH"
            value={l.ph ?? ""}
            onChange={set("ph")}
          />
          <input
            className={input}
            inputMode="decimal"
            placeholder="EC"
            value={l.ec ?? ""}
            onChange={set("ec")}
          />
        </div>
      )}

      {type === "feed" && (
        <div className="space-y-2.5">
          {/* Dropdown Menu to choose from the user's Fertilizer Journal */}
          <div className="space-y-1.5">
            <label
              htmlFor="journal-fertilizer-select"
              className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between"
            >
              <span>Choose from Fertilizer Journal</span>
              <span className="text-[10px] font-normal lowercase">
                {fertilizers.length} {fertilizers.length === 1 ? "fertilizer" : "fertilizers"} saved
              </span>
            </label>
            <select
              id="journal-fertilizer-select"
              aria-label="Choose from Fertilizer Journal"
              value={selectedFertilizerId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedFertilizerId(val);
                if (!val) {
                  return;
                }
                const found = fertilizers.find((f) => f.id === val);
                if (found) {
                  handleSelectSavedFertilizer(found);
                }
              }}
              className={`${input} cursor-pointer`}
            >
              <option value="" className="bg-card text-foreground">
                {fertilizers.length > 0
                  ? `-- Select a fertilizer from your Fertilizer Journal (${fertilizers.length}) --`
                  : "-- No fertilizers in Fertilizer Journal yet (type custom below) --"}
              </option>
              {fertilizers.map((f) => (
                <option key={f.id} value={f.id} className="bg-card text-foreground">
                  {f.name} — {f.form}
                  {f.dilutionRatio ? ` (${f.dilutionRatio})` : ""} · {f.fertilizerType}
                </option>
              ))}
            </select>

            {selectedFertilizer && (
              <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-foreground">{selectedFertilizer.name}</span>{" "}
                  <span className="text-muted-foreground">
                    ({selectedFertilizer.fertilizerType})
                  </span>
                  {selectedFertilizer.ingredients && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Ingredients: {selectedFertilizer.ingredients}
                    </p>
                  )}
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    selectedFertilizer.form === "Raw"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      : "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                  }`}
                >
                  {selectedFertilizer.form}
                  {selectedFertilizer.dilutionRatio ? ` · ${selectedFertilizer.dilutionRatio}` : ""}
                </span>
              </div>
            )}
          </div>

          <input
            className={input}
            placeholder="Nutrients / fertilizer name (or edit selected above)"
            value={l.nutrients ?? ""}
            onChange={(e) => {
              const nextVal = e.target.value;
              setL((prev) => ({ ...prev, nutrients: nextVal }));
              if (
                selectedFertilizer &&
                nextVal !== `${selectedFertilizer.name} (${selectedFertilizer.fertilizerType})`
              ) {
                setSelectedFertilizerId("");
              }
            }}
          />

          <div className="rounded-xl border border-border bg-secondary/30 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                Fertilizer Form (Raw vs. Diluted)
              </span>
              {l.fertilizerForm && (
                <button
                  type="button"
                  onClick={() =>
                    setL((prev) => ({
                      ...prev,
                      fertilizerForm: undefined,
                      dilutionRatio: undefined,
                    }))
                  }
                  className="text-[10px] text-muted-foreground hover:text-foreground underline"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["Raw", "Diluted"] as FertilizerForm[]).map((option) => {
                const activeForm = l.fertilizerForm === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() =>
                      setL((prev) => ({
                        ...prev,
                        fertilizerForm: option,
                      }))
                    }
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                      activeForm
                        ? option === "Raw"
                          ? "border-amber-500 bg-amber-500/20 text-amber-300"
                          : "border-sky-500 bg-sky-500/20 text-sky-300"
                        : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {option === "Raw" ? "Raw (Undiluted / Straight)" : "Diluted (Mixed w/ Water)"}
                  </button>
                );
              })}
            </div>

            {l.fertilizerForm && (
              <div className="space-y-1.5 pt-1">
                <input
                  className={input}
                  placeholder={
                    l.fertilizerForm === "Diluted"
                      ? "Dilution ratio (e.g. 1:500 or 2 ml/L)"
                      : "Raw dose (e.g. Undiluted top-dress, 2 tbsp/pot)"
                  }
                  value={l.dilutionRatio ?? ""}
                  onChange={set("dilutionRatio")}
                />
                <div className="flex flex-wrap gap-1">
                  {(l.fertilizerForm === "Diluted"
                    ? DILUTION_RATIO_PRESETS
                    : RAW_DOSAGE_PRESETS
                  ).map((preset) => (
                    <button
                      type="button"
                      key={preset}
                      onClick={() => setL((prev) => ({ ...prev, dilutionRatio: preset }))}
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition ${
                        l.dilutionRatio === preset
                          ? "border-primary bg-primary/20 text-primary"
                          : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {type === "training" && (
        <div className="flex flex-wrap gap-2">
          {TECHNIQUES.map((t) => (
            <button
              type="button"
              key={t}
              className={chip(l.technique === t)}
              onClick={() => setL((prev) => ({ ...prev, technique: t }))}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {type === "environment" && (
        <div className="grid grid-cols-3 gap-2">
          <input
            className={input}
            inputMode="decimal"
            placeholder="Temp °C"
            value={l.temp ?? ""}
            onChange={set("temp")}
          />
          <input
            className={input}
            inputMode="decimal"
            placeholder="RH %"
            value={l.humidity ?? ""}
            onChange={set("humidity")}
          />
          <input
            className={input}
            inputMode="decimal"
            placeholder="Height cm"
            value={l.height ?? ""}
            onChange={set("height")}
          />
        </div>
      )}

      {/* Photo Attachment (Prominent for 'photo' type, optional for all entries) */}
      <div
        className={`rounded-xl border border-dashed p-3 space-y-2 transition ${
          type === "photo" ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/30"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5 text-primary" />
            <span>{type === "photo" ? "Plant Photo (Required)" : "Attach Photo (Optional)"}</span>
          </span>
          {l.photo && (
            <span className="text-[10px] font-mono text-primary font-medium">
              {formatDataUrlSize(l.photo)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <PhotoPick
            label={l.photo ? "Change photo" : type === "photo" ? "Choose photo" : "Add photo"}
            currentPhoto={l.photo}
            onCompressingChange={setIsCompressingPhoto}
            onClear={() => setL((prev) => ({ ...prev, photo: undefined }))}
            onPick={(photo) => {
              setL((prev) => ({ ...prev, photo }));
              setValidationError(null);
            }}
          />
          {l.photo && (
            <div className="relative group shrink-0 flex items-center gap-2">
              <img
                src={l.photo}
                alt="Log snapshot"
                className="h-14 w-14 rounded-xl object-cover border-2 border-primary shadow-xs"
              />
              <span className="text-[11px] font-semibold text-primary">✓ Ready to save</span>
            </div>
          )}
        </div>
      </div>

      <textarea
        className={input}
        rows={2}
        placeholder={
          type === "photo"
            ? "Visual observations, leaf vigor, trichome stage..."
            : "Notes & observations (optional)..."
        }
        value={l.note ?? ""}
        onChange={set("note")}
      />

      {validationError && <p className="text-xs text-destructive font-medium">{validationError}</p>}

      <button
        type="submit"
        disabled={isCompressingPhoto}
        className={`${btn} w-full shadow-sm disabled:opacity-50`}
      >
        {isCompressingPhoto ? "Optimizing photo..." : `Save ${LOGS[type].label.toLowerCase()}`}
      </button>
    </form>
  );
}
