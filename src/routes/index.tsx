import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { buildAlerts, fetchForecast, type Alert, type Forecast } from "@/lib/weather";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Canopy — Grow Diary & Weather Alerts" },
      { name: "description", content: "Track your plants and get local weather warnings for frost, heat, wind and mould risk." },
      { property: "og:title", content: "Canopy — Grow Diary & Weather Alerts" },
      { property: "og:description", content: "Grow diary with local weather alerts for your plants." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Stage = "Seedling" | "Vegetative" | "Flowering" | "Drying" | "Curing";
type Entry = { id: string; date: string; note: string; height?: string; watered: boolean; fed: boolean };
type Plant = { id: string; name: string; strain: string; started: string; stage: Stage; entries: Entry[] };
const STAGES: Stage[] = ["Seedling", "Vegetative", "Flowering", "Drying", "Curing"];
const KEY = "canopy-plants";
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const daysSince = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));

function Index() {
  const [tab, setTab] = useState<"weather" | "plants">("weather");
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try { setPlants(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { /* ignore */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem(KEY, JSON.stringify(plants)); }, [plants, loaded]);

  return (
    <div className="min-h-screen bg-hero">
      <div className="mx-auto max-w-2xl px-4 pb-28 pt-8">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-[0.25em] text-primary">Canopy</p>
          <h1 className="text-4xl font-semibold">Grow diary</h1>
        </header>
        {tab === "weather" ? <WeatherPanel /> : <PlantsPanel plants={plants} setPlants={setPlants} />}
      </div>
      <nav className="fixed inset-x-0 bottom-0 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl">
          {(["weather", "plants"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-4 text-sm font-semibold capitalize ${tab === t ? "text-primary" : "text-muted-foreground"}`}>
              {t === "weather" ? "☁ Weather" : "🌱 Plants"}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function WeatherPanel() {
  const [data, setData] = useState<Forecast | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [err, setErr] = useState("");
  const [place, setPlace] = useState("Locating…");

  const load = (lat: number, lon: number, label: string) => {
    setPlace(label);
    fetchForecast(lat, lon)
      .then((f) => { setData(f); setAlerts(buildAlerts(f)); setErr(""); })
      .catch(() => setErr("Couldn't load the weather. Try again shortly."));
  };

  useEffect(() => {
    const fallback = () => load(-36.85, 174.76, "Auckland (default)");
    if (!navigator.geolocation) return fallback();
    navigator.geolocation.getCurrentPosition(
      (p) => load(p.coords.latitude, p.coords.longitude, "Your location"),
      fallback, { timeout: 8000 });
  }, []);

  useEffect(() => {
    const danger = alerts.filter((a) => a.severity === "danger");
    if (!danger.length || typeof Notification === "undefined") return;
    if (Notification.permission === "granted")
      new Notification(`Canopy: ${danger[0]!.title}`, { body: danger[0]!.detail });
  }, [alerts]);

  const tone = { danger: "border-destructive bg-destructive/15", warning: "border-warning bg-warning/10", info: "border-info bg-info/10" };
  const dot = { danger: "bg-destructive", warning: "bg-warning", info: "bg-info" };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border bg-card p-5">
        <p className="text-sm text-muted-foreground">{place}</p>
        {data ? (
          <div className="mt-2 flex items-end justify-between">
            <span className="font-display text-6xl">{Math.round(data.current.temperature_2m)}°</span>
            <div className="text-right text-sm text-muted-foreground">
              <div>Humidity {data.current.relative_humidity_2m}%</div>
              <div>Wind {Math.round(data.current.wind_speed_10m)} km/h</div>
            </div>
          </div>
        ) : <p className="mt-2 text-muted-foreground">{err || "Loading forecast…"}</p>}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-2xl">Plant alerts · next 48h</h2>
          {typeof Notification !== "undefined" && Notification.permission === "default" && (
            <button onClick={() => Notification.requestPermission()} className="text-xs font-semibold text-primary">
              Enable notifications
            </button>
          )}
        </div>
        {data && alerts.length === 0 && (
          <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 text-sm">
            ✓ Clear conditions — nothing threatening your plants.
          </div>
        )}
        <div className="space-y-3">
          {alerts.map((a) => (
            <div key={a.id} className={`rounded-2xl border p-4 ${tone[a.severity]}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${dot[a.severity]}`} />
                <span className="font-semibold">{a.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">{a.when}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{a.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {data && (
        <section className="grid grid-cols-3 gap-3">
          {data.daily.time.map((d, i) => (
            <div key={d} className="rounded-2xl border bg-card p-3 text-center">
              <div className="text-xs text-muted-foreground">{new Date(d).toLocaleDateString(undefined, { weekday: "short" })}</div>
              <div className="mt-1 font-semibold">{Math.round(data.daily.temperature_2m_max[i] ?? 0)}° / {Math.round(data.daily.temperature_2m_min[i] ?? 0)}°</div>
              <div className="text-xs text-info">{data.daily.precipitation_sum[i]} mm</div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

const input = "w-full rounded-xl border bg-secondary px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const btn = "rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground";

function PlantsPanel({ plants, setPlants }: { plants: Plant[]; setPlants: (f: (p: Plant[]) => Plant[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", strain: "", started: today() });
  const update = (id: string, fn: (p: Plant) => Plant) => setPlants((ps) => ps.map((p) => (p.id === id ? fn(p) : p)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl">Your plants</h2>
        <button className={btn} onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "+ Add plant"}</button>
      </div>
      {adding && (
        <form className="space-y-2 rounded-2xl border bg-card p-4" onSubmit={(e) => {
          e.preventDefault();
          if (!form.name.trim()) return;
          setPlants((ps) => [{ id: uid(), ...form, stage: "Seedling", entries: [] }, ...ps]);
          setForm({ name: "", strain: "", started: today() }); setAdding(false);
        }}>
          <input className={input} placeholder="Plant name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={input} placeholder="Strain" value={form.strain} onChange={(e) => setForm({ ...form, strain: e.target.value })} />
          <input className={input} type="date" value={form.started} onChange={(e) => setForm({ ...form, started: e.target.value })} />
          <button className={`${btn} w-full`}>Save plant</button>
        </form>
      )}
      {plants.length === 0 && !adding && (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No plants yet — add your first one.</p>
      )}
      {plants.map((p) => (
        <div key={p.id} className="rounded-2xl border bg-card">
          <button className="flex w-full items-center justify-between p-4 text-left" onClick={() => setOpen(open === p.id ? null : p.id)}>
            <div>
              <div className="font-display text-xl">{p.name}</div>
              <div className="text-xs text-muted-foreground">{p.strain || "Unknown strain"} · Day {daysSince(p.started)}</div>
            </div>
            <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">{p.stage}</span>
          </button>
          {open === p.id && <PlantDetail plant={p} onChange={(fn) => update(p.id, fn)}
            onDelete={() => confirm(`Delete ${p.name}?`) && setPlants((ps) => ps.filter((x) => x.id !== p.id))} />}
        </div>
      ))}
    </div>
  );
}

function PlantDetail({ plant, onChange, onDelete }: { plant: Plant; onChange: (fn: (p: Plant) => Plant) => void; onDelete: () => void }) {
  const [e, setE] = useState({ note: "", height: "", watered: false, fed: false, date: today() });
  return (
    <div className="space-y-4 border-t p-4">
      <div className="flex flex-wrap gap-2">
        {STAGES.map((s) => (
          <button key={s} onClick={() => onChange((p) => ({ ...p, stage: s }))}
            className={`rounded-full border px-3 py-1 text-xs ${plant.stage === s ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{s}</button>
        ))}
      </div>
      <form className="space-y-2" onSubmit={(ev) => {
        ev.preventDefault();
        if (!e.note.trim() && !e.watered && !e.fed) return;
        onChange((p) => ({ ...p, entries: [{ id: uid(), ...e }, ...p.entries] }));
        setE({ note: "", height: "", watered: false, fed: false, date: today() });
      }}>
        <textarea className={input} rows={2} placeholder="How's it looking today?" value={e.note} onChange={(x) => setE({ ...e, note: x.target.value })} />
        <div className="flex gap-2">
          <input className={input} type="date" value={e.date} onChange={(x) => setE({ ...e, date: x.target.value })} />
          <input className={input} placeholder="Height (cm)" value={e.height} onChange={(x) => setE({ ...e, height: x.target.value })} />
        </div>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={e.watered} onChange={(x) => setE({ ...e, watered: x.target.checked })} /> Watered</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={e.fed} onChange={(x) => setE({ ...e, fed: x.target.checked })} /> Fed</label>
          <button className={`${btn} ml-auto`}>Log entry</button>
        </div>
      </form>
      <ul className="space-y-2">
        {plant.entries.map((x) => (
          <li key={x.id} className="rounded-xl bg-secondary p-3 text-sm">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{new Date(x.date).toLocaleDateString()}</span>
              <span>{[x.watered && "💧 Watered", x.fed && "🧪 Fed", x.height && `${x.height} cm`].filter(Boolean).join(" · ")}</span>
            </div>
            {x.note && <p className="mt-1">{x.note}</p>}
          </li>
        ))}
      </ul>
      <button onClick={onDelete} className="text-xs text-destructive">Delete plant</button>
    </div>
  );
}
