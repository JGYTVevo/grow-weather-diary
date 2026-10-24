import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  Droplets,
  Gauge,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  Sun,
  Wind,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  buildAlerts,
  calculateVPD,
  fetchForecast,
  getPlantCareRecommendations,
  getVPDStatus,
  getWeatherDescription,
  searchLocations,
  type Alert,
  type Forecast,
  type GeocodingResult,
  type PlantCarePlanning,
} from "@/lib/weather";

const DEFAULT_COORDS = { lat: -36.85, lon: 174.76, name: "Auckland, New Zealand" };
const SAVED_LOCATION_KEY = "canopy_saved_weather_location";

export function WeatherDashboard() {
  const [data, setData] = useState<Forecast | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [carePlan, setCarePlan] = useState<PlantCarePlanning | null>(null);
  const [placeName, setPlaceName] = useState<string>("Locating…");
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string>("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Location search state
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState<boolean>(false);

  // Active coordinates
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lon: number }>({
    lat: DEFAULT_COORDS.lat,
    lon: DEFAULT_COORDS.lon,
  });

  const loadWeather = async (lat: number, lon: number, label: string) => {
    setLoading(true);
    setErr("");
    setPlaceName(label);
    try {
      const forecast = await fetchForecast(lat, lon);
      setData(forecast);
      setAlerts(buildAlerts(forecast));
      setCarePlan(getPlantCareRecommendations(forecast));
      setLastRefreshed(new Date());

      if (typeof window !== "undefined") {
        localStorage.setItem(SAVED_LOCATION_KEY, JSON.stringify({ lat, lon, name: label }));
      }
    } catch {
      setErr("Unable to load live weather. Please check your connection.");
      toast.error("Couldn't retrieve forecast for this location.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-detect location on initial load if not saved
  useEffect(() => {
    let saved: { lat: number; lon: number; name?: string } | null = null;
    try {
      const stored = localStorage.getItem(SAVED_LOCATION_KEY);
      if (stored) saved = JSON.parse(stored);
    } catch {
      /* ignore */
    }

    if (saved && saved.lat && saved.lon) {
      loadWeather(saved.lat, saved.lon, saved.name || "Saved Location");
      return;
    }

    const fallback = () => {
      loadWeather(DEFAULT_COORDS.lat, DEFAULT_COORDS.lon, DEFAULT_COORDS.name);
    };

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          loadWeather(pos.coords.latitude, pos.coords.longitude, "Your Local Garden");
        },
        fallback,
        { timeout: 7000 },
      );
    } else {
      fallback();
    }
  }, []);

  // Browser notification trigger for dangerous alerts
  useEffect(() => {
    const danger = alerts.filter((a) => a.severity === "danger");
    if (!danger.length || typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification(`Canopy Alert: ${danger[0]!.title}`, {
        body: danger[0]!.detail,
        icon: "/pwa-192x192.png",
      });
    }
  }, [alerts]);

  // Debounced geocoding search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const results = await searchLocations(searchQuery);
      setSearchResults(results);
      setSearching(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectLocation = (loc: GeocodingResult) => {
    const label = `${loc.name}${loc.admin1 ? `, ${loc.admin1}` : ""}, ${loc.country}`;
    setCurrentCoords({ lat: loc.latitude, lon: loc.longitude });
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    loadWeather(loc.latitude, loc.longitude, label);
    toast.success(`Location set to ${loc.name}`);
  };

  const handleUseGPS = () => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      setSearchOpen(false);
      setPlaceName("Detecting GPS…");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          loadWeather(pos.coords.latitude, pos.coords.longitude, "Your Local Garden");
          toast.success("Updated to your device GPS location");
        },
        () => {
          toast.error("GPS access denied or unavailable");
        },
        { timeout: 8000 },
      );
    }
  };

  // Metric computations
  const currentTemp = data ? Math.round(data.current.temperature_2m) : null;
  const currentRH = data ? data.current.relative_humidity_2m : null;
  const vpd =
    data && currentTemp !== null && currentRH !== null
      ? calculateVPD(data.current.temperature_2m, currentRH)
      : null;
  const vpdStatus = vpd !== null ? getVPDStatus(vpd) : null;
  const weatherDesc = data ? getWeatherDescription(data.current.weather_code) : null;

  const alertTone = {
    danger: "border-destructive/40 bg-destructive/15 text-destructive",
    warning: "border-warning/40 bg-warning/10 text-warning",
    info: "border-info/40 bg-info/10 text-info",
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Location Bar & Quick Search */}
      <section className="relative rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="flex items-center gap-1.5 text-left font-semibold text-foreground transition hover:text-primary"
            >
              <span className="truncate max-w-[200px] sm:max-w-xs">{placeName}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadWeather(currentCoords.lat, currentCoords.lon, placeName)}
              disabled={loading}
              suppressHydrationWarning
              title={
                mounted && lastRefreshed
                  ? `Last refreshed: ${lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : undefined
              }
              className="flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Location Dropdown Modal / Popover */}
        {searchOpen && (
          <div className="mt-3 space-y-2 border-t pt-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search city or town (e.g. Denver, London, Sydney)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full rounded-xl border bg-secondary py-2 pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
              <button onClick={handleUseGPS} className="font-semibold text-primary hover:underline">
                📍 Use my device GPS location
              </button>
              <button onClick={() => setSearchOpen(false)} className="hover:underline">
                Close
              </button>
            </div>

            {searching && (
              <p className="py-2 text-center text-xs text-muted-foreground">Searching cities…</p>
            )}

            {searchResults.length > 0 && (
              <div className="divide-y rounded-xl border bg-secondary/80">
                {searchResults.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => handleSelectLocation(loc)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs transition hover:bg-primary/10"
                  >
                    <span className="font-medium text-foreground">
                      {loc.name}
                      {loc.admin1 ? `, ${loc.admin1}` : ""}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{loc.country}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Main Weather Card */}
      <section className="rounded-2xl border bg-card p-5">
        {data && weatherDesc ? (
          <div>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-3xl">{weatherDesc.icon}</span>
                  <span className="text-sm font-medium text-muted-foreground">
                    {weatherDesc.text}
                  </span>
                </div>
                <div className="mt-1 font-display text-6xl font-semibold tracking-tight">
                  {currentTemp}°
                </div>
                {data.current.apparent_temperature !== undefined && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Feels like {Math.round(data.current.apparent_temperature)}°C
                  </p>
                )}
              </div>

              {/* VPD Metric Badge */}
              {vpd !== null && vpdStatus && (
                <div className="flex flex-col items-end rounded-2xl bg-secondary/60 p-3 text-right">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Gauge className="h-3.5 w-3.5 text-primary" />
                    <span>Leaf VPD</span>
                  </div>
                  <div className="mt-1 font-display text-2xl font-bold">{vpd} kPa</div>
                  <div
                    className={`mt-0.5 text-[10px] font-semibold ${
                      vpdStatus.tone === "good"
                        ? "text-primary"
                        : vpdStatus.tone === "warning"
                          ? "text-warning"
                          : "text-destructive"
                    }`}
                  >
                    {vpdStatus.label}
                  </div>
                </div>
              )}
            </div>

            {/* Weather Metrics Grid */}
            <div className="mt-5 grid grid-cols-3 gap-2 border-t pt-4 text-center">
              <div className="rounded-xl bg-secondary/40 p-2.5">
                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <Droplets className="h-3.5 w-3.5 text-info" />
                  <span>Humidity</span>
                </div>
                <div className="mt-1 font-semibold">{currentRH}%</div>
              </div>

              <div className="rounded-xl bg-secondary/40 p-2.5">
                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <Wind className="h-3.5 w-3.5 text-primary" />
                  <span>Wind / Gusts</span>
                </div>
                <div className="mt-1 font-semibold">
                  {Math.round(data.current.wind_speed_10m)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    / {Math.round(data.current.wind_gusts_10m ?? data.current.wind_speed_10m)} km/h
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-secondary/40 p-2.5">
                <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <Sun className="h-3.5 w-3.5 text-warning" />
                  <span>UV Index</span>
                </div>
                <div className="mt-1 font-semibold">
                  {data.daily.uv_index_max?.[0] ?? data.hourly.uv_index[0] ?? "—"}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {err || "Retrieving local meteorological data…"}
          </div>
        )}
      </section>

      {/* Plant Care Planning Engine */}
      {carePlan && (
        <section className="space-y-3 rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Plant Care Planning</h3>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
              Weather Advisory
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {/* Watering Planning */}
            <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Droplets className="h-3.5 w-3.5 text-info" />
                <span>Watering Recommendation</span>
              </div>
              <p className="mt-1 text-muted-foreground">{carePlan.watering.advice}</p>
            </div>

            {/* Foliar Spray Window */}
            <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Sun className="h-3.5 w-3.5 text-accent" />
                <span>Foliar Feeding & Sprays</span>
              </div>
              <p className="mt-1 text-muted-foreground">{carePlan.foliarSpray.advice}</p>
            </div>

            {/* Physical Protection */}
            <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <ShieldAlert
                  className={`h-3.5 w-3.5 ${carePlan.protection.needed ? "text-destructive" : "text-primary"}`}
                />
                <span>Outdoor Protection</span>
              </div>
              <p className="mt-1 text-muted-foreground">{carePlan.protection.advice}</p>
            </div>

            {/* Mould Risk */}
            <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <AlertTriangle
                    className={`h-3.5 w-3.5 ${
                      carePlan.mouldRisk.level === "High"
                        ? "text-destructive"
                        : carePlan.mouldRisk.level === "Moderate"
                          ? "text-warning"
                          : "text-primary"
                    }`}
                  />
                  <span>Mould & Bud Rot Risk</span>
                </span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    carePlan.mouldRisk.level === "High"
                      ? "bg-destructive/20 text-destructive"
                      : carePlan.mouldRisk.level === "Moderate"
                        ? "bg-warning/20 text-warning"
                        : "bg-primary/20 text-primary"
                  }`}
                >
                  {carePlan.mouldRisk.level}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">{carePlan.mouldRisk.advice}</p>
            </div>
          </div>
        </section>
      )}

      {/* 48-Hour Plant Alerts */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Plant Alerts · Next 48h</h3>
          {typeof Notification !== "undefined" && Notification.permission === "default" && (
            <button
              onClick={() => Notification.requestPermission()}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Bell className="h-3 w-3" />
              <span>Enable Alerts</span>
            </button>
          )}
        </div>

        {data && alerts.length === 0 && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-primary/40 bg-primary/10 p-4 text-xs font-medium text-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span>
              Clear conditions — no weather threats for your outdoor or greenhouse plants.
            </span>
          </div>
        )}

        <div className="space-y-2.5">
          {alerts.map((a) => (
            <div key={a.id} className={`rounded-2xl border p-4 ${alertTone[a.severity]}`}>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="font-semibold">{a.title}</span>
                <span className="ml-auto text-xs opacity-80">{a.when}</span>
              </div>
              <p className="mt-1 text-xs opacity-90">{a.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Hourly Forecast Strip (Next 24 Hours) */}
      {data && (
        <section className="rounded-2xl border bg-card p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Next 24 Hours Temperature & Rain
          </h4>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
            {data.hourly.time.slice(0, 24).map((timeStr, idx) => {
              const hourDate = new Date(timeStr);
              const hourLabel = hourDate.toLocaleTimeString([], { hour: "numeric" });
              const temp = Math.round(data.hourly.temperature_2m[idx] ?? 0);
              const rainChance = data.hourly.precipitation_probability?.[idx] ?? 0;
              const rainMm = data.hourly.precipitation[idx] ?? 0;

              return (
                <div
                  key={timeStr}
                  className="flex min-w-[3.8rem] flex-col items-center rounded-xl bg-secondary/30 p-2 text-center text-xs"
                >
                  <span className="text-[10px] text-muted-foreground" suppressHydrationWarning>
                    {hourLabel}
                  </span>
                  <span className="my-1 font-semibold">{temp}°</span>
                  {rainChance > 20 || rainMm > 0 ? (
                    <span className="text-[10px] text-info">💧 {rainChance}%</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 7-Day Cultivation Forecast */}
      {data && data.daily.time && (
        <section className="rounded-2xl border bg-card p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            7-Day Cultivation Outlook
          </h4>
          <div className="space-y-2">
            {data.daily.time.map((d, i) => {
              const dayName = new Date(d).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              const isToday = i === 0;
              const maxT = Math.round(data.daily.temperature_2m_max[i] ?? 0);
              const minT = Math.round(data.daily.temperature_2m_min[i] ?? 0);
              const rain = data.daily.precipitation_sum[i] ?? 0;
              const code = data.daily.weather_code?.[i] ?? 0;
              const desc = getWeatherDescription(code);

              return (
                <div
                  key={d}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs ${
                    isToday ? "bg-primary/10 border border-primary/30" : "bg-secondary/30"
                  }`}
                >
                  <div className="w-28 font-medium" suppressHydrationWarning>
                    {isToday ? "Today" : dayName}
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span>{desc.icon}</span>
                    <span className="hidden sm:inline text-[11px]">{desc.text}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-foreground">{maxT}°</span>
                    <span className="text-muted-foreground"> / {minT}°</span>
                    {rain > 0 && <span className="ml-2 text-info">{rain} mm</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
