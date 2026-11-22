import { describe, expect, it } from "vitest";
import { handleDiagnosePlant } from "@/server/diagnose";
import { handlePlantAdvice } from "@/server/advice";
import { buildPlantJournalSummary } from "@/lib/journal-context";

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

  it("links Purple Trainwreck's journal (Living Soil In the Ground, trained, fed, and watered) to AI Doctor and AI Grow Coach", async () => {
    const purpleTrainwreck = {
      id: "pt-1",
      name: "Purple Trainwreck",
      strain: "Purple Trainwreck",
      stage: "Vegetative" as const,
      medium: "Living soil (In the ground)" as const,
      setting: "Outdoor" as const,
      type: "Photoperiod" as const,
      plantedDate: "2026-09-15",
      stageChangedDate: "2026-10-01",
      logs: [
        {
          id: "log-1",
          date: new Date().toISOString().slice(0, 10),
          type: "training" as const,
          technique: "LST" as const,
          note: "Anchored main branches wide",
        },
        {
          id: "log-2",
          date: new Date().toISOString().slice(0, 10),
          type: "feed" as const,
          amount: "2.0",
          nutrients: "Comfrey & Worm Tea (1:10)",
          note: "Fed living soil bed",
        },
        {
          id: "log-3",
          date: new Date().toISOString().slice(0, 10),
          type: "water" as const,
          amount: "2.5",
          note: "Deep soak under straw mulch",
        },
      ],
    };

    const summary = buildPlantJournalSummary(purpleTrainwreck);
    expect(summary).not.toBeNull();
    expect(summary?.isLivingSoil).toBe(true);
    expect(summary?.isInGround).toBe(true);
    expect(summary?.medium).toBe("Living Soil (In the Ground)");
    expect(summary?.trainingTechniques).toContain("LST");

    const diagResult = await handleDiagnosePlant({
      imageBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      plantName: purpleTrainwreck.name,
      stage: summary?.stage,
      medium: summary?.medium,
      journalContext: {
        setting: summary?.setting,
        medium: summary?.medium,
        isLivingSoil: summary?.isLivingSoil,
        isInGround: summary?.isInGround,
        ageDays: summary?.ageDays,
        stageDays: summary?.stageDays,
        trainingSummary: summary?.trainingSummary,
        recentWaterSummary: summary?.recentWaterSummary,
        recentFeedsSummary: summary?.recentFeedsSummary,
        journalContextBadges: summary?.journalContextBadges,
        promptBlock: summary?.promptBlock,
      },
      metrics: {
        healthyGreenRatio: 0.45,
        yellowRatio: 0.25,
        brownRatio: 0.02,
      },
    });

    expect(diagResult.journalContextUsed).toBeDefined();
    expect(diagResult.journalContextUsed?.join(" ")).toContain("Living Soil (In the Ground)");
    expect(diagResult.actionPlan.join(" ").toLowerCase()).not.toContain("lift the pot");
    expect(diagResult.actionPlan.join(" ").toLowerCase()).toContain("living soil");

    const adviceResult = await handlePlantAdvice({
      imageBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      plantName: purpleTrainwreck.name,
      stage: summary?.stage,
      medium: summary?.medium,
      journalContext: {
        setting: summary?.setting,
        medium: summary?.medium,
        isLivingSoil: summary?.isLivingSoil,
        isInGround: summary?.isInGround,
        trainingSummary: summary?.trainingSummary,
        recentWaterSummary: summary?.recentWaterSummary,
        recentFeedsSummary: summary?.recentFeedsSummary,
        journalContextBadges: summary?.journalContextBadges,
        promptBlock: summary?.promptBlock,
      },
      metrics: {
        healthyGreenRatio: 0.8,
        yellowRatio: 0.04,
        brownRatio: 0.01,
      },
    });

    expect(adviceResult.journalContextUsed).toBeDefined();
    expect(adviceResult.watering.liftCheckAdvice.toLowerCase()).not.toContain("lift the pot");
    expect(adviceResult.lst.steps.join(" ").toLowerCase()).toContain("ground");
  });

  it("throws error if no image data is supplied", async () => {
    await expect(
      handleDiagnosePlant({
        images: [],
      }),
    ).rejects.toThrow("No image data provided for diagnosis.");
  });
});
