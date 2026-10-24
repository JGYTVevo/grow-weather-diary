import type { Forecast } from "@/lib/weather";
import type { Plant } from "@/hooks/use-plants";

export interface WeatherThresholdSettings {
  enabled: boolean;
  heatThresholdC: number;
  coldThresholdC: number;
  frostThresholdC: number;
  windThresholdKmh: number;
  humidityThresholdPercent: number;
  targetSetting: "All" | "Outdoor" | "OutdoorAndGreenhouse";
  lastChecked?: string;
}

export interface WeatherDispatchedNotification {
  id: string;
  title: string;
  body: string;
  type: "heat" | "cold" | "frost" | "wind" | "humidity";
  severity: "danger" | "warning";
  timestamp: string;
  vulnerablePlantNames: string[];
}

export const DEFAULT_THRESHOLDS: WeatherThresholdSettings = {
  enabled: false,
  heatThresholdC: 32, // °C
  coldThresholdC: 10, // °C
  frostThresholdC: 2, // °C
  windThresholdKmh: 50, // km/h
  humidityThresholdPercent: 85, // %
  targetSetting: "OutdoorAndGreenhouse",
};

const SETTINGS_KEY = "canopy-weather-notification-settings-v1";
const COOLDOWNS_KEY = "canopy-weather-alert-cooldowns-v1";
const DISPATCHED_KEY = "canopy-dispatched-weather-alerts-v1";

