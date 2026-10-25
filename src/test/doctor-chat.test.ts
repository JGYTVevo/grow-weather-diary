import { describe, expect, it } from "vitest";
import { handleDoctorChat } from "@/server/doctor-chat";

describe("GrowBuddy AI Doctor Chatbot", () => {
  it("provides comprehensive pest protocol for spider mites inquiry", async () => {
    const res = await handleDoctorChat({
      messages: [
        {
          role: "user",
          text: "I think I have spider mites on my lower leaves. What organic spray should I use?",
        },
      ],
      context: {
        plantName: "Gorilla Glue",
        stage: "Late Vegetative",
        medium: "Coco Coir",
        activeCondition: "Two-Spotted Spider Mites",
      },
    });

    expect(res).toBeDefined();
    expect(res.text).toBeDefined();
    expect(res.text.length).toBeGreaterThan(50);
    expect(res.text.toLowerCase()).toMatch(/spray|quarantine|foliar|mite|soap|neem|predator/);
    expect(["gemini-3.8-flash", "botanical-knowledge-base"]).toContain(res.source);
  }, 10000);

  it("gives medium-specific pH and lockout advice for coco coir", async () => {
    const res = await handleDoctorChat({
      messages: [
        {
          role: "user",
          text: "My leaf tips are rusting and curling down. Is this pH lockout or Cal-Mag deficiency in coco?",
        },
      ],
      context: {
        plantName: "Sour Diesel",
        stage: "Early Bloom",
        medium: "Coco Coir",
      },
    });

    expect(res).toBeDefined();
    expect(res.text).toBeDefined();
    expect(res.text.toLowerCase()).toMatch(/ph|cal-mag|lockout|ec|flush|5\.8|coco/);
  }, 10000);

  it("addresses watering and turgor questions", async () => {
    const res = await handleDoctorChat({
      messages: [
        {
          role: "user",
          text: "How do I know if my plant is overwatered or underwatered?",
        },
      ],
      context: {
        plantName: "Northern Lights",
        stage: "Vegetative",
        medium: "Soil",
      },
    });

    expect(res).toBeDefined();
    expect(res.text.toLowerCase()).toMatch(/overwater|underwater|lift|turgor|dry|moisture/);
  }, 10000);

  it("handles multi-turn conversation and context injection", async () => {
    const res = await handleDoctorChat({
      messages: [
        {
          role: "user",
          text: "My leaves are yellowing between veins.",
        },
        {
          role: "model",
          text: "That could be magnesium deficiency or iron lockout depending on your pH.",
        },
        {
          role: "user",
          text: "What VPD should I target to fix nutrient uptake?",
        },
      ],
      context: {
        plantName: "Blueberry",
        stage: "Late Bloom",
        medium: "Hydro",
      },
    });

    expect(res).toBeDefined();
    expect(res.text.toLowerCase()).toMatch(/vpd|humidity|temp|kpa|target/);
  }, 10000);

  it("throws descriptive error when no messages are provided", async () => {
    await expect(
      handleDoctorChat({
        messages: [],
      }),
    ).rejects.toThrow("No chat messages provided.");
  });
});
