import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { handleGrowthVisualize } from "@/server/growth-visualizer";
import { buildDailyGrowthTimeline, type FertilizerScheduleEntry } from "@/lib/growth-visualizer";
import { GrowthVisualizer } from "@/components/GrowthVisualizer";
import type { Plant } from "@/hooks/use-plants";
import type { HomemadeFertilizer } from "@/hooks/use-fertilizers";

const samplePlants: Plant[] = [
  {
    id: "p-ptw",
    name: "Purple Trainwreck",
    strain: "Purple Trainwreck",
    type: "Photoperiod",
    stage: "Vegetative",
    setting: "Outdoor",
    medium: "Living Soil (In the Ground)",
    started: "2026-10-01",
    stageStarted: "2026-10-18",
    logs: [
      {
        id: "l1",
        date: "2026-10-25",
        type: "training",
        technique: "LST",
        note: "Tied down main branches for even canopy",
      },
      {
        id: "l2",
        date: "2026-10-28",
        type: "feed",
        nutrients: "Nettle Nitrogen Brew",
        fertilizerForm: "Diluted",
        dilutionRatio: "1:10 (100ml/L)",
        amount: "1.5L",
      },
    ],
  },
];

const sampleFertilizers: HomemadeFertilizer[] = [
  {
    id: "f1",
    name: "Nettle Nitrogen Brew",
    fertilizerType: "Nettle / Herbal Nitrogen Brew",
    form: "Diluted",
    dilutionRatio: "1:10 (100ml/L)",
    ingredients: "Fresh stinging nettles + rainwater",
    createdAt: "2026-10-01",
  },
  {
    id: "f2",
    name: "Banana Peel Bloom Tea",
    fertilizerType: "Banana Peel / Fruit Potassium Tea",
    form: "Diluted",
    dilutionRatio: "1:10 (100ml/L)",
    ingredients: "Organic banana peels + molasses",
    createdAt: "2026-10-05",
  },
];

describe("AI Growth Stage Visualizer & Daily Collage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("generates a 3-stage plan (Seedling, Vegetative, Flowering) tailored to strain, soil, fertilizers & training", async () => {
    const schedule: FertilizerScheduleEntry[] = [
      {
        id: "f1",
        name: "Nettle Nitrogen Brew",
        fertilizerType: "Nettle / Herbal Nitrogen Brew",
        form: "Diluted",
        dilutionRatio: "1:10 (100ml/L)",
        stages: ["Vegetative"],
        frequency: "Weekly",
        startWeek: 3,
        endWeek: 8,
      },
      {
        id: "f2",
        name: "Banana Peel Bloom Tea",
        fertilizerType: "Banana Peel / Fruit Potassium Tea",
        form: "Diluted",
        dilutionRatio: "1:10 (100ml/L)",
        stages: ["Flowering"],
        frequency: "Weekly",
        startWeek: 9,
        endWeek: 14,
      },
    ];

    const plan = await handleGrowthVisualize({
      plantName: "Purple Trainwreck",
      strain: "Purple Trainwreck",
      plantType: "Photoperiod",
      setting: "Outdoor",
      medium: "Living Soil (In the Ground)",
      soilComposition: "40% topsoil, 30% compost, 20% pumice, 10% worm castings",
      trainingMethods: ["LST", "Topping"],
      fertilizerSchedule: schedule,
      totalDays: 98,
    });

    expect(plan.stages).toHaveLength(3);
    expect(plan.stages.map((s) => s.stage)).toEqual(["Seedling", "Vegetative", "Flowering"]);
    expect(plan.strainProfile.budAccent).toBe("purple-violet");
    expect(plan.strainProfile.estimatedTotalDays).toBe(98);

    const timeline = buildDailyGrowthTimeline(plan, ["LST", "Topping"], schedule);
    expect(timeline).toHaveLength(98);
    expect(timeline[0]?.stage).toBe("Seedling");
    expect(timeline[timeline.length - 1]?.stage).toBe("Flowering");
    expect(timeline[timeline.length - 1]?.heightCm).toBeGreaterThan(timeline[0]!.heightCm);
  });

  it("syncs linked plant & Fertilizer Journal into UI and switches cleanly between 3-Stage View and Daily Growth Collage", async () => {
    const mockPlan = await handleGrowthVisualize({
      plantName: "Purple Trainwreck",
      strain: "Purple Trainwreck",
      plantType: "Photoperiod",
      setting: "Outdoor",
      medium: "Living Soil (In the Ground)",
      soilComposition: "In-ground living soil bed",
      trainingMethods: ["LST"],
      fertilizerSchedule: [],
      totalDays: 84,
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockPlan,
    } as Response);

    render(
      <GrowthVisualizer
        plants={samplePlants}
        fertilizers={sampleFertilizers}
        initialSelectedPlantId="p-ptw"
      />,
    );

    // Linked plant journal badge AND Fertilizer Journal schedule item both display Nettle Nitrogen Brew
    expect(screen.getAllByText(/Nettle Nitrogen Brew/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Banana Peel Bloom Tea/i)).toBeInTheDocument();

    // Generate previews
    fireEvent.click(screen.getByTestId("generate-growth-visuals-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("growth-visualizer-results")).toBeInTheDocument();
      expect(screen.getByTestId("stage-card-seedling")).toBeInTheDocument();
      expect(screen.getByTestId("stage-card-vegetative")).toBeInTheDocument();
      expect(screen.getByTestId("stage-card-flowering")).toBeInTheDocument();
    });

    // Switch to Day-by-Day Collage view
    fireEvent.click(screen.getByTestId("view-mode-daily-collage"));

    await waitFor(() => {
      expect(screen.getByTestId("daily-collage-gallery")).toBeInTheDocument();
      expect(screen.getByText(/Day-by-Day Time-Lapse Scrubber/i)).toBeInTheDocument();
      expect(screen.getAllByText("Day 1").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Day 84").length).toBeGreaterThan(0);
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/growth-visualize",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
