import React, { useState, useEffect } from "react";
import { fetchForecast, buildAlerts, type Forecast, type Alert } from "@/lib/weather";
import {
  CloudSun,
  Wind,
  Droplets,
  Thermometer,
  Sun,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Clock,
  Compass,
  CheckCircle,
  PlusCircle,
} from "lucide-react";

import type { Plant } from "@/hooks/use-plants";
import { WeatherAlertsManager } from "@/components/WeatherAlertsManager";

interface WeatherBlockProps {
  onLogWeatherToDiary?: (temp: string, humidity: string, note: string) => void;
  plants?: Plant[];
}

const PRESET_CITIES = [
  { name: "My Current GPS", lat: 0, lon: 0, isGps: true },
  { name: "Auckland, NZ", lat: -36.85, lon: 174.76 },
  { name: "Melbourne, AU", lat: -37.81, lon: 144.96 },
  { name: "Los Angeles, CA", lat: 34.05, lon: -118.24 },
  { name: "Denver, CO", lat: 39.74, lon: -104.99 },
  { name: "Barcelona, ES", lat: 41.39, lon: 2.17 },
  { name: "Amsterdam, NL", lat: 52.37, lon: 4.89 },
  { name: "London, UK", lat: 51.51, lon: -0.13 },
];

export const WeatherBlock: React.FC<WeatherBlockProps> = ({ onLogWeatherToDiary, plants = [] }) => {
  const [data, setData] = useState<Forecast | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [place, setPlace] = useState("Locating…");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState<string>("My Current GPS");
  const [loggedNotification, setLoggedNotification] = useState(false);

  const loadWeather = (lat: number, lon: number, label: string) => {
    setLoading(true);
    setPlace(label);
    fetchForecast(lat, lon)
      .then((f) => {
        setData(f);
        setAlerts(buildAlerts(f));
        setErr("");
        setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      })
      .catch(() => setErr("Weather updates unavailable. Retrying shortly."))
      .finally(() => setLoading(false));
  };

  const loadByGps = () => {
    if (!navigator.geolocation) {
      loadWeather(-36.85, 174.76, "Auckland (default)");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        loadWeather(p.coords.latitude, p.coords.longitude, "Your Garden Location");
      },
      () => {
        loadWeather(-36.85, 174.76, "Auckland (default)");
      },
      { timeout: 8000 },
    );
  };

  useEffect(() => {
    loadByGps();
  }, []);

  const handleCitySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cityName = e.target.value;
    setSelectedCity(cityName);
    const found = PRESET_CITIES.find((c) => c.name === cityName);
    if (!found) return;

    if (found.isGps) {
      loadByGps();
    } else {
      loadWeather(found.lat, found.lon, found.name);
    }
  };

  const handleRefresh = () => {
    const found = PRESET_CITIES.find((c) => c.name === selectedCity);
    if (found && !found.isGps) {
      loadWeather(found.lat, found.lon, found.name);
    } else {
      loadByGps();
    }
  };

  const handleLogToDiary = () => {
    if (!data || !onLogWeatherToDiary) return;
    const temp = Math.round(data.current.temperature_2m).toString();
    const humidity = data.current.relative_humidity_2m.toString();
    const note = `Local Weather: ${place} · Wind ${Math.round(
      data.current.wind_speed_10m,
    )}km/h · ${alerts.length ? alerts[0]?.title : "Clear conditions"}`;
    onLogWeatherToDiary(temp, humidity, note);
    setLoggedNotification(true);
    setTimeout(() => setLoggedNotification(false), 3000);
  };

  const tone = {
    danger: "border-destructive bg-destructive/15 text-destructive",
    warning: "border-warning bg-warning/10 text-warning",
    info: "border-info bg-info/10 text-info",
  };
  const dot = {
    danger: "bg-destructive",
    warning: "bg-warning",
    info: "bg-info",
  };

  // Grow climate indicators
  const tempVal = data ? Math.round(data.current.temperature_2m) : null;
  const rhVal = data ? data.current.relative_humidity_2m : null;
  const windVal = data ? Math.round(data.current.wind_speed_10m) : null;

  return (
    <div className="space-y-5">
      {/* Update Header with Location Selector and Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary shrink-0" />
          <select
            value={selectedCity}
            onChange={handleCitySelect}
            className="bg-transparent text-xs font-semibold text-foreground outline-none cursor-pointer"
          >
            {PRESET_CITIES.map((c) => (
              <option key={c.name} value={c.name} className="bg-card text-foreground">
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{lastUpdated}</span>
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80 transition"
            title="Refresh weather data"
          >
            <RefreshCw className={`h-3 w-3 text-primary ${loading ? "animate-spin" : ""}`} />
            <span>Update</span>
          </button>
        </div>
      </div>

      {/* Main Conditions Card */}
      <section className="rounded-2xl border border-border bg-card p-5 relative overflow-hidden shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-medium text-primary uppercase tracking-widest">
              Live Weather Block
            </span>
            <p className="text-sm font-semibold text-foreground mt-0.5">{place}</p>
          </div>
          {onLogWeatherToDiary && data && (
            <button
              onClick={handleLogToDiary}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/30 transition border border-primary/30"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>{loggedNotification ? "✓ Logged!" : "Log to Diary"}</span>
            </button>
          )}
        </div>

        {data ? (
          <div className="mt-4 flex items-end justify-between">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-6xl text-foreground font-semibold">
                {tempVal}°
              </span>
              <span className="text-sm text-muted-foreground">Celsius</span>
            </div>
            <div className="text-right text-xs text-muted-foreground space-y-1">
              <div className="flex items-center justify-end gap-1.5">
                <Droplets className="h-3.5 w-3.5 text-info" />
                <span>Humidity {rhVal}%</span>
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <Wind className="h-3.5 w-3.5 text-primary" />
                <span>Wind {windVal} km/h</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{err || "Loading weather update…"}</p>
        )}

        {/* Cultivation Environment Quick Check */}
        {data && (
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
            <div className="rounded-xl bg-secondary/50 p-2 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Plant Comfort</div>
              <div className="mt-0.5 text-xs font-bold text-foreground">
                {tempVal! >= 20 && tempVal! <= 28
                  ? "Optimal 🌱"
                  : tempVal! < 12
                    ? "Cold Stress ❄"
                    : tempVal! > 32
                      ? "Heat Stress ☀️"
                      : "Moderate"}
              </div>
            </div>
            <div className="rounded-xl bg-secondary/50 p-2 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Mould Risk</div>
              <div className="mt-0.5 text-xs font-bold text-foreground">
                {rhVal! > 80 ? "High ⚠️" : rhVal! > 65 ? "Moderate" : "Low / Safe ✓"}
              </div>
            </div>
            <div className="rounded-xl bg-secondary/50 p-2 text-center">
              <div className="text-[10px] text-muted-foreground uppercase">Wind Guard</div>
              <div className="mt-0.5 text-xs font-bold text-foreground">
                {windVal! >= 40 ? "Stake stems 💨" : "Gentle breeze"}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Hourly Forecast (Next 24 Hours) */}
      {data && data.hourly && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-primary" />
              <span>Next 24 Hours Hourly</span>
            </h3>
            <span className="text-xs text-muted-foreground">Swipe →</span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 pt-1 scrollbar-thin">
            {data.hourly.time.slice(0, 24).map((timeStr, i) => {
              const hourLabel = new Date(timeStr).toLocaleTimeString([], {
                hour: "numeric",
              });
              const temp = Math.round(data.hourly.temperature_2m[i] ?? 0);
              const rh = data.hourly.relative_humidity_2m[i] ?? 0;
              const rain = data.hourly.precipitation[i] ?? 0;

              return (
                <div
                  key={timeStr}
                  className="flex min-w-[72px] shrink-0 flex-col items-center justify-between rounded-2xl border border-border bg-card p-2.5 text-center shadow-xs"
                >
                  <span className="text-[11px] text-muted-foreground">{hourLabel}</span>
                  <div className="my-1.5 text-base font-bold text-foreground">{temp}°</div>
                  <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                    <span className="text-info flex items-center justify-center gap-0.5">
                      <Droplets className="h-2.5 w-2.5" />
                      {rh}%
                    </span>
                    {rain > 0 ? (
                      <span className="text-primary font-semibold">{rain}mm</span>
                    ) : (
                      <span>0mm</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Automated Weather Push Notifications & Threshold Monitor */}
      <WeatherAlertsManager forecast={data} plants={plants} />

      {/* Plant Protection Alerts */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <span>Grower Weather Alerts (48h)</span>
          </h3>
          {typeof Notification !== "undefined" && Notification.permission === "default" && (
            <button
              onClick={() => Notification.requestPermission()}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Enable Notifications
            </button>
          )}
        </div>

        {data && alerts.length === 0 && (
          <div className="flex items-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 p-4 text-xs text-foreground">
            <CheckCircle className="h-4 w-4 text-primary shrink-0" />
            <span>
              Optimal growing weather — no frost, extreme heat, or mould threats detected.
            </span>
          </div>
        )}

        <div className="space-y-2.5">
          {alerts.map((a) => (
            <div key={a.id} className={`rounded-2xl border p-4 ${tone[a.severity]}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${dot[a.severity]}`} />
                <span className="font-semibold text-sm">{a.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">{a.when}</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{a.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3-Day Forecast Summary */}
      {data && (
        <section className="grid grid-cols-3 gap-2.5">
          {data.daily.time.map((d, i) => (
            <div key={d} className="rounded-2xl border border-border bg-card p-3 text-center">
              <div className="text-xs font-semibold text-muted-foreground">
                {new Date(d).toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div className="mt-1 font-bold text-sm text-foreground">
                {Math.round(data.daily.temperature_2m_max[i] ?? 0)}° /{" "}
                <span className="text-muted-foreground">
                  {Math.round(data.daily.temperature_2m_min[i] ?? 0)}°
                </span>
              </div>
              <div className="mt-1 text-xs text-info font-medium">
                {data.daily.precipitation_sum[i]} mm rain
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
};
