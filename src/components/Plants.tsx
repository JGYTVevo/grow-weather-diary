import { Cloud, CloudUpload, LogIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import {
  deletePlantFromFirestore,
  deletePlantLogFromFirestore,
  LOCAL_STORAGE_KEY,
  migrateLocalGrowsToCloud,
  savePlantLogToFirestore,
  savePlantToFirestore,
  subscribePlantLogs,
  subscribeUserPlants,
  type Log,
  type LogType,
  type Plant,
  type Stage,
} from "@/lib/grows-service";

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

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const days = (d: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
const weekDay = (d: string) => {
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
      const s = Math.min(1, 600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * s;
      c.height = img.height * s;
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.65));
    };
    img.src = URL.createObjectURL(file);
  });
}

function PhotoPick({ onPick, label }: { onPick: (d: string) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground transition hover:border-primary/50"
      >
        {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onPick(await compress(f));
        }}
      />
    </>
  );
}

export function PlantsPanel() {
  const { user, signInWithGoogle } = useAuth();
  const [plants, setPlants] = useState<Plant[]>([]);
  const [localBackupCount, setLocalBackupCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [migrating, setMigrating] = useState(false);

  // Check for local storage plants available for cloud backup
  useEffect(() => {
    try {
      const local = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]") as Plant[];
      setLocalBackupCount(local.length);
      if (!user) {
        setPlants(local);
        setLoaded(true);
      }
    } catch {
      /* ignore */
    }
  }, [user]);

  // Subscribe to real-time Firestore when logged in
  useEffect(() => {
    if (!user) return;
    setLoaded(false);
    const unsubscribe = subscribeUserPlants(user.uid, (cloudPlants) => {
      setPlants(cloudPlants);
      setLoaded(true);
    });
    return () => unsubscribe();
  }, [user]);

  // Save guest plants to localStorage
  useEffect(() => {
    if (user || !loaded) return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(plants));
    } catch {
      toast.error("Local storage full — remove some photos.");
    }
  }, [plants, loaded, user]);

  const handleCreatePlant = async (p: Plant) => {
    if (user) {
      try {
        await savePlantToFirestore(user.uid, p);
        toast.success(`"${p.name}" saved to your account!`);
      } catch (err) {
        console.error("Save plant error", err);
        toast.error("Could not save plant to cloud.");
        return;
      }
    } else {
      setPlants((ps) => [p, ...ps]);
      toast.success(`"${p.name}" saved locally. Sign in to sync across devices!`);
    }
    setAdding(false);
  };

  const handleUpdatePlant = async (id: string, fn: (p: Plant) => Plant) => {
    const existing = plants.find((p) => p.id === id);
    if (!existing) return;
    const updated = fn(existing);

    if (user) {
      try {
        await savePlantToFirestore(user.uid, updated);
      } catch (err) {
        console.error("Update plant error", err);
        toast.error("Could not update plant.");
      }
    } else {
      setPlants((ps) => ps.map((p) => (p.id === id ? updated : p)));
    }
  };

  const handleDeletePlant = async (id: string, name: string) => {
    if (user) {
      try {
        await deletePlantFromFirestore(user.uid, id);
        toast.success(`"${name}" deleted from your account`);
      } catch (err) {
        console.error("Delete plant error", err);
        toast.error("Failed to delete plant.");
      }
    } else {
      setPlants((ps) => ps.filter((p) => p.id !== id));
      toast.success(`"${name}" deleted`);
    }
    setOpenId(null);
  };

  const handleMigrate = async () => {
    if (!user) return;
    try {
      setMigrating(true);
      const local = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]") as Plant[];
      const count = await migrateLocalGrowsToCloud(user.uid, local);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      setLocalBackupCount(0);
      toast.success(`Successfully migrated ${count} local grow(s) to your account!`);
    } catch (err) {
      console.error("Migration error", err);
      toast.error("Migration failed. Please try again.");
    } finally {
      setMigrating(false);
    }
  };

  const open = plants.find((p) => p.id === openId);

  if (open) {
    return (
      <PlantView
        plant={open}
        userId={user?.uid}
        back={() => setOpenId(null)}
        onChange={(fn) => handleUpdatePlant(open.id, fn)}
        onDelete={() => handleDeletePlant(open.id, open.name)}
      />
    );
  }

  const active = plants.filter((p) => p.stage !== "Harvested");

  return (
    <div className="space-y-4">
      {/* Account & Sync Status Banner */}
      {user ? (
        <div className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2 text-primary font-medium">
            <Cloud className="h-4 w-4" />
            <span>Connected as {user.displayName || user.email} (Cloud Synced)</span>
          </div>
          {localBackupCount > 0 && (
            <button
              onClick={handleMigrate}
              disabled={migrating}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <CloudUpload className="h-3 w-3" />
              <span>{migrating ? "Backing up…" : `Backup ${localBackupCount} local grow(s)`}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-primary/30 bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-foreground">Save your grows in the cloud</p>
              <p className="text-xs text-muted-foreground">
                Sign in with Google to save journals, sync across devices, and prevent data loss.
              </p>
            </div>
            <button
              onClick={signInWithGoogle}
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow transition hover:opacity-90"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign in with Google</span>
            </button>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Active", active.length],
          ["Harvested", plants.length - active.length],
          ["Grows", plants.length],
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

      {adding && <NewPlant onSave={handleCreatePlant} />}

      {plants.length === 0 && !adding && (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {loaded ? "Start your first grow journal." : "Loading your grows…"}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {plants.map((p) => (
          <button
            key={p.id}
            onClick={() => setOpenId(p.id)}
            className="group overflow-hidden rounded-2xl border bg-card text-left transition hover:border-primary/50"
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
        const now = new Date().toISOString();
        onSave({
          id: uid(),
          ...f,
          cover: f.cover || undefined,
          stage: "Germination",
          stageStarted: f.started,
          logs: [],
          createdAt: now,
          updatedAt: now,
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
  userId,
  back,
  onChange,
  onDelete,
}: {
  plant: Plant;
  userId?: string;
  back: () => void;
  onChange: (fn: (p: Plant) => Plant) => void;
  onDelete: () => void;
}) {
  const [logs, setLogs] = useState<Log[]>(p.logs || []);
  const [logType, setLogType] = useState<LogType | null>(null);
  const [view, setView] = useState<"timeline" | "gallery">("timeline");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const stageIdx = STAGES.indexOf(p.stage);

  // Subscribe to real-time logs from Firestore if user is signed in
  useEffect(() => {
    if (!userId) {
      setLogs(p.logs || []);
      return;
    }
    const unsubscribe = subscribePlantLogs(userId, p.id, (cloudLogs) => {
      setLogs(cloudLogs);
    });
    return () => unsubscribe();
  }, [userId, p.id, p.logs]);

  const lastWater = logs.find((l) => l.type === "water" || l.type === "feed");
  const photos = logs.filter((l) => l.photo);
  const latestHeight = logs.find((l) => l.height)?.height;

  const handleSaveLog = async (newLog: Log) => {
    if (userId) {
      try {
        await savePlantLogToFirestore(userId, p.id, newLog);
        toast.success("Log entry saved!");
      } catch (err) {
        console.error("Save log error", err);
        toast.error("Could not save log entry.");
      }
    } else {
      const updatedLogs = [newLog, ...logs].sort((a, b) => b.date.localeCompare(a.date));
      setLogs(updatedLogs);
      onChange((x) => ({ ...x, logs: updatedLogs }));
      toast.success("Log saved locally");
    }
    setLogType(null);
  };

  const handleDeleteLog = async (logId: string) => {
    if (userId) {
      try {
        await deletePlantLogFromFirestore(userId, p.id, logId);
        toast.success("Log entry removed");
      } catch (err) {
        console.error("Delete log error", err);
        toast.error("Failed to delete log.");
      }
    } else {
      const updatedLogs = logs.filter((y) => y.id !== logId);
      setLogs(updatedLogs);
      onChange((x) => ({ ...x, logs: updatedLogs }));
      toast.success("Log removed");
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={back}
        className="text-sm font-semibold text-primary transition hover:underline"
      >
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
            <PhotoPick
              label="📷 Change cover"
              onPick={(cover) => onChange((x) => ({ ...x, cover }))}
            />
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-semibold">{p.name}</h2>
            {userId && (
              <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Cloud Saved
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
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
        <h3 className="mb-3 text-lg font-medium">Growth stage</h3>
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

      <section>
        <h3 className="mb-2 text-lg font-medium">Add to journal</h3>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(LOGS) as LogType[]).map((t) => (
            <button
              key={t}
              onClick={() => setLogType(logType === t ? null : t)}
              className={`rounded-2xl border p-3 text-center transition hover:border-primary/40 ${logType === t ? "border-primary bg-primary/15" : "bg-card"}`}
            >
              <div className="text-2xl">{LOGS[t].icon}</div>
              <div className="text-xs">{LOGS[t].label}</div>
            </button>
          ))}
        </div>
        {logType && <LogForm type={logType} onSave={handleSaveLog} />}
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
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map((l) => (
              <img
                key={l.id}
                src={l.photo}
                alt=""
                className="aspect-square w-full rounded-xl object-cover"
              />
            ))}
            {!photos.length && (
              <p className="col-span-3 rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                No photos logged yet.
              </p>
            )}
          </div>
        ) : (
          <ol className="relative space-y-3 border-l pl-4">
            {logs.map((l) => (
              <li key={l.id} className="relative">
                <span className="absolute -left-[1.6rem] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-card text-xs shadow-sm">
                  {LOGS[l.type].icon}
                </span>
                <div className="rounded-xl bg-card p-3 text-sm">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{LOGS[l.type].label}</span>
                    <span>
                      {new Date(l.date).toLocaleDateString()} · D
                      {Math.max(
                        1,
                        Math.floor(
                          (new Date(l.date).getTime() - new Date(p.started).getTime()) / 86400000,
                        ) + 1,
                      )}
                    </span>
                  </div>
                  <Details l={l} />
                  {l.photo && <img src={l.photo} alt="" className="mt-2 w-full rounded-lg" />}
                  {l.note && <p className="mt-1">{l.note}</p>}
                  <button
                    className="mt-2 text-xs text-muted-foreground transition hover:text-destructive"
                    onClick={() => handleDeleteLog(l.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
            {!logs.length && (
              <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                Nothing logged yet.
              </p>
            )}
          </ol>
        )}
      </section>

      {confirmDelete ? (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <span className="text-xs text-destructive">Delete {p.name}?</span>
          <button
            onClick={onDelete}
            className="rounded-lg bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground transition hover:opacity-90"
          >
            Confirm Delete
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="text-xs text-muted-foreground hover:underline"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDelete(true)}
          className="text-xs text-destructive transition hover:underline"
        >
          Delete plant
        </button>
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
  const [l, setL] = useState<Log>({
    id: uid(),
    date: today(),
    type,
    createdAt: new Date().toISOString(),
  });

  const set = (k: keyof Log) => (e: { target: { value: string } }) =>
    setL({ ...l, [k]: e.target.value });

  return (
    <form
      className="mt-3 space-y-2 rounded-2xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(l);
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
