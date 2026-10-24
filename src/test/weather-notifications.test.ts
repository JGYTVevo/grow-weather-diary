import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  loadThresholdSettings,
  saveThresholdSettings,
  loadDispatchedAlerts,
  getNotificationPermission,
  checkWeatherThresholdsAndNotify,
  sendBrowserNotification,
  type WeatherThresholdSettings,
} from "@/lib/weather-notifications";
import type { Forecast } from "@/lib/weather";
import type { Plant } from "@/hooks/use-plants";

const mockForecast: Forecast = {
  current: {
    time: "2026-10-22T12:00",
    temperature_2m: 22,
    relative_humidity_2m: 55,
    precipitation: 0,
    wind_speed_10m: 15,
  },
  daily: {
    time: ["2026-10-22", "2026-10-23", "2026-10-24"],
    temperature_2m_max: [24, 25, 23],
    temperature_2m_min: [12, 11, 10],
    precipitation_sum: [0, 0, 0],
  },
  hourly: {
    time: Array.from({ length: 48 }, (_, i) => `2026-10-22T${String(i % 24).padStart(2, "0")}:00`),
    temperature_2m: Array.from({ length: 48 }, () => 22),
    relative_humidity_2m: Array.from({ length: 48 }, () => 50),
    precipitation: Array.from({ length: 48 }, () => 0),
    wind_gusts_10m: Array.from({ length: 48 }, () => 20),
  },
};

const mockPlants: Plant[] = [
  {
    id: "p1",
    name: "Northern Lights Outdoor",
    strain: "Northern Lights",
    stage: "Mid-Flower",
    setting: "Outdoor",
    medium: "Living Soil",
    startDate: "2026-08-01",
    potSize: "25L",
    lightCycle: "12/12",
    ecTarget: "1.8",
    phTarget: "6.5",
    logs: [],
  },
  {
    id: "p2",
    name: "Amnesia Greenhouse",
    strain: "Amnesia Haze",
    stage: "Vegetative",
    setting: "Greenhouse",
    medium: "Coco Coir",
    startDate: "2026-09-01",
    potSize: "15L",
    lightCycle: "18/6",
    ecTarget: "1.6",
    phTarget: "5.8",
    logs: [],
  },
];

