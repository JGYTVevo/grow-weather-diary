import { describe, expect, it } from "vitest";
import { evaluateDefoliationHeuristics } from "@/server/defoliation";
import { SAMPLE_LST_COMPARISON, loadSavedLstComparisons } from "@/lib/lst-comparison";

describe("Cultivation Tools: Defoliation & LST Slider", () => {
  it("evaluates defoliation heuristics accurately for Day 1 Flowering", () => {
    const result = evaluateDefoliationHeuristics({
      imageBase64: "dummyBase64",
      plantName: "Gorilla Glue",
      stage: "Day 1 Flower",
      plantType: "Photoperiod",
      metrics: {
        canopyCoverageEstimate: 80,
        healthyGreenRatio: 0.72,
        darkGreenRatio: 0.1,
      },
    });

    expect(result.schwazzingReadiness).toBe("Prime Window: Day 1 Flower");
    expect(result.canopyDensityRating).toBe("Dense");
    expect(result.recommendedRemovalPercent).toContain("25%");
    expect(result.zones).toHaveLength(3);
    expect(result.recoveryProtocol.lightAdjustment).toBeDefined();
  });

  it("prevents destructive defoliation on seedlings", () => {
    const result = evaluateDefoliationHeuristics({
      imageBase64: "dummyBase64",
      plantName: "Young Sprout",
      stage: "Seedling",
      plantType: "Autoflower",
    });

    expect(result.schwazzingReadiness).toBe("Not Recommended Now (Too Early / Late)");
    expect(result.recommendedRemovalPercent).toBe("0%");
  });

  it("evaluates trichome ripeness and harvest window for Peak THC window", async () => {
    const { evaluateTrichomeHeuristics } = await import("@/server/trichome");
    const result = evaluateTrichomeHeuristics({
      imageBase64: "dummyBase64",
      plantName: "Northern Lights",
      flowerWeek: "Week 8 Flower",
      metrics: {
        whiteRatio: 0.7,
        amberRatio: 0.15,
        clearRatio: 0.1,
      },
    });

    expect(result.cloudyPercent).toBeGreaterThanOrEqual(60);
    expect(result.amberPercent).toBeGreaterThanOrEqual(10);
    expect(result.harvestWindowStatus).toContain("Peak THC");
    expect(result.flushRecommendation.status).toBe("Ready for Chop");
    expect(result.estimatedDaysToHarvest).toBeDefined();
  });

  it("identifies premature trichomes in early flower", async () => {
    const { evaluateTrichomeHeuristics } = await import("@/server/trichome");
    const result = evaluateTrichomeHeuristics({
      imageBase64: "dummyBase64",
      plantName: "Young Flower",
      flowerWeek: "Week 5 Flower",
      metrics: {
        clearRatio: 0.65,
      },
    });

    expect(result.clearPercent).toBeGreaterThanOrEqual(50);
    expect(result.harvestWindowStatus).toContain("Too Early");
    expect(result.flushRecommendation.status).toBe("Continue Feeding");
  });

  it("loads default sample LST comparison successfully", () => {
    expect(SAMPLE_LST_COMPARISON.technique).toBe("LST");
    expect(SAMPLE_LST_COMPARISON.beforePhoto).toBeDefined();
    expect(SAMPLE_LST_COMPARISON.afterPhoto).toBeDefined();

    const comparisons = loadSavedLstComparisons();
    expect(comparisons.length).toBeGreaterThan(0);
    expect(comparisons[0]?.title).toBeDefined();
  });
});
