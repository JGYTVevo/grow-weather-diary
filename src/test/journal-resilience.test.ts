import { describe, it, expect } from "vitest";
import { sanitizePlant, sanitizeLog, uid, today, type Plant, type Log } from "../hooks/use-plants";

describe("Journal and Plant Data Resilience", () => {
  it("sanitizes plant with undefined and missing properties", () => {
    const raw: Partial<Plant> = {
      name: "   Northern Lights #5   ",
      started: "2026-03-01",
      logs: undefined,
      cover: undefined,
    };

    const plant = sanitizePlant(raw, "user-123");
    expect(plant.name).toBe("Northern Lights #5");
    expect(plant.userId).toBe("user-123");
    expect(plant.logs).toEqual([]);
    expect(plant.stage).toBe("Germination");
    expect(plant.started).toBe("2026-03-01");
    expect(plant.stageStarted).toBe("2026-03-01");
    // Ensure cover is not undefined in the output object keys
    expect(Object.prototype.hasOwnProperty.call(plant, "cover")).toBe(false);
  });

  it("sanitizes logs with undefined optional fields and ensures no undefined values", () => {
    const rawLog: Partial<Log> = {
      type: "water",
      amount: "1.5L",
      ph: "6.2",
      ec: undefined,
      technique: undefined,
      photo: undefined,
      note: undefined,
      temp: undefined,
      humidity: undefined,
      height: undefined,
    };

    const log = sanitizeLog(rawLog);
    expect(log.type).toBe("water");
    expect(log.amount).toBe("1.5L");
    expect(log.ph).toBe("6.2");
    expect(log.date).toBe(today());
    expect(typeof log.id).toBe("string");

    // Keys with undefined should not be present
    expect(Object.prototype.hasOwnProperty.call(log, "ec")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(log, "photo")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(log, "note")).toBe(false);
  });

  it("safely sorts logs without crashing when dates are missing or invalid", () => {
    const logs: Partial<Log>[] = [
      { id: "1", date: "2026-03-05", type: "note", note: "Middle" },
      { id: "2", date: undefined, type: "water", note: "No date" },
      { id: "3", date: "2026-03-10", type: "feed", note: "Latest" },
      { id: "4", date: "", type: "training", note: "Empty date" },
    ];

    const sanitized = logs.map(sanitizeLog);
    expect(() => {
      sanitized.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    }).not.toThrow();

    // Logs without date get today() automatically, which is sorted before 2026-03-10
    expect(sanitized[0]?.date).toBe(today());
  });

  it("strips invalid characters from plant ID for Firestore compliance", () => {
    const raw: Partial<Plant> = {
      id: "plant/evil$id!#123",
      name: "Gorilla Glue",
    };

    const plant = sanitizePlant(raw);
    expect(plant.id).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(plant.id).toBe("plantevilid123");
  });

  it("safely serializes to JSON without circular references or functions", () => {
    const plant = sanitizePlant({
      name: "Blue Dream",
      logs: [
        sanitizeLog({ type: "water", amount: "2L" }),
        sanitizeLog({ type: "note", note: "Healthy fan leaves" }),
      ],
    });

    const json = JSON.stringify(plant);
    expect(json).toBeTruthy();
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("Blue Dream");
    expect(parsed.logs.length).toBe(2);
  });
});
