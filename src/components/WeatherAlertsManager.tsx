import React, { useState, useEffect } from "react";
import type { Plant } from "@/hooks/use-plants";
import type { Forecast } from "@/lib/weather";
import {
  DEFAULT_THRESHOLDS,
  loadThresholdSettings,
  saveThresholdSettings,
  getNotificationPermission,
  requestNotificationPermission,
  sendTestWeatherNotification,
  checkWeatherThresholdsAndNotify,
  loadDispatchedAlerts,
  type WeatherThresholdSettings,
  type WeatherDispatchedNotification,
} from "@/lib/weather-notifications";
import {
  Bell,
  BellRing,
  BellOff,
  Flame,
  Snowflake,
  Wind,
  Droplets,
  ShieldCheck,
  Check,
  AlertTriangle,
  Settings,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface WeatherAlertsManagerProps {
  forecast: Forecast | null;
  plants: Plant[];
}

export function WeatherAlertsManager({ forecast, plants }: WeatherAlertsManagerProps) {
  const [settings, setSettings] = useState<WeatherThresholdSettings>(DEFAULT_THRESHOLDS);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [showSettings, setShowSettings] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [dispatchedAlerts, setDispatchedAlerts] = useState<WeatherDispatchedNotification[]>([]);

  // Sync settings when loaded
  useEffect(() => {
    setSettings(loadThresholdSettings());
    setPermission(getNotificationPermission());
    setDispatchedAlerts(loadDispatchedAlerts());
  }, []);

  // Run weather check whenever forecast changes and notifications are active
  useEffect(() => {
    if (forecast && settings.enabled && permission === "granted") {
      checkWeatherThresholdsAndNotify(forecast, plants).then((newAlerts) => {
        if (newAlerts.length > 0) {
          setDispatchedAlerts(loadDispatchedAlerts());
        }
      });
    }
  }, [forecast, plants, settings.enabled, permission]);

  const handleToggleEnabled = async () => {
    if (!settings.enabled) {
      // User is enabling: request permission if needed
      const perm = await requestNotificationPermission();
      setPermission(perm);
      if (perm === "granted") {
        const next = { ...settings, enabled: true };
        setSettings(next);
        saveThresholdSettings(next);
        setFeedbackMsg({
          text: "Browser alerts activated! We will notify you when weather thresholds are met.",
          type: "success",
        });
        if (forecast) {
          checkWeatherThresholdsAndNotify(forecast, plants).then(() => {
            setDispatchedAlerts(loadDispatchedAlerts());
          });
        }
      } else {
        setFeedbackMsg({
          text: "Permission denied in browser. Please enable notifications in your browser settings.",
          type: "error",
        });
      }
    } else {
      // Disabling
      const next = { ...settings, enabled: false };
      setSettings(next);
      saveThresholdSettings(next);
      setFeedbackMsg({ text: "Weather push alerts paused.", type: "success" });
    }
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleUpdateThreshold = <K extends keyof WeatherThresholdSettings>(
    key: K,
    val: WeatherThresholdSettings[K],
  ) => {
    const next = { ...settings, [key]: val };
    setSettings(next);
    saveThresholdSettings(next);
  };

  const handleSendTest = async () => {
    setTestSending(true);
    setFeedbackMsg(null);
    try {
      const success = await sendTestWeatherNotification(plants);
      setPermission(getNotificationPermission());
      if (success) {
        setFeedbackMsg({
          text: "🔔 Test notification pushed to your browser!",
          type: "success",
        });
        setDispatchedAlerts(loadDispatchedAlerts());
      } else {
        setFeedbackMsg({
          text: "Could not send notification. Please enable notifications in your browser.",
          type: "error",
        });
      }
    } catch {
      setFeedbackMsg({ text: "Notification test failed.", type: "error" });
    } finally {
      setTestSending(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  const outdoorCount = plants.filter(
    (p) => p.setting === "Outdoor" && p.stage !== "Harvested",
  ).length;
  const isAlerting = settings.enabled && permission === "granted";

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Header & Master Toggle */}
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary/30">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
              isAlerting
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "bg-secondary text-muted-foreground border border-border"
            }`}
          >
            {isAlerting ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">Plant Care Weather Guard</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  isAlerting
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-secondary text-muted-foreground border border-border"
                }`}
              >
                {isAlerting ? "Active" : "Paused"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Push browser warnings when extreme heat, frost, or bud rot threatens your plants
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Main Toggle Button */}
          <button
            type="button"
            onClick={handleToggleEnabled}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition active:scale-95 shadow-xs ${
              settings.enabled
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-secondary border border-border text-foreground hover:bg-secondary/80"
            }`}
          >
            <Bell className="h-3.5 w-3.5" />
            <span>{settings.enabled ? "Alerts Enabled" : "Enable Alerts"}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-xl border border-border bg-secondary text-muted-foreground hover:text-foreground transition"
            title="Configure thresholds"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedbackMsg && (
        <div
          className={`p-3 text-xs font-medium border-t flex items-center justify-between gap-2 animate-in fade-in ${
            feedbackMsg.type === "success"
              ? "bg-primary/10 border-primary/20 text-primary"
              : "bg-destructive/10 border-destructive/20 text-destructive"
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Threshold Sliders & Settings Panel */}
      {showSettings && (
        <div className="p-4 sm:p-5 border-t border-border bg-secondary/10 space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Weather Hazard Thresholds
            </h4>
            <span className="text-[11px] text-muted-foreground">
              Evaluating {outdoorCount} outdoor & greenhouse plants
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Extreme Heat Threshold */}
            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Flame className="h-3.5 w-3.5 text-amber-500" />
                  Extreme Heat Limit
                </span>
                <span className="text-xs font-bold text-amber-500 font-mono">
                  ≥ {settings.heatThresholdC}°C ({Math.round(settings.heatThresholdC * 1.8 + 32)}°F)
                </span>
              </div>
              <input
                type="range"
                min="26"
                max="40"
                step="1"
                value={settings.heatThresholdC}
                onChange={(e) => handleUpdateThreshold("heatThresholdC", Number(e.target.value))}
                className="w-full accent-amber-500 h-2 rounded-lg bg-secondary cursor-pointer"
              />
              <p className="text-[11px] text-muted-foreground">
                Alerts to water early, monitor foliar droop, and apply shade cloth
              </p>
            </div>

            {/* Cold Stress & Frost Threshold */}
            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Snowflake className="h-3.5 w-3.5 text-cyan-500" />
                  Frost & Cold Limit
                </span>
                <span className="text-xs font-bold text-cyan-500 font-mono">
                  ≤ {settings.coldThresholdC}°C ({Math.round(settings.coldThresholdC * 1.8 + 32)}°F)
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="15"
                step="1"
                value={settings.coldThresholdC}
                onChange={(e) => handleUpdateThreshold("coldThresholdC", Number(e.target.value))}
                className="w-full accent-cyan-500 h-2 rounded-lg bg-secondary cursor-pointer"
              />
              <p className="text-[11px] text-muted-foreground">
                Alerts to bring outdoor pots indoors before cell walls freeze
              </p>
            </div>

            {/* Wind Gust Threshold */}
            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Wind className="h-3.5 w-3.5 text-primary" />
                  Wind Gust Limit
                </span>
                <span className="text-xs font-bold text-primary font-mono">
                  ≥ {settings.windThresholdKmh} km/h
                </span>
              </div>
              <input
                type="range"
                min="35"
                max="85"
                step="5"
                value={settings.windThresholdKmh}
                onChange={(e) => handleUpdateThreshold("windThresholdKmh", Number(e.target.value))}
                className="w-full accent-primary h-2 rounded-lg bg-secondary cursor-pointer"
              />
              <p className="text-[11px] text-muted-foreground">
                Alerts to tie down branches and secure trellises before stem snapping
              </p>
            </div>

            {/* High Humidity & Bud Rot Threshold */}
            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Droplets className="h-3.5 w-3.5 text-purple-500" />
                  Bud Rot / Humidity Limit
                </span>
                <span className="text-xs font-bold text-purple-500 font-mono">
                  ≥ {settings.humidityThresholdPercent}% RH
                </span>
              </div>
              <input
                type="range"
                min="70"
                max="95"
                step="5"
                value={settings.humidityThresholdPercent}
                onChange={(e) =>
                  handleUpdateThreshold("humidityThresholdPercent", Number(e.target.value))
                }
                className="w-full accent-purple-500 h-2 rounded-lg bg-secondary cursor-pointer"
              />
              <p className="text-[11px] text-muted-foreground">
                Alerts when sustained damp conditions foster botrytis microclimates
              </p>
            </div>
          </div>

          {/* Plant Scope Selector & Test Notification Button */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground font-medium">Protect:</span>
              <select
                value={settings.targetSetting}
                onChange={(e) =>
                  handleUpdateThreshold(
                    "targetSetting",
                    e.target.value as WeatherThresholdSettings["targetSetting"],
                  )
                }
                className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-foreground font-medium outline-none"
              >
                <option value="OutdoorAndGreenhouse">Outdoor & Greenhouse Plants</option>
                <option value="Outdoor">Outdoor Plants Only</option>
                <option value="All">All Plants (Including Indoor)</option>
              </select>
            </div>

            <button
              type="button"
              disabled={testSending}
              onClick={handleSendTest}
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition active:scale-95 disabled:opacity-50"
            >
              <Bell className="h-3.5 w-3.5" />
              <span>{testSending ? "Pushing…" : "Send Test Notification"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Recent Dispatched Alerts History */}
      {dispatchedAlerts.length > 0 && (
        <div className="p-4 border-t border-border bg-secondary/10 space-y-2">
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
            Recent Browser Notifications Sent
          </span>
          <div className="space-y-1.5">
            {dispatchedAlerts.slice(0, 3).map((alert) => (
              <div
                key={alert.id}
                className="flex items-start justify-between gap-2 text-xs p-2.5 rounded-xl bg-card border border-border"
              >
                <div>
                  <p className="font-semibold text-foreground">{alert.title}</p>
                  <p className="text-[11px] text-muted-foreground">{alert.body}</p>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                  {alert.timestamp}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
