export type Severity = "danger" | "warning" | "info";
export type Alert = { id: string; severity: Severity; title: string; detail: string; when: string };

export type DayWarning = {
  id: string;
  severity: Severity;
  title: string;
  shortLabel: string;
  detail: string;
};

export type DailyForecastDay = {
  date: string;
  dayLabel: string;
  weekdayShort: string;
  shortDate: string;
  tempMax: number;
  tempMin: number;
  precipitationMm: number;
  maxHumidity: number;
  avgHumidity: number;
  maxWindGusts: number;
  maxUvIndex: number;
  warnings: DayWarning[];
};

export type Forecast = {
  current: {
    time?: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    weather_code?: number;
    precipitation?: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    wind_gusts_10m: number[];
    precipitation: number[];
    uv_index?: number[];
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    wind_gusts_10m_max?: number[];
    uv_index_max?: number[];
  };
};

/** Parses YYYY-MM-DD safely at local noon so negative UTC offsets never shift the weekday back. */
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  if (dateStr.includes("T")) return new Date(dateStr);
  const parts = dateStr.split("-").map(Number);
  if (parts.length === 3 && !parts.some((n) => Number.isNaN(n))) {
    return new Date(parts[0]!, parts[1]! - 1, parts[2]!, 12, 0, 0);
  }
  return new Date(dateStr);
}

