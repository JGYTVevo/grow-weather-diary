export type Severity = "danger" | "warning" | "info";
export type Alert = { id: string; severity: Severity; title: string; detail: string; when: string };

export type Forecast = {
  current: { temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number };
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    wind_gusts_10m: number[];
    precipitation: number[];
    uv_index: number[];
  };
  daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_sum: number[] };
};

export async function fetchForecast(lat: number, lon: number): Promise<Forecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
    `&hourly=temperature_2m,relative_humidity_2m,wind_gusts_10m,precipitation,uv_index` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=3&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Weather unavailable");
  return r.json();
}

const fmt = (t: string) =>
  new Date(t).toLocaleString(undefined, { weekday: "short", hour: "numeric" });

/** Builds grow-specific alerts from the next 48 hours of forecast. */
export function buildAlerts(f: Forecast): Alert[] {
  const h = f.hourly;
  const n = Math.min(48, h.time.length);
  const alerts: Alert[] = [];
  const first = (pred: (i: number) => boolean) => {
    for (let i = 0; i < n; i++) if (pred(i)) return i;
    return -1;
  };

  let i = first((k) => h.temperature_2m[k] <= 2);
  if (i >= 0)
    alerts.push({ id: "frost", severity: "danger", title: "Frost risk", when: fmt(h.time[i]),
      detail: `Down to ${h.temperature_2m[i]}°C. Bring plants inside or cover them overnight.` });
  else if ((i = first((k) => h.temperature_2m[k] < 10)) >= 0)
    alerts.push({ id: "cold", severity: "warning", title: "Cold stress", when: fmt(h.time[i]),
      detail: `${h.temperature_2m[i]}°C expected. Growth slows below 10°C; protect roots and seedlings.` });

  if ((i = first((k) => h.temperature_2m[k] >= 32)) >= 0)
    alerts.push({ id: "heat", severity: h.temperature_2m[i] >= 36 ? "danger" : "warning", title: "Heat stress",
      when: fmt(h.time[i]), detail: `${h.temperature_2m[i]}°C expected. Water early, add shade cloth.` });

  if ((i = first((k) => h.wind_gusts_10m[k] >= 50)) >= 0)
    alerts.push({ id: "wind", severity: h.wind_gusts_10m[i] >= 75 ? "danger" : "warning", title: "Strong wind gusts",
      when: fmt(h.time[i]), detail: `Gusts to ${Math.round(h.wind_gusts_10m[i])} km/h. Stake or tie down branches.` });

  // sustained humidity: 6+ consecutive hours above 85%
  let run = 0;
  for (let k = 0; k < n; k++) {
    run = h.relative_humidity_2m[k] >= 85 ? run + 1 : 0;
    if (run === 6) {
      alerts.push({ id: "mould", severity: "warning", title: "Bud rot / mould risk", when: fmt(h.time[k - 5]),
        detail: "Humidity above 85% for 6+ hours. Improve airflow, check dense colas." });
      break;
    }
  }

  f.daily.precipitation_sum.slice(0, 2).forEach((mm, d) => {
    if (mm >= 15)
      alerts.push({ id: `rain${d}`, severity: mm >= 30 ? "danger" : "warning", title: "Heavy rain",
        when: new Date(f.daily.time[d]).toLocaleDateString(undefined, { weekday: "long" }),
        detail: `${mm} mm expected. Check drainage, skip watering, cover flowering plants.` });
  });

  if ((i = first((k) => h.uv_index[k] >= 9)) >= 0)
    alerts.push({ id: "uv", severity: "info", title: "Extreme UV", when: fmt(h.time[i]),
      detail: `UV index ${h.uv_index[i]}. Watch for leaf bleaching on young plants.` });

  return alerts;
}
