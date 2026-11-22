import type { Forecast } from "../lib/weather";

export interface WeatherServerResponse extends Forecast {
  provider: "open-meteo" | "met-no" | "wttr" | "seasonal-fallback";
  cached?: boolean;
}

const WEATHER_CACHE = new Map<string, { data: WeatherServerResponse; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function toIsoLocalHour(utcMs: number, offsetHours: number): string {
  const shifted = new Date(utcMs + offsetHours * 3600_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:00`;
}

function estimateOffsetHours(lon: number): number {
  // For NZ longitudes (~166 to 179), standard/daylight offset is +12/+13; general formula works globally
  if (lon >= 165 && lon <= 179.9) return 13;
  return Math.max(-12, Math.min(14, Math.round(lon / 15)));
}

async function fetchFromOpenMeteo(lat: number, lon: number): Promise<WeatherServerResponse> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
    `&hourly=temperature_2m,relative_humidity_2m,wind_gusts_10m,precipitation,uv_index` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,uv_index_max&forecast_days=7&timezone=auto`;

  const res = await fetch(url, {
    headers: { "User-Agent": "CanopyGrowDiary/1.0" },
    signal: AbortSignal.timeout(4500),
  });

  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }

  const json = (await res.json()) as Forecast;
  if (!json?.current || !json?.hourly?.time?.length || !json?.daily?.time?.length) {
    throw new Error("Open-Meteo returned incomplete forecast payload");
  }

  return {
    ...json,
    provider: "open-meteo",
  };
}

interface MetNoTimeseriesEntry {
  time: string;
  data: {
    instant?: {
      details?: {
        air_temperature?: number;
        relative_humidity?: number;
        wind_speed?: number;
        wind_speed_of_gust?: number;
        cloud_area_fraction?: number;
      };
    };
    next_1_hours?: {
      details?: { precipitation_amount?: number };
    };
    next_6_hours?: {
      details?: { precipitation_amount?: number };
    };
  };
}

async function fetchFromMetNo(lat: number, lon: number): Promise<WeatherServerResponse> {
  const roundedLat = lat.toFixed(4);
  const roundedLon = lon.toFixed(4);
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${roundedLat}&lon=${roundedLon}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "CanopyGrowDiary/1.0 (https://github.com/canopy-grow-diary)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(5500),
  });

  if (!res.ok) {
    throw new Error(`MET.no HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    properties?: { timeseries?: MetNoTimeseriesEntry[] };
  };
  const ts = json?.properties?.timeseries;
  if (!Array.isArray(ts) || ts.length < 12) {
    throw new Error("MET.no returned empty timeseries");
  }

  const offsetHours = estimateOffsetHours(lon);

  // Build parsed points
  const rawPoints = ts.map((entry) => {
    const ms = new Date(entry.time).getTime();
    const details = entry.data.instant?.details ?? {};
    const temp = typeof details.air_temperature === "number" ? details.air_temperature : 18;
    const rh = typeof details.relative_humidity === "number" ? details.relative_humidity : 65;
    const windMs = typeof details.wind_speed === "number" ? details.wind_speed : 3;
    const windKmh = +(windMs * 3.6).toFixed(1);
    const gustKmh =
      typeof details.wind_speed_of_gust === "number"
        ? +(details.wind_speed_of_gust * 3.6).toFixed(1)
        : +(windKmh * 1.45).toFixed(1);
    const cloud =
      typeof details.cloud_area_fraction === "number" ? details.cloud_area_fraction : 40;

    let precip1h = 0;
    if (typeof entry.data.next_1_hours?.details?.precipitation_amount === "number") {
      precip1h = entry.data.next_1_hours.details.precipitation_amount;
    } else if (typeof entry.data.next_6_hours?.details?.precipitation_amount === "number") {
      precip1h = +(entry.data.next_6_hours.details.precipitation_amount / 6).toFixed(2);
    }

    // Approximate daytime UV index from solar hour & cloud cover
    const localHour = new Date(ms + offsetHours * 3600_000).getUTCHours();
    let uv = 0;
    if (localHour >= 8 && localHour <= 18) {
      const noonFactor = Math.max(0, 1 - Math.abs(localHour - 13) / 5.5);
      const latFactor = Math.max(0.3, 1 - Math.abs(Math.abs(lat) - 20) / 70);
      const cloudFactor = 1 - (cloud / 100) * 0.65;
      uv = +(10.5 * noonFactor * latFactor * cloudFactor).toFixed(1);
    }

    return { ms, temp, rh, windKmh, gustKmh, precip1h, uv };
  });

  // Expand into contiguous 1-hour series for 7 full days (168 hours)
  const startMs = rawPoints[0]!.ms;
  const hourlyTime: string[] = [];
  const hourlyTemp: number[] = [];
  const hourlyRh: number[] = [];
  const hourlyGust: number[] = [];
  const hourlyPrecip: number[] = [];
  const hourlyUv: number[] = [];

  for (let h = 0; h < 168; h++) {
    const targetMs = startMs + h * 3600_000;
    // Find surrounding points
    let p0 = rawPoints[0]!;
    let p1 = rawPoints[rawPoints.length - 1]!;
    for (let idx = 0; idx < rawPoints.length - 1; idx++) {
      if (rawPoints[idx]!.ms <= targetMs && rawPoints[idx + 1]!.ms >= targetMs) {
        p0 = rawPoints[idx]!;
        p1 = rawPoints[idx + 1]!;
        break;
      }
    }
    if (targetMs >= rawPoints[rawPoints.length - 1]!.ms) {
      p0 = rawPoints[rawPoints.length - 1]!;
      p1 = p0;
    }

    const span = p1.ms - p0.ms;
    const ratio = span > 0 ? Math.max(0, Math.min(1, (targetMs - p0.ms) / span)) : 0;

    hourlyTime.push(toIsoLocalHour(targetMs, offsetHours));
    hourlyTemp.push(+(p0.temp + (p1.temp - p0.temp) * ratio).toFixed(1));
    hourlyRh.push(Math.round(p0.rh + (p1.rh - p0.rh) * ratio));
    hourlyGust.push(+(p0.gustKmh + (p1.gustKmh - p0.gustKmh) * ratio).toFixed(1));
    hourlyPrecip.push(+(p0.precip1h + (p1.precip1h - p0.precip1h) * ratio).toFixed(1));

    const localHour = new Date(targetMs + offsetHours * 3600_000).getUTCHours();
    if (localHour < 7 || localHour > 19) {
      hourlyUv.push(0);
    } else {
      hourlyUv.push(+(p0.uv + (p1.uv - p0.uv) * ratio).toFixed(1));
    }
  }

  // Group hourly points into 7 local calendar days
  const dayBuckets = new Map<
    string,
    { temps: number[]; precip: number; gusts: number[]; uvs: number[] }
  >();
  for (let i = 0; i < hourlyTime.length; i++) {
    const dayKey = hourlyTime[i]!.slice(0, 10);
    const bucket = dayBuckets.get(dayKey) ?? { temps: [], precip: 0, gusts: [], uvs: [] };
    bucket.temps.push(hourlyTemp[i]!);
    bucket.precip += hourlyPrecip[i]!;
    bucket.gusts.push(hourlyGust[i]!);
    bucket.uvs.push(hourlyUv[i]!);
    dayBuckets.set(dayKey, bucket);
  }

  const dailyKeys = Array.from(dayBuckets.keys()).slice(0, 7);
  const first = rawPoints[0]!;

  return {
    provider: "met-no",
    current: {
      time: hourlyTime[0],
      temperature_2m: first.temp,
      relative_humidity_2m: Math.round(first.rh),
      wind_speed_10m: first.windKmh,
      precipitation: first.precip1h,
    },
    hourly: {
      time: hourlyTime,
      temperature_2m: hourlyTemp,
      relative_humidity_2m: hourlyRh,
      wind_gusts_10m: hourlyGust,
      precipitation: hourlyPrecip,
      uv_index: hourlyUv,
    },
    daily: {
      time: dailyKeys,
      temperature_2m_max: dailyKeys.map((k) => +Math.max(...dayBuckets.get(k)!.temps).toFixed(1)),
      temperature_2m_min: dailyKeys.map((k) => +Math.min(...dayBuckets.get(k)!.temps).toFixed(1)),
      precipitation_sum: dailyKeys.map((k) => +dayBuckets.get(k)!.precip.toFixed(1)),
      wind_gusts_10m_max: dailyKeys.map((k) => Math.round(Math.max(...dayBuckets.get(k)!.gusts))),
      uv_index_max: dailyKeys.map((k) => +Math.max(...dayBuckets.get(k)!.uvs).toFixed(1)),
    },
  };
}

async function fetchFromWttr(lat: number, lon: number): Promise<WeatherServerResponse> {
  const url = `https://wttr.in/${lat.toFixed(2)},${lon.toFixed(2)}?format=j1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "CanopyGrowDiary/1.0" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`wttr.in HTTP ${res.status}`);

  const json = (await res.json()) as {
    current_condition?: Array<{
      temp_C?: string;
      humidity?: string;
      windspeedKmph?: string;
      precipMM?: string;
    }>;
    weather?: Array<{
      date?: string;
      maxtempC?: string;
      mintempC?: string;
      uvIndex?: string;
      hourly?: Array<{
        time?: string;
        tempC?: string;
        humidity?: string;
        WindGustKmph?: string;
        precipMM?: string;
        uvIndex?: string;
      }>;
    }>;
  };

  const cur = json?.current_condition?.[0];
  const days = json?.weather;
  if (!cur || !Array.isArray(days) || days.length === 0) {
    throw new Error("wttr.in returned incomplete payload");
  }

  const hourlyTime: string[] = [];
  const hourlyTemp: number[] = [];
  const hourlyRh: number[] = [];
  const hourlyGust: number[] = [];
  const hourlyPrecip: number[] = [];
  const hourlyUv: number[] = [];

  for (const day of days) {
    const dateStr = day.date || new Date().toISOString().slice(0, 10);
    const blocks = day.hourly ?? [];
    for (let h = 0; h < 24; h++) {
      const blockIdx = Math.min(blocks.length - 1, Math.floor(h / 3));
      const b = blocks[blockIdx];
      hourlyTime.push(`${dateStr}T${String(h).padStart(2, "0")}:00`);
      hourlyTemp.push(Number(b?.tempC ?? cur.temp_C ?? 20));
      hourlyRh.push(Number(b?.humidity ?? cur.humidity ?? 60));
      hourlyGust.push(Number(b?.WindGustKmph ?? cur.windspeedKmph ?? 15));
      hourlyPrecip.push(+(Number(b?.precipMM ?? 0) / 3).toFixed(1));
      hourlyUv.push(Number(b?.uvIndex ?? day.uvIndex ?? 4));
    }
  }

  return {
    provider: "wttr",
    current: {
      time: hourlyTime[0],
      temperature_2m: Number(cur.temp_C ?? 20),
      relative_humidity_2m: Number(cur.humidity ?? 60),
      wind_speed_10m: Number(cur.windspeedKmph ?? 15),
      precipitation: Number(cur.precipMM ?? 0),
    },
    hourly: {
      time: hourlyTime,
      temperature_2m: hourlyTemp,
      relative_humidity_2m: hourlyRh,
      wind_gusts_10m: hourlyGust,
      precipitation: hourlyPrecip,
      uv_index: hourlyUv,
    },
    daily: {
      time: days.map((d) => d.date || new Date().toISOString().slice(0, 10)),
      temperature_2m_max: days.map((d) => Number(d.maxtempC ?? 23)),
      temperature_2m_min: days.map((d) => Number(d.mintempC ?? 13)),
      precipitation_sum: days.map(
        (d) => +(d.hourly ?? []).reduce((acc, b) => acc + Number(b.precipMM ?? 0), 0).toFixed(1),
      ),
      wind_gusts_10m_max: days.map((d) =>
        Math.max(10, ...(d.hourly ?? []).map((b) => Number(b.WindGustKmph ?? 15))),
      ),
      uv_index_max: days.map((d) => Number(d.uvIndex ?? 5)),
    },
  };
}

export async function handleWeatherRequest(
  lat: number,
  lon: number,
): Promise<WeatherServerResponse> {
  const safeLat = Number.isFinite(lat) ? Math.max(-90, Math.min(90, lat)) : -36.85;
  const safeLon = Number.isFinite(lon) ? Math.max(-180, Math.min(180, lon)) : 174.76;
  const cacheKey = `${safeLat.toFixed(2)},${safeLon.toFixed(2)}`;

  const cached = WEATHER_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.data, cached: true };
  }

  // Try MET.no and Open-Meteo in parallel (first valid wins), with wttr.in as fallback
  const providers: Array<() => Promise<WeatherServerResponse>> = [
    () => fetchFromMetNo(safeLat, safeLon),
    () => fetchFromOpenMeteo(safeLat, safeLon),
    () => fetchFromWttr(safeLat, safeLon),
  ];

  let result: WeatherServerResponse | null = null;
  try {
    result = await Promise.any([providers[0]!(), providers[1]!()]);
  } catch {
    try {
      result = await providers[2]!();
    } catch (err) {
      console.error("All live weather providers failed:", err);
    }
  }

  if (result) {
    WEATHER_CACHE.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return result;
  }

  throw new Error("Live weather providers are currently unreachable. Please try again shortly.");
}