export async function fetchForecast(lat: number, lon: number): Promise<Forecast> {
  const safeLat = Number.isFinite(lat) ? lat : -36.85;
  const safeLon = Number.isFinite(lon) ? lon : 174.76;

  const fetchWithTimeout = async (targetUrl: string, ms: number) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const response = await fetch(targetUrl, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Weather HTTP ${response.status}`);
      }
      const json = (await response.json()) as Forecast;
      if (!json?.current || !json?.hourly?.time?.length || !json?.daily?.time?.length) {
        throw new Error("Incomplete weather payload");
      }
      return json;
    } finally {
      clearTimeout(timer);
    }
  };

  // Primary: server-side multi-provider weather endpoint (MET Norway + Open-Meteo + wttr.in)
  if (typeof window !== "undefined") {
    try {
      return await fetchWithTimeout(
        `/api/weather?lat=${encodeURIComponent(safeLat)}&lon=${encodeURIComponent(safeLon)}`,
        8000,
      );
    } catch {
      // Fall through to direct browser fetch if proxy route is unavailable
    }
  }

  const openMeteoUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${safeLat}&longitude=${safeLon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
    `&hourly=temperature_2m,relative_humidity_2m,wind_gusts_10m,precipitation,uv_index` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,uv_index_max&forecast_days=7&timezone=auto`;

  return await fetchWithTimeout(openMeteoUrl, 6000);
}

const fmt = (t: string) =>
  new Date(t).toLocaleString(undefined, { weekday: "short", hour: "numeric" });

/** Builds grow-specific alerts from the next 48 hours of forecast. */
export function buildAlerts(f: Forecast): Alert[] {
  const h = f.hourly;
  if (!h || !Array.isArray(h.time) || h.time.length === 0) return [];
  const nowThreshold = Date.now() - 3600_000;
  const foundIdx = h.time.findIndex((t) => new Date(t).getTime() >= nowThreshold);
  const startIdx = foundIdx >= 0 ? foundIdx : 0;
  const endIdx = Math.min(h.time.length, startIdx + 48);
  const alerts: Alert[] = [];
  const first = (pred: (i: number) => boolean) => {
    for (let i = startIdx; i < endIdx; i++) if (pred(i)) return i;
    return -1;
  };

  let i = first((k) => (h.temperature_2m?.[k] ?? 20) <= 2);
  if (i >= 0)
    alerts.push({
      id: "frost",
      severity: "danger",
      title: "Frost risk",
      when: fmt(h.time[i]!),
      detail: `Down to ${h.temperature_2m[i]!}°C. Bring plants inside or cover them overnight.`,
    });
  else if ((i = first((k) => (h.temperature_2m?.[k] ?? 20) < 10)) >= 0)
    alerts.push({
      id: "cold",
      severity: "warning",
      title: "Cold stress",
      when: fmt(h.time[i]!),
      detail: `${h.temperature_2m[i]!}°C expected. Growth slows below 10°C; protect roots and seedlings.`,
    });

  if ((i = first((k) => (h.temperature_2m?.[k] ?? 20) >= 32)) >= 0)
    alerts.push({
      id: "heat",
      severity: (h.temperature_2m[i] ?? 32) >= 36 ? "danger" : "warning",
      title: "Heat stress",
      when: fmt(h.time[i]!),
      detail: `${h.temperature_2m[i]!}°C expected. Water early, add shade cloth.`,
    });

  if ((i = first((k) => (h.wind_gusts_10m?.[k] ?? 0) >= 50)) >= 0)
    alerts.push({
      id: "wind",
      severity: (h.wind_gusts_10m[i] ?? 50) >= 75 ? "danger" : "warning",
      title: "Strong wind gusts",
      when: fmt(h.time[i]!),
      detail: `Gusts to ${Math.round(h.wind_gusts_10m[i]!)} km/h. Stake or tie down branches.`,
    });

  // sustained humidity: 6+ consecutive hours above 85%
  let run = 0;
  for (let k = startIdx; k < endIdx; k++) {
    run = (h.relative_humidity_2m?.[k] ?? 0) >= 85 ? run + 1 : 0;
    if (run === 6) {
      alerts.push({
        id: "mould",
        severity: "warning",
        title: "Bud rot / mould risk",
        when: fmt(h.time[k - 5]!),
        detail: "Humidity above 85% for 6+ hours. Improve airflow, check dense colas.",
      });
      break;
    }
  }

  (f.daily?.precipitation_sum ?? []).slice(0, 2).forEach((mm, d) => {
    if (mm >= 15)
      alerts.push({
        id: `rain${d}`,
        severity: mm >= 30 ? "danger" : "warning",
        title: "Heavy rain",
        when: parseLocalDate(f.daily.time[d] ?? "").toLocaleDateString(undefined, {
          weekday: "long",
        }),
        detail: `${mm} mm expected. Check drainage, skip watering, cover flowering plants.`,
      });
  });

  if ((i = first((k) => (h.uv_index?.[k] ?? 0) >= 9)) >= 0)
    alerts.push({
      id: "uv",
      severity: "info",
      title: "Extreme UV",
      when: fmt(h.time[i]!),
      detail: `UV index ${h.uv_index![i]!}. Watch for leaf bleaching on young plants.`,
    });

  return alerts;
}

/**
 * Builds a 7-day daily forecast breakdown where each day includes all predicted
 * grower weather warnings for that specific day.
 */
export function buildSevenDayForecast(f: Forecast): DailyForecastDay[] {
  const dailyTimes = f.daily?.time ?? [];
  const h = f.hourly;
  const hourlyTimes = h?.time ?? [];

  return dailyTimes.slice(0, 7).map((dateStr, d) => {
    const parsedDate = parseLocalDate(dateStr);
    const weekdayShort = parsedDate.toLocaleDateString(undefined, { weekday: "short" });
    const dayLabel = d === 0 ? "Today" : d === 1 ? "Tomorrow" : weekdayShort;
    const shortDate = parsedDate.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

    // Match hourly indices for this calendar day (YYYY-MM-DD prefix)
    const datePrefix = dateStr.slice(0, 10);
    const matchingHourlyIndices: number[] = [];
    for (let k = 0; k < hourlyTimes.length; k++) {
      if (hourlyTimes[k]?.slice(0, 10) === datePrefix) {
        matchingHourlyIndices.push(k);
      }
    }

    // Fallback to 24-hour slice [d*24, (d+1)*24) if date strings did not match
    if (matchingHourlyIndices.length === 0 && hourlyTimes.length >= (d + 1) * 24) {
      for (let k = d * 24; k < (d + 1) * 24; k++) {
        matchingHourlyIndices.push(k);
      }
    }

    const hourlyTemps = matchingHourlyIndices
      .map((k) => h?.temperature_2m?.[k])
      .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
    const hourlyRh = matchingHourlyIndices
      .map((k) => h?.relative_humidity_2m?.[k])
      .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
    const hourlyWind = matchingHourlyIndices
      .map((k) => h?.wind_gusts_10m?.[k])
      .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
    const hourlyRain = matchingHourlyIndices
      .map((k) => h?.precipitation?.[k])
      .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
    const hourlyUv = matchingHourlyIndices
      .map((k) => h?.uv_index?.[k])
      .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));

    const dailyMaxRaw = f.daily?.temperature_2m_max?.[d];
    const dailyMinRaw = f.daily?.temperature_2m_min?.[d];

    const effectiveMaxTemp = Math.max(
      typeof dailyMaxRaw === "number" && !Number.isNaN(dailyMaxRaw) ? dailyMaxRaw : -Infinity,
      ...(hourlyTemps.length > 0 ? hourlyTemps : [-Infinity]),
    );
    const effectiveMinTemp = Math.min(
      typeof dailyMinRaw === "number" && !Number.isNaN(dailyMinRaw) ? dailyMinRaw : Infinity,
      ...(hourlyTemps.length > 0 ? hourlyTemps : [Infinity]),
    );

    const tempMax = Number.isFinite(effectiveMaxTemp)
      ? Math.round(effectiveMaxTemp)
      : typeof dailyMaxRaw === "number"
        ? Math.round(dailyMaxRaw)
        : 0;
    const tempMin = Number.isFinite(effectiveMinTemp)
      ? Math.round(effectiveMinTemp)
      : typeof dailyMinRaw === "number"
        ? Math.round(dailyMinRaw)
        : 0;

    const dailyRainRaw = f.daily?.precipitation_sum?.[d];
    const hourlyRainSum = hourlyRain.reduce((acc, v) => acc + v, 0);
    const precipitationMm = +(
      typeof dailyRainRaw === "number" && !Number.isNaN(dailyRainRaw)
        ? Math.max(dailyRainRaw, hourlyRainSum)
        : hourlyRainSum
    ).toFixed(1);

    const maxHumidity = hourlyRh.length > 0 ? Math.round(Math.max(...hourlyRh)) : 0;
    const avgHumidity =
      hourlyRh.length > 0
        ? Math.round(hourlyRh.reduce((acc, v) => acc + v, 0) / hourlyRh.length)
        : 0;

    let maxHighRhRun = 0;
    let currentRhRun = 0;
    let highRhHoursCount = 0;
    for (const rh of hourlyRh) {
      if (rh >= 85) {
        currentRhRun += 1;
        highRhHoursCount += 1;
        if (currentRhRun > maxHighRhRun) maxHighRhRun = currentRhRun;
      } else {
        currentRhRun = 0;
      }
    }

    const dailyWindMax = f.daily?.wind_gusts_10m_max?.[d];
    const maxWindGusts = Math.round(
      Math.max(
        typeof dailyWindMax === "number" && !Number.isNaN(dailyWindMax) ? dailyWindMax : 0,
        ...(hourlyWind.length > 0 ? hourlyWind : [0]),
      ),
    );

    const dailyUvMax = f.daily?.uv_index_max?.[d];
    const maxUvIndex = +Math.max(
      typeof dailyUvMax === "number" && !Number.isNaN(dailyUvMax) ? dailyUvMax : 0,
      ...(hourlyUv.length > 0 ? hourlyUv : [0]),
    ).toFixed(1);

    // Collect every weather warning predicted on this day
    const warnings: DayWarning[] = [];

    if (Number.isFinite(effectiveMinTemp) && effectiveMinTemp <= 2) {
      warnings.push({
        id: `frost-${dateStr}`,
        severity: "danger",
        title: "Frost risk",
        shortLabel: `Frost (${Math.round(effectiveMinTemp)}°C)`,
        detail: `Low of ${Math.round(effectiveMinTemp)}°C expected. Cover outdoor plants or move pots inside overnight.`,
      });
    } else if (Number.isFinite(effectiveMinTemp) && effectiveMinTemp < 10) {
      warnings.push({
        id: `cold-${dateStr}`,
        severity: "warning",
        title: "Cold stress",
        shortLabel: `Cold (${Math.round(effectiveMinTemp)}°C)`,
        detail: `Low of ${Math.round(effectiveMinTemp)}°C expected. Nutrient uptake slows below 10°C; insulate root zones.`,
      });
    }

    if (Number.isFinite(effectiveMaxTemp) && effectiveMaxTemp >= 32) {
      const isExtreme = effectiveMaxTemp >= 36;
      warnings.push({
        id: `heat-${dateStr}`,
        severity: isExtreme ? "danger" : "warning",
        title: isExtreme ? "Extreme heat" : "Heat stress",
        shortLabel: `${isExtreme ? "Extreme Heat" : "Heat"} (${Math.round(effectiveMaxTemp)}°C)`,
        detail: `High of ${Math.round(effectiveMaxTemp)}°C expected. Water early in the morning and deploy shade cloth.`,
      });
    }

    if (maxWindGusts >= 50) {
      warnings.push({
        id: `wind-${dateStr}`,
        severity: maxWindGusts >= 75 ? "danger" : "warning",
        title: "Strong wind gusts",
        shortLabel: `Wind (${maxWindGusts} km/h)`,
        detail: `Gusts up to ${maxWindGusts} km/h. Stake heavy colas and reinforce trellis ties.`,
      });
    }

    if (maxHighRhRun >= 4 || highRhHoursCount >= 6) {
      warnings.push({
        id: `mould-${dateStr}`,
        severity: "warning",
        title: "Bud rot / mould risk",
        shortLabel: `Mould Risk (${maxHumidity}% RH)`,
        detail: `Humidity ≥85% for ${Math.max(maxHighRhRun, highRhHoursCount)}+ hrs (peak ${maxHumidity}%). Increase airflow and inspect dense buds.`,
      });
    }

    if (precipitationMm >= 15) {
      warnings.push({
        id: `rain-${dateStr}`,
        severity: precipitationMm >= 30 ? "danger" : "warning",
        title: "Heavy rain",
        shortLabel: `Heavy Rain (${precipitationMm}mm)`,
        detail: `${precipitationMm} mm rain predicted. Check pot drainage, skip manual watering, and shelter flowering tops.`,
      });
    }

    if (maxUvIndex >= 9) {
      warnings.push({
        id: `uv-${dateStr}`,
        severity: "info",
        title: "Extreme UV",
        shortLabel: `Extreme UV (${maxUvIndex})`,
        detail: `Peak UV index of ${maxUvIndex}. Watch young or recently transplanted foliage for light bleaching.`,
      });
    }

    return {
      date: dateStr,
      dayLabel,
      weekdayShort,
      shortDate,
      tempMax,
      tempMin,
      precipitationMm,
      maxHumidity,
      avgHumidity,
      maxWindGusts,
      maxUvIndex,
      warnings,
    };
  });
}
