import { describe, expect, it } from "vitest";
import { handleDiagnosePlant } from "@/server/diagnose";

describe("AI Doctor Multi-Photo & Macro Inspection", () => {
  it("processes a multi-photo diagnosis with canopy and macro underside angles", async () => {
    const result = await handleDiagnosePlant({
      plantName: "Northern Lights",
      stage: "Late Bloom",
      medium: "Soil",
      images: [
        {
          imageBase64:
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          slot: "canopy",
          label: "Canopy View",
          metrics: {
            healthyGreenRatio: 0.7,
            yellowRatio: 0.1,
            brownRatio: 0.02,
          },
        },
        {
          imageBase64:
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          slot: "macro",
          label: "Macro Leaf Underside",
          metrics: {
            healthyGreenRatio: 0.5,
            yellowRatio: 0.25,
            brownRatio: 0.15,
          },
        },
      ],
    });

    expect(result).toBeDefined();
    expect(result.photosAnalyzed).toBe(2);
    expect(result.condition).toBeDefined();
    expect(result.actionPlan.length).toBeGreaterThan(0);
    expect(result.symptoms.length).toBeGreaterThan(0);
    // Spotting in the macro shot should be caught and reflected in severity or health score
    expect(result.healthScore).toBeLessThanOrEqual(95);
  });

  it("handles backwards-compatible single imageBase64 payload", async () => {
    const result = await handleDiagnosePlant({
      imageBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      plantName: "OG Kush",
      stage: "Vegetative",
      medium: "Coco Coir",
      metrics: {
        healthyGreenRatio: 0.85,
        yellowRatio: 0.05,
        brownRatio: 0.01,
      },
    });

    expect(result).toBeDefined();
    expect(result.photosAnalyzed).toBe(1);
    expect(result.isHealthy).toBe(true);
    expect(result.healthScore).toBeGreaterThanOrEqual(80);
  });

  it("provides scientific evidence and verified horticultural benchmarks", async () => {
    const result = await handleDiagnosePlant({
      imageBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      plantName: "Amnesia Haze",
      stage: "Vegetative",
      medium: "Soil",
      metrics: {
        healthyGreenRatio: 0.8,
        yellowRatio: 0.08,
        brownRatio: 0.02,
      },
    });

    expect(result.scientificEvidence).toBeDefined();
    expect(result.scientificEvidence?.targetPH.soil).toContain("pH");
    expect(result.scientificEvidence?.targetPH.cocoHydro).toContain("pH");
    expect(result.scientificEvidence?.targetEC).toBeDefined();
    expect(result.scientificEvidence?.pathologyReasoning.length).toBeGreaterThan(10);
  });

  it("throws error if no image data is supplied", async () => {
    await expect(
      handleDiagnosePlant({
        images: [],
      }),
    ).rejects.toThrow("No image data provided for diagnosis.");
  });
});