describe("Weather Push Notifications Service", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("loads default thresholds if none saved in localStorage", () => {
    const settings = loadThresholdSettings();
    expect(settings.enabled).toBe(false);
    expect(settings.heatThresholdC).toBe(32);
    expect(settings.coldThresholdC).toBe(10);
    expect(settings.frostThresholdC).toBe(2);
    expect(settings.windThresholdKmh).toBe(50);
    expect(settings.humidityThresholdPercent).toBe(85);
    expect(settings.targetSetting).toBe("OutdoorAndGreenhouse");
  });

  it("saves and reloads custom threshold settings", () => {
    const custom: WeatherThresholdSettings = {
      enabled: true,
      heatThresholdC: 35,
      coldThresholdC: 8,
      frostThresholdC: 1,
      windThresholdKmh: 60,
      humidityThresholdPercent: 90,
      targetSetting: "Outdoor",
    };

    saveThresholdSettings(custom);
    const reloaded = loadThresholdSettings();
    expect(reloaded.enabled).toBe(true);
    expect(reloaded.heatThresholdC).toBe(35);
    expect(reloaded.targetSetting).toBe("Outdoor");
  });

  it("returns empty dispatched list initially", () => {
    expect(loadDispatchedAlerts()).toEqual([]);
  });

  it("does not trigger notifications if feature is disabled", async () => {
    saveThresholdSettings({ ...DEFAULT_THRESHOLDS, enabled: false });

    const alerts = await checkWeatherThresholdsAndNotify(mockForecast, mockPlants);
    expect(alerts).toHaveLength(0);
  });

  it("triggers frost warning when hourly temperature drops to frost threshold", async () => {
    saveThresholdSettings({ ...DEFAULT_THRESHOLDS, enabled: true });

    // Mock Notification API permission
    Object.defineProperty(window, "Notification", {
      writable: true,
      value: class MockNotification {
        static permission: NotificationPermission = "granted";
        static requestPermission = vi.fn().mockResolvedValue("granted");
        constructor() {}
      },
    });

    const frostForecast: Forecast = {
      ...mockForecast,
      hourly: {
        ...mockForecast.hourly,
        temperature_2m: [20, 15, 10, 1, 0, 5, ...Array(42).fill(20)],
      },
    };

    const alerts = await checkWeatherThresholdsAndNotify(frostForecast, mockPlants);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0]?.type).toBe("frost");
    expect(alerts[0]?.severity).toBe("danger");
    expect(alerts[0]?.vulnerablePlantNames).toContain("Northern Lights Outdoor");

    // Check that alert was saved to dispatched history
    const history = loadDispatchedAlerts();
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0]?.type).toBe("frost");
  });

  it("triggers extreme heat warning when hourly temperature exceeds threshold", async () => {
    saveThresholdSettings({ ...DEFAULT_THRESHOLDS, enabled: true });

    Object.defineProperty(window, "Notification", {
      writable: true,
      value: class MockNotification {
        static permission: NotificationPermission = "granted";
        static requestPermission = vi.fn().mockResolvedValue("granted");
        constructor() {}
      },
    });

    const heatForecast: Forecast = {
      ...mockForecast,
      hourly: {
        ...mockForecast.hourly,
        temperature_2m: [25, 28, 33, 34, 30, ...Array(43).fill(25)],
      },
    };

    const alerts = await checkWeatherThresholdsAndNotify(heatForecast, mockPlants);
    const heatAlert = alerts.find((a) => a.type === "heat");
    expect(heatAlert).toBeDefined();
    expect(heatAlert?.title).toContain("Extreme Heat");
  });

  it("triggers high wind gusts alert when gusts exceed threshold", async () => {
    saveThresholdSettings({ ...DEFAULT_THRESHOLDS, enabled: true });

    Object.defineProperty(window, "Notification", {
      writable: true,
      value: class MockNotification {
        static permission: NotificationPermission = "granted";
        static requestPermission = vi.fn().mockResolvedValue("granted");
        constructor() {}
      },
    });

    const windForecast: Forecast = {
      ...mockForecast,
      hourly: {
        ...mockForecast.hourly,
        wind_gusts_10m: [20, 25, 55, 60, ...Array(44).fill(20)],
      },
    };

    const alerts = await checkWeatherThresholdsAndNotify(windForecast, mockPlants);
    const windAlert = alerts.find((a) => a.type === "wind");
    expect(windAlert).toBeDefined();
    expect(windAlert?.title).toContain("Strong Wind Alert");
  });

  it("triggers mould/bud rot warning when humidity exceeds threshold for 4+ consecutive hours", async () => {
    saveThresholdSettings({ ...DEFAULT_THRESHOLDS, enabled: true });

    Object.defineProperty(window, "Notification", {
      writable: true,
      value: class MockNotification {
        static permission: NotificationPermission = "granted";
        static requestPermission = vi.fn().mockResolvedValue("granted");
        constructor() {}
      },
    });

    const mouldForecast: Forecast = {
      ...mockForecast,
      hourly: {
        ...mockForecast.hourly,
        relative_humidity_2m: [60, 88, 89, 90, 92, 60, ...Array(42).fill(50)],
      },
    };

    const alerts = await checkWeatherThresholdsAndNotify(mouldForecast, mockPlants);
    const humidityAlert = alerts.find((a) => a.type === "humidity");
    expect(humidityAlert).toBeDefined();
    expect(humidityAlert?.title).toContain("Bud Rot & Mould Risk");
  });

  it("respects alert cooldown and prevents re-sending the same alert category within 6 hours", async () => {
    saveThresholdSettings({ ...DEFAULT_THRESHOLDS, enabled: true });

    Object.defineProperty(window, "Notification", {
      writable: true,
      value: class MockNotification {
        static permission: NotificationPermission = "granted";
        static requestPermission = vi.fn().mockResolvedValue("granted");
        constructor() {}
      },
    });

    const frostForecast: Forecast = {
      ...mockForecast,
      hourly: {
        ...mockForecast.hourly,
        temperature_2m: [0, 0, ...Array(46).fill(20)],
      },
    };

    // First call triggers frost
    const firstRun = await checkWeatherThresholdsAndNotify(frostForecast, mockPlants);
    expect(firstRun.length).toBe(1);

    // Immediate second call should be suppressed by cooldown
    const secondRun = await checkWeatherThresholdsAndNotify(frostForecast, mockPlants);
    expect(secondRun.length).toBe(0);
  });
});
