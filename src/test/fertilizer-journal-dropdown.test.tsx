import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PlantsPanel } from "@/components/Plants";
import { QuickLogModal } from "@/components/QuickLogModal";
import type { Plant, Log } from "@/hooks/use-plants";
import type { HomemadeFertilizer } from "@/hooks/use-fertilizers";

const SAMPLE_FERTILIZERS: HomemadeFertilizer[] = [
  {
    id: "fert-1",
    name: "Banana Peel Tea",
    fertilizerType: "Banana Peel / Fruit Potassium Tea",
    form: "Diluted",
    dilutionRatio: "1:10 (100ml/L)",
    ingredients: "Organic banana peels + molasses",
    targetStage: "Flowering",
    createdAt: "2026-03-01",
  },
  {
    id: "fert-2",
    name: "Worm Casting Slurry",
    fertilizerType: "Compost / Worm Tea",
    form: "Raw",
    dilutionRatio: "Straight drench (undiluted)",
    ingredients: "Fresh worm castings",
    targetStage: "All Stages",
    createdAt: "2026-03-02",
  },
];

const SAMPLE_PLANT: Plant = {
  id: "plant-1",
  name: "Purple Train Wreck",
  strain: "Purple Trainwreck",
  type: "Photoperiod",
  medium: "Living soil",
  setting: "Outdoor",
  started: "2026-02-01",
  stage: "Flowering",
  stageStarted: "2026-03-01",
  logs: [],
};

describe("Fertilizer Journal Dropdown in Plant Journal & Quick Log", () => {
  it("allows selecting a saved fertilizer from the dropdown when adding a feed entry in PlantView", async () => {
    let updatedPlant: Plant = SAMPLE_PLANT;
    const updatePlant = vi.fn(async (_id: string, fn: (p: Plant) => Plant) => {
      updatedPlant = fn(updatedPlant);
    });

    render(
      <PlantsPanel
        openedPlantId="plant-1"
        plantsState={{
          plants: [SAMPLE_PLANT],
          loading: false,
          updatePlant,
          setPlantCover: vi.fn(),
          createPlant: vi.fn(),
          deletePlant: vi.fn(),
          addLogToPlants: vi.fn(),
        }}
        fertilizersState={{
          fertilizers: SAMPLE_FERTILIZERS,
          addFertilizer: vi.fn(),
          updateFertilizer: vi.fn(),
          deleteFertilizer: vi.fn(),
        }}
      />,
    );

    // Click the "Feed" button under "Add to journal"
    const feedButtons = screen.getAllByText("Feed");
    fireEvent.click(feedButtons[0]!);

    // The Fertilizer Journal dropdown (<select>) should be visible with both saved fertilizers
    const dropdown = screen.getByLabelText("Choose from Fertilizer Journal") as HTMLSelectElement;
    expect(dropdown).toBeInTheDocument();
    expect(dropdown.options.length).toBe(3); // default option + 2 saved fertilizers

    // Select the first saved fertilizer ("Banana Peel Tea")
    fireEvent.change(dropdown, { target: { value: "fert-1" } });
    expect(dropdown.value).toBe("fert-1");

    // Verify nutrient input and dilution ratio input auto-populated from the Fertilizer Journal
    const nutrientInput = screen.getByPlaceholderText(
      /Nutrients \/ fertilizer name/i,
    ) as HTMLInputElement;
    expect(nutrientInput.value).toBe("Banana Peel Tea (Banana Peel / Fruit Potassium Tea)");

    const dilutionInput = screen.getByPlaceholderText(/Dilution ratio/i) as HTMLInputElement;
    expect(dilutionInput.value).toBe("1:10 (100ml/L)");

    // Submit the journal form
    const saveBtn = screen.getByRole("button", { name: /Save feed/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(updatePlant).toHaveBeenCalledTimes(1);
    });

    expect(updatedPlant.logs.length).toBe(1);
    expect(updatedPlant.logs[0]?.type).toBe("feed");
    expect(updatedPlant.logs[0]?.nutrients).toBe(
      "Banana Peel Tea (Banana Peel / Fruit Potassium Tea)",
    );
    expect(updatedPlant.logs[0]?.fertilizerForm).toBe("Diluted");
    expect(updatedPlant.logs[0]?.dilutionRatio).toBe("1:10 (100ml/L)");
  });

  it("allows selecting a saved fertilizer from the dropdown in QuickLogModal when category is feed", async () => {
    const onSaveLog = vi.fn(async (_plantIds: string[], _logData: Omit<Log, "id">) => {});

    render(
      <QuickLogModal
        isOpen={true}
        onClose={vi.fn()}
        plants={[SAMPLE_PLANT]}
        fertilizers={SAMPLE_FERTILIZERS}
        defaultPlantId="plant-1"
        onSaveLog={onSaveLog}
      />,
    );

    // Switch category to "Feed"
    const feedTabBtn = screen.getByRole("button", { name: /Feed/i });
    fireEvent.click(feedTabBtn);

    // Select "Worm Casting Slurry" (Raw) from the Fertilizer Journal dropdown
    const dropdown = screen.getByLabelText("Choose from Fertilizer Journal") as HTMLSelectElement;
    expect(dropdown).toBeInTheDocument();
    fireEvent.change(dropdown, { target: { value: "fert-2" } });

    expect(dropdown.value).toBe("fert-2");

    // Save the check-in
    const saveBtn = screen.getByRole("button", { name: /Save Check-in/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onSaveLog).toHaveBeenCalledTimes(1);
    });

    const [savedPlantIds, savedPayload] = onSaveLog.mock.calls[0]!;
    expect(savedPlantIds).toEqual(["plant-1"]);
    expect(savedPayload.type).toBe("feed");
    expect(savedPayload.nutrients).toBe("Worm Casting Slurry (Compost / Worm Tea)");
    expect(savedPayload.fertilizerForm).toBe("Raw");
    expect(savedPayload.dilutionRatio).toBe("Straight drench (undiluted)");
  });
});
