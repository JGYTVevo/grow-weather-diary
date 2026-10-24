export type Severity = "danger" | "warning" | "info";
export type Alert = { id: string; severity: Severity; title: string; detail: string; when: string };

export type Forecast = {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    wind_gusts_10m?: number;
    weather_code: number;
    apparent_temperature?: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    wind_speed_10m?: number[];
    wind_gusts_10m: number[];
    precipitation: number[];
    precipitation_probability?: number[];
    uv_index: number[];
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max?: number[];
    weather_code?: number[];
    uv_index_max?: number[];
  };
};

export interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
}

export async function fetchForecast(lat: number, lon: number): Promise<Forecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code,apparent_temperature` +
    `&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,precipitation,precipitation_probability,uv_index` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code,uv_index_max&forecast_days=7&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Weather unavailable");
  return r.json();
}

/** Search world cities using free Open-Meteo Geocoding API */
export async function searchLocations(query: string): Promise<GeocodingResult[]> {
  if (!query.trim() || query.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    return data.results || [];
  } catch {
    return [];
  }
}

/** Calculate Vapor Pressure Deficit (VPD) in kPa */
export function calculateVPD(tempC: number, rh: number): number {
  const vpSat = 0.61078 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  const vpAir = vpSat * (rh / 100);
  return Math.max(0, Number((vpSat - vpAir).toFixed(2)));
}

/** VPD Status descriptor for cultivation */
export function getVPDStatus(vpd: number): { label: string; tone: "good" | "warning" | "danger" } {
  if (vpd < 0.4) return { label: "Very Low (High Mould Risk)", tone: "danger" };
  if (vpd <= 0.8) return { label: "Low (Good for Seedlings/Clones)", tone: "good" };
  if (vpd <= 1.2) return { label: "Optimal (Vegetative Growth)", tone: "good" };
  if (vpd <= 1.6) return { label: "Optimal (Flowering)", tone: "good" };
  if (vpd <= 2.0) return { label: "High (Stress/Dry Air)", tone: "warning" };
  return { label: "Extreme Dry (Stomata Closure)", tone: "danger" };
}

/** WMO Weather Code interpreter */
export function getWeatherDescription(code: number): { text: string; icon: string } {
  if (code === 0) return { text: "Clear Sky", icon: "☀️" };
  if (code === 1) return { text: "Mainly Clear", icon: "🌤️" };
  if (code === 2) return { text: "Partly Cloudy", icon: "⛅" };
  if (code === 3) return { text: "Overcast", icon: "☁️" };
  if (code >= 45 && code <= 48) return { text: "Foggy / Mist", icon: "🌫️" };
  if (code >= 51 && code <= 55) return { text: "Drizzle", icon: "🌦️" };
  if (code >= 61 && code <= 65) return { text: "Rain", icon: "🌧️" };
  if (code >= 71 && code <= 77) return { text: "Snow", icon: "🌨️" };
  if (code >= 80 && code <= 82) return { text: "Rain Showers", icon: "🌦️" };
  if (code >= 95 && code <= 99) return { text: "Thunderstorm", icon: "⛈️" };
  return { text: "Variable", icon: "🌥️" };
}

export interface PlantCarePlanning {
  watering: { advice: string; status: "good" | "skip" | "urgent" };
  foliarSpray: { advice: string; status: "ideal" | "caution" | "avoid" };
  protection: { advice: string; needed: boolean };
  mouldRisk: { level: "Low" | "Moderate" | "High"; advice: string };
}

/** Computes customized care planning based on 48h weather conditions */
export function getPlantCareRecommendations(f: Forecast): PlantCarePlanning {
  const currentTemp = f.current.temperature_2m;
  const currentRH = f.current.relative_humidity_2m;
  const next24hRain =
    (f.daily.precipitation_sum[0] || 0) + (f.daily.precipitation_sum[1] || 0) * 0.5;
  const maxWind = Math.max(...(f.hourly.wind_gusts_10m.slice(0, 24) || [f.current.wind_speed_10m]));
  const minTempNext48h = Math.min(...f.hourly.temperature_2m.slice(0, 48));
  const maxTempNext48h = Math.max(...f.hourly.temperature_2m.slice(0, 48));

  // 1. Watering recommendation
  let watering: PlantCarePlanning["watering"] = {
    advice: "Normal watering schedule. Water when top 2 inches of soil feel dry.",
    status: "good",
  };
  if (next24hRain >= 10) {
    watering = {
      advice: `Rain forecasted (${Math.round(next24hRain)} mm). Hold off on outdoor watering to avoid root oversaturation.`,
      status: "skip",
    };
  } else if (maxTempNext48h >= 30) {
    watering = {
      advice:
        "High temperatures ahead. Water deeply in the early morning before peak sun to avoid heat shock.",
      status: "urgent",
    };
  }

  // 2. Foliar spraying recommendation (ideal: calm winds < 15km/h, moderate temp 18-26C, cloudy or dusk)
  let foliarSpray: PlantCarePlanning["foliarSpray"] = {
    advice: "Good conditions for foliar nutrient sprays. Apply near dusk or early dawn.",
    status: "ideal",
  };
  if (maxWind >= 25) {
    foliarSpray = {
      advice: `Winds of ${Math.round(maxWind)} km/h will blow spray away. Wait for calm air.`,
      status: "avoid",
    };
  } else if (currentTemp >= 28) {
    foliarSpray = {
      advice: "High heat can cause leaf burning from foliar droplets. Spray only after sunset.",
      status: "caution",
    };
  }

  // 3. Physical plant protection (frost, heavy winds, hail)
  let protection: PlantCarePlanning["protection"] = {
    advice: "No extreme weather protections needed right now.",
    needed: false,
  };
  if (minTempNext48h <= 2) {
    protection = {
      advice: `Frost risk (${minTempNext48h}°C). Move potted plants indoors or cover with horticultural fleece tonight!`,
      needed: true,
    };
  } else if (maxWind >= 55) {
    protection = {
      advice: `Severe wind gusts (${Math.round(maxWind)} km/h). Stake tall branches and secure greenhouse covers.`,
      needed: true,
    };
  }

  // 4. Mould / Bud rot risk
  let mouldRisk: PlantCarePlanning["mouldRisk"] = {
    level: "Low",
    advice: "Low humidity keeps mould and botrytis risks minimal.",
  };
  if (currentRH >= 80 || next24hRain >= 15) {
    mouldRisk = {
      level: "High",
      advice:
        "Prolonged moisture creates high botrytis/bud rot risk. Maximize airflow and shake morning dew off flowers.",
    };
  } else if (currentRH >= 65) {
    mouldRisk = {
      level: "Moderate",
      advice: "Moderate humidity. Ensure adequate spacing between dense foliage.",
    };
  }

  return { watering, foliarSpray, protection, mouldRisk };
}

const fmt = (t: string) =>
  new Date(t).toLocaleString(undefined, { weekday: "short", hour: "numeric" });

/** Builds grow-specific alerts from the next 48 hours of forecast */
export function buildAlerts(f: Forecast): Alert[] {
  const h = f.hourly;
  const n = Math.min(48, h.time.length);
  const alerts: Alert[] = [];
  const first = (pred: (i: number) => boolean) => {
    for (let i = 0; i < n; i++) if (pred(i)) return i;
    return -1;
  };

  let i = first((k) => (h.temperature_2m[k] ?? 99) <= 2);
  if (i >= 0)
    alerts.push({
      id: "frost",
      severity: "danger",
      title: "Frost risk",
      when: fmt(h.time[i]!),
      detail: `Down to ${h.temperature_2m[i]!}°C. Bring plants inside or cover them overnight.`,
    });
  else if ((i = first((k) => (h.temperature_2m[k] ?? 99) < 10)) >= 0)
    alerts.push({
      id: "cold",
      severity: "warning",
      title: "Cold stress",
      when: fmt(h.time[i]!),
      detail: `${h.temperature_2m[i]!}°C expected. Growth slows below 10°C; protect roots and seedlings.`,
    });

  if ((i = first((k) => (h.temperature_2m[k] ?? 0) >= 32)) >= 0)
    alerts.push({
      id: "heat",
      severity: (h.temperature_2m[i] ?? 0) >= 36 ? "danger" : "warning",
      title: "Heat stress",
      when: fmt(h.time[i]!),
      detail: `${h.temperature_2m[i]!}°C expected. Water early, add shade cloth.`,
    });

  if ((i = first((k) => (h.wind_gusts_10m[k] ?? 0) >= 50)) >= 0)
    alerts.push({
      id: "wind",
      severity: (h.wind_gusts_10m[i] ?? 0) >= 75 ? "danger" : "warning",
      title: "Strong wind gusts",
      when: fmt(h.time[i]!),
      detail: `Gusts to ${Math.round(h.wind_gusts_10m[i]!)} km/h. Stake or tie down branches.`,
    });

  // sustained humidity: 6+ consecutive hours above 85%
  let run = 0;
  for (let k = 0; k < n; k++) {
    run = (h.relative_humidity_2m[k] ?? 0) >= 85 ? run + 1 : 0;
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

  f.daily.precipitation_sum.slice(0, 2).forEach((mm, d) => {
    if (mm >= 15)
      alerts.push({
        id: `rain${d}`,
        severity: mm >= 30 ? "danger" : "warning",
        title: "Heavy rain",
        when: new Date(f.daily.time[d]!).toLocaleDateString(undefined, { weekday: "long" }),
        detail: `${mm} mm expected. Check drainage, skip watering, cover flowering plants.`,
      });
  });

  if ((i = first((k) => (h.uv_index[k] ?? 0) >= 9)) >= 0)
    alerts.push({
      id: "uv",
      severity: "info",
      title: "Extreme UV",
      when: fmt(h.time[i]!),
      detail: `UV index ${h.uv_index[i]!}. Watch for leaf bleaching on young plants.`,
    });

  return alerts;
}
