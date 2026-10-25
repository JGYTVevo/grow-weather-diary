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
} from "lucide-react";
import { usePlants } from "@/hooks/use-plants";
import { GrowthMetricsChart } from "@/components/GrowthMetricsChart";

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

function compress(file: File): Promise<string> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 720 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * s;
      c.height = img.height * s;
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.7));
    };
    img.src = URL.createObjectURL(file);
  });
}

function PhotoPick({ onPick, label }: { onPick: (d: string) => void; label: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      <label className="rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer inline-flex items-center gap-1.5 active:scale-95 transition">
        <span>{label}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,.jpg,.jpeg,.png,.webp,.heic,application/octet-stream"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) onPick(await compress(f));
            e.target.value = "";
          }}
        />
      </label>
      <label
        title="Take photo with camera"
        className="rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-2 text-xs font-medium text-primary hover:bg-primary/20 cursor-pointer inline-flex items-center gap-1 active:scale-95 transition"
      >
        <span>📷 Camera</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) onPick(await compress(f));
            e.target.value = "";
          }}
        />
      </label>
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
  onOpenDoctorForPlant?: (plantId: string) => void;
  onOpenAdviceForPlant?: (
    plantId: string,
    initialTool?: "advice" | "trichome" | "defoliation" | "lst",
  ) => void;
  openedPlantId?: string | null;
  onClosePlant?: () => void;
}

