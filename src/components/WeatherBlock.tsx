import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  fetchForecast,
  buildAlerts,
  buildSevenDayForecast,
  type Forecast,
  type Alert,
  type DailyForecastDay,
} from "@/lib/weather";
import {
  Wind,
  Droplets,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Clock,
  Calendar,
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
  { name: "Northland / Whangārei, NZ", lat: -35.72, lon: 174.32 },
  { name: "Bay of Plenty / Tauranga, NZ", lat: -37.69, lon: 176.17 },
  { name: "Hawke's Bay / Napier, NZ", lat: -39.49, lon: 176.91 },
  { name: "Nelson / Tasman Bay, NZ", lat: -41.27, lon: 173.28 },
  { name: "Wellington, NZ", lat: -41.29, lon: 174.78 },
  { name: "Christchurch / Canterbury, NZ", lat: -43.53, lon: 172.64 },
  { name: "Queenstown / Central Otago, NZ", lat: -45.03, lon: 168.66 },
  { name: "Melbourne, AU", lat: -37.81, lon: 144.96 },
  { name: "Los Angeles, CA", lat: 34.05, lon: -118.24 },
  { name: "Barcelona, ES", lat: 41.39, lon: 2.17 },
];

const WEATHER_CITY_STORAGE_KEY = "canopy-weather-city-v1";

