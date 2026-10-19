import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PlantsPanel } from "@/components/Plants";
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

function Index() {
  const [tab, setTab] = useState<"weather" | "plants">("weather");
  return (
    <div className="min-h-screen bg-hero">
      <div className="mx-auto max-w-2xl px-4 pb-28 pt-8">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-[0.25em] text-primary">Canopy</p>
          <h1 className="text-4xl font-semibold">Grow diary</h1>
        </header>
        {tab === "weather" ? <WeatherPanel /> : <PlantsPanel />}
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