export function loadThresholdSettings(): WeatherThresholdSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export function saveThresholdSettings(settings: WeatherThresholdSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function loadDispatchedAlerts(): WeatherDispatchedNotification[] {
  try {
    const raw = localStorage.getItem(DISPATCHED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDispatchedAlert(alert: WeatherDispatchedNotification): void {
  try {
    const existing = loadDispatchedAlerts();
    const updated = [alert, ...existing.slice(0, 19)];
    localStorage.setItem(DISPATCHED_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  try {
    const res = await Notification.requestPermission();
    return res;
  } catch {
    return "denied";
  }
}

// Low-level browser notification dispatcher using ServiceWorker or Web Notification API
export async function sendBrowserNotification(
  title: string,
  options: NotificationOptions & { data?: unknown },
): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  if (Notification.permission !== "granted") {
    return false;
  }

  const defaultOptions: NotificationOptions = {
    icon: "/icon.svg",
    badge: "/icon.svg",
    ...options,
  };

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && "showNotification" in reg) {
        await reg.showNotification(title, defaultOptions);
        return true;
      }
    }

    new Notification(title, defaultOptions);
    return true;
  } catch (err) {
    console.warn("Direct notification failed, trying fallback:", err);
    try {
      new Notification(title, defaultOptions);
      return true;
    } catch {
      return false;
    }
  }
}

// Checks 48h weather forecast against active plants and pushes notifications if thresholds are breached
export async function checkWeatherThresholdsAndNotify(
  forecast: Forecast,
  plants: Plant[],
): Promise<WeatherDispatchedNotification[]> {
  const settings = loadThresholdSettings();
  if (!settings.enabled) return [];

  if (getNotificationPermission() !== "granted") return [];

  // Filter vulnerable plants by setting
  const targetPlants = plants.filter((p) => {
    if (p.stage === "Harvested") return false;
    if (settings.targetSetting === "All") return true;
    if (settings.targetSetting === "OutdoorAndGreenhouse") {
      return p.setting === "Outdoor" || p.setting === "Greenhouse";
    }
    return p.setting === "Outdoor";
  });

  const plantNames = targetPlants.map((p) => p.name);
  const plantNamesStr = plantNames.length > 0 ? plantNames.slice(0, 3).join(", ") : "Your Plants";

  const h = forecast.hourly;
  const n = Math.min(48, h.time.length);
  const nowMs = Date.now();
  const cooldownPeriodMs = 6 * 60 * 60 * 1000; // 6 hour cooldown per alert type to avoid alert fatigue

  let cooldownMap: Record<string, number> = {};
  try {
    cooldownMap = JSON.parse(localStorage.getItem(COOLDOWNS_KEY) || "{}");
  } catch {
    cooldownMap = {};
  }

  const dispatched: WeatherDispatchedNotification[] = [];

  const shouldSendAlert = (key: string): boolean => {
    const lastTime = cooldownMap[key] || 0;
    return nowMs - lastTime > cooldownPeriodMs;
  };

  const markSent = (key: string) => {
    cooldownMap[key] = nowMs;
    try {
      localStorage.setItem(COOLDOWNS_KEY, JSON.stringify(cooldownMap));
    } catch {
      // ignore
    }
  };

  // 1. FROST RISK CHECK (<= frostThresholdC, default 2°C)
  let frostHourIdx = -1;
  for (let i = 0; i < n; i++) {
    if (h.temperature_2m[i]! <= settings.frostThresholdC) {
      frostHourIdx = i;
      break;
    }
  }

  if (frostHourIdx >= 0 && shouldSendAlert("frost")) {
    const minTemp = h.temperature_2m[frostHourIdx]!;
    const timeStr = new Date(h.time[frostHourIdx]!).toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
    });

    const notif: WeatherDispatchedNotification = {
      id: `frost-${nowMs}`,
      title: `❄️ Frost Warning: ${minTemp}°C at ${timeStr}`,
      body: `Extreme cold approaching for ${plantNamesStr}. Move outdoor containers inside or cover canopy immediately!`,
      type: "frost",
      severity: "danger",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      vulnerablePlantNames: plantNames,
    };

    await sendBrowserNotification(notif.title, {
      body: notif.body,
      tag: "canopy-frost-alert",
      data: { url: "/" },
    });

    markSent("frost");
    saveDispatchedAlert(notif);
    dispatched.push(notif);
  }

  // 2. COLD STRESS CHECK (< coldThresholdC, default 10°C) if no frost already fired
  let coldHourIdx = -1;
  if (frostHourIdx < 0) {
    for (let i = 0; i < n; i++) {
      if (h.temperature_2m[i]! < settings.coldThresholdC) {
        coldHourIdx = i;
        break;
      }
    }

    if (coldHourIdx >= 0 && shouldSendAlert("cold")) {
      const lowTemp = h.temperature_2m[coldHourIdx]!;
      const timeStr = new Date(h.time[coldHourIdx]!).toLocaleString(undefined, {
        weekday: "short",
        hour: "numeric",
      });

      const notif: WeatherDispatchedNotification = {
        id: `cold-${nowMs}`,
        title: `🌡️ Cold Stress Alert: ${lowTemp}°C expected`,
        body: `Low temperature around ${timeStr}. Root phosphorus uptake drops below 10°C. Protect seedlings & roots.`,
        type: "cold",
        severity: "warning",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        vulnerablePlantNames: plantNames,
      };

      await sendBrowserNotification(notif.title, {
        body: notif.body,
        tag: "canopy-cold-alert",
        data: { url: "/" },
      });

      markSent("cold");
      saveDispatchedAlert(notif);
      dispatched.push(notif);
    }
  }

  // 3. EXTREME HEAT CHECK (>= heatThresholdC, default 32°C)
  let heatHourIdx = -1;
  for (let i = 0; i < n; i++) {
    if (h.temperature_2m[i]! >= settings.heatThresholdC) {
      heatHourIdx = i;
      break;
    }
  }

  if (heatHourIdx >= 0 && shouldSendAlert("heat")) {
    const peakTemp = h.temperature_2m[heatHourIdx]!;
    const timeStr = new Date(h.time[heatHourIdx]!).toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
    });

    const notif: WeatherDispatchedNotification = {
      id: `heat-${nowMs}`,
      title: `☀️ Extreme Heat Alert: ${peakTemp}°C at ${timeStr}`,
      body: `Foliar transpiration warning for ${plantNamesStr}. Water early in the morning and prepare shade cloth!`,
      type: "heat",
      severity: peakTemp >= 36 ? "danger" : "warning",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      vulnerablePlantNames: plantNames,
    };

    await sendBrowserNotification(notif.title, {
      body: notif.body,
      tag: "canopy-heat-alert",
      data: { url: "/" },
    });

    markSent("heat");
    saveDispatchedAlert(notif);
    dispatched.push(notif);
  }

  // 4. HIGH WIND GUSTS CHECK (>= windThresholdKmh, default 50 km/h)
  let windHourIdx = -1;
  for (let i = 0; i < n; i++) {
    if (h.wind_gusts_10m[i]! >= settings.windThresholdKmh) {
      windHourIdx = i;
      break;
    }
  }

  if (windHourIdx >= 0 && shouldSendAlert("wind")) {
    const maxGust = Math.round(h.wind_gusts_10m[windHourIdx]!);
    const timeStr = new Date(h.time[windHourIdx]!).toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
    });

    const notif: WeatherDispatchedNotification = {
      id: `wind-${nowMs}`,
      title: `💨 Strong Wind Alert: Gusts to ${maxGust} km/h`,
      body: `High wind risk at ${timeStr} for ${plantNamesStr}. Stake heavy colas and secure container trellising.`,
      type: "wind",
      severity: maxGust >= 75 ? "danger" : "warning",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      vulnerablePlantNames: plantNames,
    };

    await sendBrowserNotification(notif.title, {
      body: notif.body,
      tag: "canopy-wind-alert",
      data: { url: "/" },
    });

    markSent("wind");
    saveDispatchedAlert(notif);
    dispatched.push(notif);
  }

  // 5. HIGH SUSTAINED HUMIDITY / BUD ROT RISK (>= humidityThresholdPercent for 4+ consecutive hours)
  let consecutiveHumidity = 0;
  let moldTriggerHour = -1;
  for (let i = 0; i < n; i++) {
    if (h.relative_humidity_2m[i]! >= settings.humidityThresholdPercent) {
      consecutiveHumidity++;
      if (consecutiveHumidity >= 4) {
        moldTriggerHour = i;
        break;
      }
    } else {
      consecutiveHumidity = 0;
    }
  }

  if (moldTriggerHour >= 0 && shouldSendAlert("humidity")) {
    const timeStr = new Date(h.time[moldTriggerHour]!).toLocaleString(undefined, {
      weekday: "short",
      hour: "numeric",
    });

    const notif: WeatherDispatchedNotification = {
      id: `mould-${nowMs}`,
      title: `🌧️ Bud Rot & Mould Risk: Sustained Humidity >${settings.humidityThresholdPercent}%`,
      body: `Prolonged damp microclimate around ${timeStr}. Inspect dense flower clusters on ${plantNamesStr} and maximize airflow.`,
      type: "humidity",
      severity: "warning",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      vulnerablePlantNames: plantNames,
    };

    await sendBrowserNotification(notif.title, {
      body: notif.body,
      tag: "canopy-mould-alert",
      data: { url: "/" },
    });

    markSent("humidity");
    saveDispatchedAlert(notif);
    dispatched.push(notif);
  }

  // Update lastChecked time
  settings.lastChecked = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  saveThresholdSettings(settings);

  return dispatched;
}

// Sends an instant test push notification
export async function sendTestWeatherNotification(plants: Plant[]): Promise<boolean> {
  const perm = await requestNotificationPermission();
  if (perm !== "granted") {
    return false;
  }

  const activeNames = plants
    .filter((p) => p.stage !== "Harvested")
    .map((p) => p.name)
    .slice(0, 2)
    .join(", ");

  const testTitle = "🌿 Canopy Weather Guard: Test Alert";
  const testBody = activeNames
    ? `Browser notifications active! We'll alert you if extreme heat, frost, or bud rot threatens ${activeNames}.`
    : "Browser notifications active! We'll alert you if extreme heat, frost, or bud rot threatens your garden.";

  const success = await sendBrowserNotification(testTitle, {
    body: testBody,
    tag: "canopy-test-alert",
  });

  if (success) {
    saveDispatchedAlert({
      id: `test-${Date.now()}`,
      title: testTitle,
      body: testBody,
      type: "heat",
      severity: "warning",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      vulnerablePlantNames: plants.map((p) => p.name),
    });
  }

  return success;
}