export const WeatherBlock: React.FC<WeatherBlockProps> = ({ onLogWeatherToDiary, plants = [] }) => {
  const [data, setData] = useState<Forecast | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [sevenDay, setSevenDay] = useState<DailyForecastDay[]>([]);
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [place, setPlace] = useState("Auckland, NZ");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState<string>("My Current GPS");
  const [loggedNotification, setLoggedNotification] = useState(false);
  const [canAskNotif, setCanAskNotif] = useState(false);

  const requestSeqRef = useRef(0);
  const dataRef = useRef<Forecast | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      setCanAskNotif(true);
    }
  }, []);

  const loadWeather = useCallback((lat: number, lon: number, label: string) => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setErr("");
    setPlace(label);
    fetchForecast(lat, lon)
      .then((f) => {
        if (seq !== requestSeqRef.current) return;
        const daily7 = buildSevenDayForecast(f);
        setData(f);
        setAlerts(buildAlerts(f));
        setSevenDay(daily7);
        const firstWarningDay = daily7.find((d) => d.warnings.length > 0);
        setSelectedDayDate((firstWarningDay ?? daily7[0])?.date ?? null);
        setErr("");
        setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      })
      .catch(() => {
        if (seq !== requestSeqRef.current) return;
        setErr("Could not reach the weather service. Check your connection and try again.");
      })
      .finally(() => {
        if (seq === requestSeqRef.current) {
          setLoading(false);
        }
      });
  }, []);

  const loadByGps = useCallback(() => {
    // Load Auckland immediately so the user never gets stuck waiting on a stalled GPS prompt
    if (!dataRef.current) {
      loadWeather(-36.85, 174.76, "Auckland, NZ (checking GPS…)");
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      loadWeather(-36.85, 174.76, "Auckland, NZ (default)");
      return;
    }

    let settled = false;
    const gpsGuard = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (dataRef.current) {
        setPlace("Auckland, NZ (default)");
      } else {
        loadWeather(-36.85, 174.76, "Auckland, NZ (default)");
      }
    }, 4500);

    try {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          if (settled) return;
          settled = true;
          clearTimeout(gpsGuard);
          loadWeather(p.coords.latitude, p.coords.longitude, "Your Garden Location");
        },
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(gpsGuard);
          if (dataRef.current) {
            setPlace("Auckland, NZ (default)");
          } else {
            loadWeather(-36.85, 174.76, "Auckland, NZ (default)");
          }
        },
        { timeout: 4500, maximumAge: 300000 },
      );
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(gpsGuard);
        loadWeather(-36.85, 174.76, "Auckland, NZ (default)");
      }
    }
  }, [loadWeather]);

  useEffect(() => {
    let savedCity = "My Current GPS";
    try {
      const stored = localStorage.getItem(WEATHER_CITY_STORAGE_KEY);
      if (stored && PRESET_CITIES.some((c) => c.name === stored)) {
        savedCity = stored;
      }
    } catch {
      // ignore storage errors
    }
    setSelectedCity(savedCity);
    const found = PRESET_CITIES.find((c) => c.name === savedCity);
    if (found && !found.isGps) {
      loadWeather(found.lat, found.lon, found.name);
    } else {
      loadByGps();
    }
  }, [loadByGps, loadWeather]);

  const handleCitySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cityName = e.target.value;
    setSelectedCity(cityName);
    try {
      localStorage.setItem(WEATHER_CITY_STORAGE_KEY, cityName);
    } catch {
      // ignore
    }
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

  const startHourIdx = useMemo(() => {
    if (!data?.hourly?.time?.length) return 0;
    const nowMs = Date.now();
    const idx = data.hourly.time.findIndex((t) => {
      const ms = new Date(t).getTime();
      return !Number.isNaN(ms) && ms >= nowMs - 3600 * 1000;
    });
    if (idx >= 0 && idx + 24 <= data.hourly.time.length) {
      return idx;
    }
    return 0;
  }, [data]);

  const activeDay = useMemo(() => {
    if (sevenDay.length === 0) return null;
    return (
      sevenDay.find((d) => d.date === selectedDayDate) ??
      sevenDay.find((d) => d.warnings.length > 0) ??
      sevenDay[0] ??
      null
    );
  }, [sevenDay, selectedDayDate]);

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
      <section className="rounded-2xl border border-primary/25 bg-card nz-summer-banner p-5 relative overflow-hidden shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold text-primary">
              ☀️ Aotearoa Summer Microclimate
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

        {err && (
          <div
            role="alert"
            className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <span>{err}</span>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="rounded-lg bg-destructive px-2.5 py-1 text-[11px] font-semibold text-destructive-foreground hover:opacity-90 transition cursor-pointer"
            >
              {loading ? "Retrying…" : "Retry"}
            </button>
          </div>
        )}

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
          !err && <p className="mt-3 text-sm text-muted-foreground">Loading weather update…</p>
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
            {data.hourly.time.slice(startHourIdx, startHourIdx + 24).map((timeStr, offset) => {
              const i = startHourIdx + offset;
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

      {/* 7-Day Forecast Block with Predicted Daily Weather Warnings */}
      {data && sevenDay.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-primary" />
              <span>Next 7 Days & Daily Warnings</span>
            </h3>
            <span className="text-xs text-muted-foreground">Swipe →</span>
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-thin">
            {sevenDay.map((day) => {
              const isSelected = activeDay?.date === day.date;
              const hasDanger = day.warnings.some((w) => w.severity === "danger");
              const hasWarning = day.warnings.some((w) => w.severity === "warning");

              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelectedDayDate(day.date)}
                  className={`flex min-w-[148px] max-w-[168px] shrink-0 flex-col justify-between rounded-2xl border p-3 text-left shadow-xs transition cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                      : hasDanger
                        ? "border-destructive/50 bg-card hover:border-destructive"
                        : hasWarning
                          ? "border-warning/40 bg-card hover:border-warning"
                          : "border-border bg-card hover:bg-secondary/40"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-foreground">{day.dayLabel}</span>
                      <span className="text-[10px] text-muted-foreground">{day.shortDate}</span>
                    </div>

                    <div className="my-2 flex items-baseline gap-1.5">
                      <span className="text-lg font-bold text-foreground">{day.tempMax}°</span>
                      <span className="text-xs font-medium text-muted-foreground">
                        / {day.tempMin}°C
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-muted-foreground border-t border-border/60 pt-2">
                      <span className="text-info flex items-center gap-1">
                        <Droplets className="h-2.5 w-2.5 shrink-0" />
                        <span>{day.maxHumidity}% RH</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Wind className="h-2.5 w-2.5 shrink-0 text-primary" />
                        <span>{day.maxWindGusts}km/h</span>
                      </span>
                      <span
                        className={`col-span-2 ${
                          day.precipitationMm > 0
                            ? "text-primary font-semibold"
                            : "text-muted-foreground"
                        }`}
                      >
                        {day.precipitationMm > 0 ? `${day.precipitationMm} mm rain` : "0 mm rain"}
                      </span>
                    </div>
                  </div>

                  {/* Predicted Weather Warnings for this Day */}
                  <div className="mt-2.5 border-t border-border/60 pt-2 space-y-1">
                    {day.warnings.length > 0 ? (
                      day.warnings.map((w) => (
                        <div
                          key={w.id}
                          className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-[10px] font-semibold leading-tight ${tone[w.severity]}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot[w.severity]}`}
                          />
                          <span className="truncate">{w.shortLabel}</span>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center gap-1 text-[10px] font-medium text-primary">
                        <CheckCircle className="h-3 w-3 shrink-0" />
                        <span>No warnings</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected Day Warning Detail Panel */}
          {activeDay && (
            <div className="rounded-2xl border border-border bg-card p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-foreground">
                  {activeDay.dayLabel} ({activeDay.shortDate}) — Predicted Warnings (
                  {activeDay.warnings.length})
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {activeDay.tempMax}° / {activeDay.tempMin}°C · {activeDay.precipitationMm}mm ·
                  Peak RH {activeDay.maxHumidity}%
                </div>
              </div>

              {activeDay.warnings.length > 0 ? (
                <div className="space-y-1.5">
                  {activeDay.warnings.map((w) => (
                    <div
                      key={w.id}
                      className={`rounded-xl border px-3 py-2 text-xs ${tone[w.severity]}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${dot[w.severity]}`} />
                          <span>{w.title}</span>
                        </span>
                        <span className="text-[11px] opacity-90">{w.shortLabel}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                        {w.detail}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-foreground">
                  <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>
                    Clear growing conditions predicted for {activeDay.dayLabel.toLowerCase()} — no
                    frost, heat, wind, heavy rain, or mould warnings.
                  </span>
                </div>
              )}
            </div>
          )}
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
          {canAskNotif && (
            <button
              onClick={() => {
                Notification.requestPermission().then((perm) => {
                  if (perm !== "default") setCanAskNotif(false);
                });
              }}
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
    </div>
  );
};