export function PlantsPanel({
  currentUser,
  onOpenAccount,
  externalLog,
  onClearExternalLog,
  plantsState: externalPlantsState,
  onOpenDoctorForPlant,
  onOpenAdviceForPlant,
  openedPlantId = null,
  onClosePlant,
}: PlantsPanelProps = {}) {
  const internalPlantsState = usePlants(currentUser);
  const { plants, updatePlant, createPlant, deletePlant, addLogToPlants } =
    externalPlantsState || internalPlantsState;

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
  }, [externalLog, active]);

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
        back={() => {
          setOpenId(null);
          onClosePlant?.();
        }}
        onChange={(fn) => updatePlant(open.id, fn)}
        onDelete={() => {
          if (confirm(`Delete ${open.name}?`)) {
            handleDelete(open.id);
          }
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

      {/* 30-Day Growth Rate & Health Metrics Recharts Line Graph */}
      <GrowthMetricsChart plants={plants} />

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
              {p.cover ? (
                <img src={p.cover} alt={p.name} className="h-full w-full object-cover" />
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
        {["Soil", "Coco", "Hydro", "Living soil"].map((t) => (
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
      <div className="flex items-center gap-3">
        <PhotoPick
          label={f.cover ? "Change photo" : "+ Cover photo"}
          onPick={(cover) => setF({ ...f, cover })}
        />
        {f.cover && <img src={f.cover} alt="" className="h-12 w-12 rounded-lg object-cover" />}
      </div>
      <button className={`${btn} w-full`}>Create journal</button>
    </form>
  );
}

function PlantView({
  plant: p,
  allPlants = [],
  back,
  onChange,
  onDelete,
  onOpenDoctor,
  onOpenAdvice,
}: {
  plant: Plant;
  allPlants?: Plant[];
  back: () => void;
  onChange: (fn: (p: Plant) => Plant) => void;
  onDelete: () => void;
  onOpenDoctor?: (plantId: string) => void;
  onOpenAdvice?: (
    plantId: string,
    initialTool?: "advice" | "trichome" | "defoliation" | "lst",
  ) => void;
}) {
  const [logType, setLogType] = useState<LogType | null>(null);
  const [view, setView] = useState<"timeline" | "gallery">("timeline");
  const stageIdx = STAGES.indexOf(p.stage);
  const plantLogs = p.logs || [];
  const lastWater = plantLogs.find((l) => l.type === "water" || l.type === "feed");
  const photos = plantLogs.filter((l) => l.photo);
  const latestHeight = plantLogs.find((l) => l.height)?.height;

  return (
    <div className="space-y-4">
      <button onClick={back} className="text-sm text-primary">
        ← All plants
      </button>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="relative flex aspect-video items-center justify-center bg-secondary text-6xl">
          {p.cover ? (
            <img src={p.cover} alt={p.name} className="h-full w-full object-cover" />
          ) : (
            "🌱"
          )}
          <div className="absolute bottom-2 right-2">
            <PhotoPick label="📷" onPick={(cover) => onChange((x) => ({ ...x, cover }))} />
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
      </section>

      {/* 30-Day Growth & Health Metrics for this Plant */}
      <GrowthMetricsChart plants={allPlants.length > 0 ? allPlants : [p]} openedPlantId={p.id} />

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
            type={logType}
            onSave={(l) => {
              onChange((x) => {
                const currentLogs = Array.isArray(x.logs) ? x.logs : [];
                const updatedLogs = [l, ...currentLogs];
                updatedLogs.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
                return {
                  ...x,
                  logs: updatedLogs,
                };
              });
              setLogType(null);
            }}
          />
        )}
      </section>

      <section>
        <div className="mb-2 flex gap-2">
          <button className={chip(view === "timeline")} onClick={() => setView("timeline")}>
            Timeline
          </button>
          <button className={chip(view === "gallery")} onClick={() => setView("gallery")}>
            Gallery ({photos.length})
          </button>
        </div>
        {view === "gallery" ? (
          <div className="grid grid-cols-3 gap-1">
            {photos.map((l) => (
              <img
                key={l.id}
                src={l.photo}
                alt=""
                className="aspect-square w-full rounded-lg object-cover"
              />
            ))}
            {!photos.length && (
              <p className="col-span-3 text-sm text-muted-foreground">No photos yet.</p>
            )}
          </div>
        ) : (
          <ol className="relative space-y-3 border-l pl-4">
            {plantLogs.map((l) => (
              <li key={l.id} className="relative">
                <span className="absolute -left-[1.6rem] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-card text-xs">
                  {LOGS[l.type].icon}
                </span>
                <div className="rounded-xl bg-card p-3 text-sm">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{LOGS[l.type].label}</span>
                    <span>
                      {l.date ? new Date(l.date).toLocaleDateString() : "Today"} · D
                      {Math.max(
                        1,
                        Math.floor(
                          ((l.date ? new Date(l.date).getTime() : Date.now()) -
                            (p.started ? new Date(p.started).getTime() : Date.now())) /
                            86400000,
                        ) + 1,
                      )}
                    </span>
                  </div>
                  <Details l={l} />
                  {l.photo && <img src={l.photo} alt="" className="mt-2 w-full rounded-lg" />}
                  {l.note && <p className="mt-1">{l.note}</p>}
                  <button
                    className="mt-1 text-xs text-muted-foreground"
                    onClick={() =>
                      onChange((x) => ({
                        ...x,
                        logs: (x.logs || []).filter((y) => y.id !== l.id),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
            {!plantLogs.length && (
              <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
            )}
          </ol>
        )}
      </section>
      <button onClick={onDelete} className="text-xs text-destructive">
        Delete plant
      </button>
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
    l.technique,
    l.temp && `${l.temp}°C`,
    l.humidity && `${l.humidity}% RH`,
    l.height && `${l.height} cm`,
  ].filter(Boolean);
  return parts.length ? (
    <div className="mt-1 flex flex-wrap gap-1">
      {parts.map((x) => (
        <span key={x as string} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
          {x}
        </span>
      ))}
    </div>
  ) : null;
}

function LogForm({ type, onSave }: { type: LogType; onSave: (l: Log) => void }) {
  const [l, setL] = useState<Log>({ id: uid(), date: today(), type });
  const set = (k: keyof Log) => (e: { target: { value: string } }) =>
    setL((prev) => ({ ...prev, [k]: e.target.value }));
  return (
    <form
      className="mt-3 space-y-2 rounded-2xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...l,
          id: l.id || uid(),
          date: l.date || today(),
          type,
        });
      }}
    >
      <input className={input} type="date" value={l.date} onChange={set("date")} />
      {(type === "water" || type === "feed") && (
        <div className="grid grid-cols-3 gap-2">
          <input
            className={input}
            inputMode="decimal"
            placeholder="Litres"
            onChange={set("amount")}
          />
          <input className={input} inputMode="decimal" placeholder="pH" onChange={set("ph")} />
          <input className={input} inputMode="decimal" placeholder="EC" onChange={set("ec")} />
        </div>
      )}
      {type === "feed" && (
        <input className={input} placeholder="Nutrients & doses" onChange={set("nutrients")} />
      )}
      {type === "training" && (
        <div className="flex flex-wrap gap-2">
          {TECHNIQUES.map((t) => (
            <button
              type="button"
              key={t}
              className={chip(l.technique === t)}
              onClick={() => setL({ ...l, technique: t })}
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
            onChange={set("temp")}
          />
          <input
            className={input}
            inputMode="decimal"
            placeholder="RH %"
            onChange={set("humidity")}
          />
          <input
            className={input}
            inputMode="decimal"
            placeholder="Height cm"
            onChange={set("height")}
          />
        </div>
      )}
      {type === "photo" && (
        <div className="flex items-center gap-3">
          <PhotoPick
            label={l.photo ? "Change photo" : "Choose photo"}
            onPick={(photo) => setL({ ...l, photo })}
          />
          {l.photo && <img src={l.photo} alt="" className="h-14 w-14 rounded-lg object-cover" />}
        </div>
      )}
      <textarea className={input} rows={2} placeholder="Notes" onChange={set("note")} />
      <button className={`${btn} w-full`}>Save {LOGS[type].label.toLowerCase()}</button>
    </form>
  );
}
