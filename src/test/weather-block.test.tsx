import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { WeatherBlock } from "@/components/WeatherBlock";
import { fetchForecast, type Forecast } from "@/lib/weather";
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
    type: "Photoperiod",
    stage: "Flowering",
    setting: "Outdoor",
    medium: "Living Soil",
    started: "2026-08-01",
    stageStarted: "2026-09-15",
    logs: [],
  },
];

describe("WeatherBlock & /api/weather resilience", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("fetchForecast calls /api/weather first and falls back to Open-Meteo on error", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: "proxy down" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockForecast,
      } as Response);

    const result = await fetchForecast(-36.85, 174.76);
    expect(result.current.temperature_2m).toBe(22);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/api/weather?lat=-36.85&lon=174.76");
    expect(String(fetchSpy.mock.calls[1]?.[0])).toContain("api.open-meteo.com");
  });

  it("renders WeatherBlock immediately even when browser geolocation hangs and shows Retry on fetch failure", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn(),
      },
    });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: "temporary error" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: "temporary error" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...mockForecast,
          current: {
            ...mockForecast.current,
            temperature_2m: 23,
            relative_humidity_2m: 58,
            wind_speed_10m: 14,
          },
        }),
      } as Response);

    render(<WeatherBlock plants={mockPlants} />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/23°/).length).toBeGreaterThan(0);
      expect(screen.getByText(/Humidity 58%/)).toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
