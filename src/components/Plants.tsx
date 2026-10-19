import { useEffect, useRef, useState } from "react";

type Stage = "Germination" | "Seedling" | "Vegetative" | "Flowering" | "Drying" | "Curing" | "Harvested";
type LogType = "water" | "feed" | "training" | "environment" | "photo" | "note";
type Log = {
  id: string; date: string; type: LogType; note?: string; photo?: string;
  amount?: string; ph?: string; ec?: string; nutrients?: string;
  technique?: string; temp?: string; humidity?: string; height?: string;
};
type Plant = {
  id: string; name: string; strain: string; type: "Photoperiod" | "Autoflower";
  medium: string; setting: "Indoor" | "Outdoor" | "Greenhouse"; started: string;
  stage: Stage; stageStarted: string; cover?: string | undefined; logs: Log[]; yieldG?: string;
};

const STAGES: Stage[] = ["Germination", "Seedling", "Vegetative", "Flowering", "Drying", "Curing", "Harvested"];
const LOGS: Record<LogType, { icon: string; label: string }> = {
  water: { icon: "💧", label: "Water" }, feed: { icon: "🧪", label: "Feed" },
  training: { icon: "✂️", label: "Training" }, environment: { icon: "🌡️", label: "Environment" },
  photo: { icon: "📷", label: "Photo" }, note: { icon: "📝", label: "Note" },
};
const TECHNIQUES = ["LST", "Topping", "FIM", "Defoliation", "Lollipopping", "SCROG", "Supercropping", "Transplant"];
const KEY = "canopy-plants-v2";
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const days = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
const weekDay = (d: string) => { const n = days(d); return `Week ${Math.floor(n / 7) + 1} · Day ${(n % 7) + 1}`; };

const input = "w-full rounded-xl border bg-secondary px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const btn = "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground";
const chip = (on: boolean) => `rounded-full border px-3 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`;

function compress(file: File): Promise<string> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 720 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * s; c.height = img.height * s;
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.7));
    };
    img.src = URL.createObjectURL(file);
  });
}

function PhotoPick({ onPick, label }: { onPick: (d: string) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()} className="rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground">{label}</button>
      <input ref={ref} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) onPick(await compress(f)); }} />
    </>
  );
}

export function PlantsPanel() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => { try { setPlants(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { /* */ } setLoaded(true); }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(KEY, JSON.stringify(plants)); } catch { alert("Storage full — remove some photos."); }
  }, [plants, loaded]);

  const update = (id: string, fn: (p: Plant) => Plant) => setPlants((ps) => ps.map((p) => (p.id === id ? fn(p) : p)));
  const open = plants.find((p) => p.id === openId);

  if (open) return <PlantView plant={open} back={() => setOpenId(null)} onChange={(fn) => update(open.id, fn)}
    onDelete={() => { if (confirm(`Delete ${open.name}?`)) { setPlants((ps) => ps.filter((p) => p.id !== open.id)); setOpenId(null); } }} />;

  const active = plants.filter((p) => p.stage !== "Harvested");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[["Active", active.length], ["Harvested", plants.length - active.length], ["Logs", plants.reduce((n, p) => n + p.logs.length, 0)]].map(([l, v]) => (
          <div key={l} className="rounded-2xl border bg-card p-3 text-center">
            <div className="font-display text-2xl">{v}</div><div className="text-xs text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl">My grows</h2>
        <button className={btn} onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "+ New plant"}</button>
      </div>
      {adding && <NewPlant onSave={(p) => { setPlants((ps) => [p, ...ps]); setAdding(false); }} />}
      {plants.length === 0 && !adding && <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Start your first grow journal.</p>}
      <div className="grid grid-cols-2 gap-3">
        {plants.map((p) => (
          <button key={p.id} onClick={() => setOpenId(p.id)} className="overflow-hidden rounded-2xl border bg-card text-left">
            <div className="flex aspect-square items-center justify-center bg-secondary text-4xl">
              {p.cover ? <img src={p.cover} alt={p.name} className="h-full w-full object-cover" /> : "🌱"}
            </div>
            <div className="p-3">
              <div className="truncate font-display text-lg">{p.name}</div>
              <div className="truncate text-xs text-muted-foreground">{p.strain || "Unknown strain"}</div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">{p.stage}</span>
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
  const [f, setF] = useState({ name: "", strain: "", type: "Photoperiod" as Plant["type"], medium: "Soil", setting: "Outdoor" as Plant["setting"], started: today(), cover: "" });
  return (
    <form className="space-y-3 rounded-2xl border bg-card p-4" onSubmit={(e) => {
      e.preventDefault(); if (!f.name.trim()) return;
      onSave({ id: uid(), ...f, cover: f.cover || undefined, stage: "Germination", stageStarted: f.started, logs: [] });
    }}>
      <input className={input} placeholder="Plant name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input className={input} placeholder="Strain (e.g. Northern Lights)" value={f.strain} onChange={(e) => setF({ ...f, strain: e.target.value })} />
      <div className="flex flex-wrap gap-2">
        {(["Photoperiod", "Autoflower"] as const).map((t) => <button type="button" key={t} className={chip(f.type === t)} onClick={() => setF({ ...f, type: t })}>{t}</button>)}
      </div>
      <div className="flex flex-wrap gap-2">
        {(["Indoor", "Outdoor", "Greenhouse"] as const).map((t) => <button type="button" key={t} className={chip(f.setting === t)} onClick={() => setF({ ...f, setting: t })}>{t}</button>)}
      </div>
      <div className="flex flex-wrap gap-2">
        {["Soil", "Coco", "Hydro", "Living soil"].map((t) => <button type="button" key={t} className={chip(f.medium === t)} onClick={() => setF({ ...f, medium: t })}>{t}</button>)}
      </div>
      <label className="block text-xs text-muted-foreground">Start date
        <input className={`${input} mt-1`} type="date" value={f.started} onChange={(e) => setF({ ...f, started: e.target.value })} />
      </label>
      <div className="flex items-center gap-3">
        <PhotoPick label={f.cover ? "Change photo" : "+ Cover photo"} onPick={(cover) => setF({ ...f, cover })} />
        {f.cover && <img src={f.cover} alt="" className="h-12 w-12 rounded-lg object-cover" />}
      </div>
      <button className={`${btn} w-full`}>Create journal</button>
    </form>
  );
}

function PlantView({ plant: p, back, onChange, onDelete }: { plant: Plant; back: () => void; onChange: (fn: (p: Plant) => Plant) => void; onDelete: () => void }) {
  const [logType, setLogType] = useState<LogType | null>(null);
  const [view, setView] = useState<"timeline" | "gallery">("timeline");
  const stageIdx = STAGES.indexOf(p.stage);
  const lastWater = p.logs.find((l) => l.type === "water" || l.type === "feed");
  const photos = p.logs.filter((l) => l.photo);
  const latestHeight = p.logs.find((l) => l.height)?.height;

  return (
    <div className="space-y-4">
      <button onClick={back} className="text-sm text-primary">← All plants</button>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="relative flex aspect-video items-center justify-center bg-secondary text-6xl">
          {p.cover ? <img src={p.cover} alt={p.name} className="h-full w-full object-cover" /> : "🌱"}
          <div className="absolute bottom-2 right-2"><PhotoPick label="📷" onPick={(cover) => onChange((x) => ({ ...x, cover }))} /></div>
        </div>
        <div className="p-4">
          <h2 className="text-3xl">{p.name}</h2>
          <p className="text-sm text-muted-foreground">{p.strain || "Unknown strain"} · {p.type} · {p.setting} · {p.medium}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat v={`Day ${days(p.started) + 1}`} l="Total" />
            <Stat v={weekDay(p.stageStarted).split(" · ")[0]!} l={p.stage} />
            <Stat v={latestHeight ? `${latestHeight}cm` : "—"} l="Height" />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {lastWater ? `Last watered ${days(lastWater.date) === 0 ? "today" : `${days(lastWater.date)} day(s) ago`}` : "No watering logged yet"}
          </p>
        </div>
      </div>

      <section className="rounded-2xl border bg-card p-4">
        <h3 className="mb-3 text-lg">Growth stage</h3>
        <div className="flex gap-1">
          {STAGES.map((s, i) => <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= stageIdx ? "bg-primary" : "bg-secondary"}`} />)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {STAGES.map((s) => <button key={s} className={chip(p.stage === s)} onClick={() => onChange((x) => ({ ...x, stage: s, stageStarted: today() }))}>{s}</button>)}
        </div>
        {p.stage === "Harvested" && (
          <input className={`${input} mt-3`} placeholder="Dry yield (grams)" value={p.yieldG ?? ""} onChange={(e) => onChange((x) => ({ ...x, yieldG: e.target.value }))} />
        )}
      </section>

      <section>
        <h3 className="mb-2 text-lg">Add to journal</h3>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(LOGS) as LogType[]).map((t) => (
            <button key={t} onClick={() => setLogType(logType === t ? null : t)}
              className={`rounded-2xl border p-3 text-center ${logType === t ? "border-primary bg-primary/15" : "bg-card"}`}>
              <div className="text-2xl">{LOGS[t].icon}</div><div className="text-xs">{LOGS[t].label}</div>
            </button>
          ))}
        </div>
        {logType && <LogForm type={logType} onSave={(l) => { onChange((x) => ({ ...x, logs: [l, ...x.logs].sort((a, b) => b.date.localeCompare(a.date)) })); setLogType(null); }} />}
      </section>

      <section>
        <div className="mb-2 flex gap-2">
          <button className={chip(view === "timeline")} onClick={() => setView("timeline")}>Timeline</button>
          <button className={chip(view === "gallery")} onClick={() => setView("gallery")}>Gallery ({photos.length})</button>
        </div>
        {view === "gallery" ? (
          <div className="grid grid-cols-3 gap-1">
            {photos.map((l) => <img key={l.id} src={l.photo} alt="" className="aspect-square w-full rounded-lg object-cover" />)}
            {!photos.length && <p className="col-span-3 text-sm text-muted-foreground">No photos yet.</p>}
          </div>
        ) : (
          <ol className="relative space-y-3 border-l pl-4">
            {p.logs.map((l) => (
              <li key={l.id} className="relative">
                <span className="absolute -left-[1.6rem] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-card text-xs">{LOGS[l.type].icon}</span>
                <div className="rounded-xl bg-card p-3 text-sm">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{LOGS[l.type].label}</span>
                    <span>{new Date(l.date).toLocaleDateString()} · D{Math.max(1, Math.floor((new Date(l.date).getTime() - new Date(p.started).getTime()) / 86400000) + 1)}</span>
                  </div>
                  <Details l={l} />
                  {l.photo && <img src={l.photo} alt="" className="mt-2 w-full rounded-lg" />}
                  {l.note && <p className="mt-1">{l.note}</p>}
                  <button className="mt-1 text-xs text-muted-foreground" onClick={() => onChange((x) => ({ ...x, logs: x.logs.filter((y) => y.id !== l.id) }))}>Remove</button>
                </div>
              </li>
            ))}
            {!p.logs.length && <p className="text-sm text-muted-foreground">Nothing logged yet.</p>}
          </ol>
        )}
      </section>
      <button onClick={onDelete} className="text-xs text-destructive">Delete plant</button>
    </div>
  );
}

const Stat = ({ v, l }: { v: string; l: string }) => (
  <div className="rounded-xl bg-secondary p-2"><div className="font-semibold">{v}</div><div className="text-xs text-muted-foreground">{l}</div></div>
);

function Details({ l }: { l: Log }) {
  const parts = [
    l.amount && `${l.amount} L`, l.ph && `pH ${l.ph}`, l.ec && `EC ${l.ec}`, l.nutrients,
    l.technique, l.temp && `${l.temp}°C`, l.humidity && `${l.humidity}% RH`, l.height && `${l.height} cm`,
  ].filter(Boolean);
  return parts.length ? <div className="mt-1 flex flex-wrap gap-1">{parts.map((x) => <span key={x as string} className="rounded-full bg-secondary px-2 py-0.5 text-xs">{x}</span>)}</div> : null;
}

function LogForm({ type, onSave }: { type: LogType; onSave: (l: Log) => void }) {
  const [l, setL] = useState<Log>({ id: uid(), date: today(), type });
  const set = (k: keyof Log) => (e: { target: { value: string } }) => setL({ ...l, [k]: e.target.value });
  return (
    <form className="mt-3 space-y-2 rounded-2xl border bg-card p-4" onSubmit={(e) => { e.preventDefault(); onSave(l); }}>
      <input className={input} type="date" value={l.date} onChange={set("date")} />
      {(type === "water" || type === "feed") && (
        <div className="grid grid-cols-3 gap-2">
          <input className={input} inputMode="decimal" placeholder="Litres" onChange={set("amount")} />
          <input className={input} inputMode="decimal" placeholder="pH" onChange={set("ph")} />
          <input className={input} inputMode="decimal" placeholder="EC" onChange={set("ec")} />
        </div>
      )}
      {type === "feed" && <input className={input} placeholder="Nutrients & doses" onChange={set("nutrients")} />}
      {type === "training" && (
        <div className="flex flex-wrap gap-2">
          {TECHNIQUES.map((t) => <button type="button" key={t} className={chip(l.technique === t)} onClick={() => setL({ ...l, technique: t })}>{t}</button>)}
        </div>
      )}
      {type === "environment" && (
        <div className="grid grid-cols-3 gap-2">
          <input className={input} inputMode="decimal" placeholder="Temp °C" onChange={set("temp")} />
          <input className={input} inputMode="decimal" placeholder="RH %" onChange={set("humidity")} />
          <input className={input} inputMode="decimal" placeholder="Height cm" onChange={set("height")} />
        </div>
      )}
      {type === "photo" && (
        <div className="flex items-center gap-3">
          <PhotoPick label={l.photo ? "Change photo" : "Choose photo"} onPick={(photo) => setL({ ...l, photo })} />
          {l.photo && <img src={l.photo} alt="" className="h-14 w-14 rounded-lg object-cover" />}
        </div>
      )}
      <textarea className={input} rows={2} placeholder="Notes" onChange={set("note")} />
      <button className={`${btn} w-full`}>Save {LOGS[type].label.toLowerCase()}</button>
    </form>
  );
}
