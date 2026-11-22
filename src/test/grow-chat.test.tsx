import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  extractWaterLitresFromMessage,
  parseMlPerLitre,
  buildDilutionBreakdown,
  getAuthoritativeHorticulturalSources,
  handleGrowChat,
} from "@/server/grow-chat";
import { GrowChatbot } from "@/components/GrowChatbot";
import type { Plant } from "@/hooks/use-plants";
import type { HomemadeFertilizer } from "@/hooks/use-fertilizers";

describe("Standalone AI Assistant Section, Real Gemini Answers, Retry & Verified Sources", () => {
  it("extracts water volume in litres from user questions like 1.5l", () => {
    expect(
      extractWaterLitresFromMessage(
        "if I use 1.5l of water per watering do I use the same amount of diluted nutrients",
      ),
    ).toBe(1.5);
    expect(extractWaterLitresFromMessage("How much for 2.5 litres of water?")).toBe(2.5);
    expect(extractWaterLitresFromMessage("I water with 750ml per pot")).toBe(0.75);
  });

  it("parses ml/L and 1:X ratios accurately", () => {
    expect(parseMlPerLitre("2 ml/L")).toBe(2);
    expect(parseMlPerLitre("1:10 (100ml/L)")).toBe(100);
    expect(parseMlPerLitre("1:20")).toBe(50);
    expect(parseMlPerLitre("1:500")).toBe(2);
  });

  it("returns authoritative horticultural sources for dilution and nutrient questions", () => {
    const sources = getAuthoritativeHorticulturalSources(
      "If I use 1.5L of water per watering, do I use the same amount of diluted nutrients?",
    );
    expect(sources.length).toBeGreaterThanOrEqual(3);
    expect(sources[0]).toHaveProperty("title");
    expect(sources[0]).toHaveProperty("url");
    expect(sources[0]).toHaveProperty("publisher");
  });

  it("returns general reference sources (math, coding, encyclopedia) for general Ask-Anything questions", () => {
    const mathSources = getAuthoritativeHorticulturalSources("Calculate 245 * 18");
    expect(mathSources.length).toBeGreaterThanOrEqual(2);
    expect(
      mathSources.some((s) => s.publisher.includes("Wolfram") || s.url.startsWith("http")),
    ).toBe(true);
  });

  it("calculates exact concentrate and total volume breakdown for 1.5L watering", () => {
    const breakdown = buildDilutionBreakdown(1.5, [
      {
        name: "Comfrey Tea",
        fertilizerType: "Compost Tea",
        form: "Diluted",
        dilutionRatio: "1:10 (100ml/L)",
      },
    ]);

    expect(breakdown.waterLitres).toBe(1.5);
    expect(breakdown.totalMixedLitres).toBe(1.5);
    expect(breakdown.examples[0]).toMatchObject({
      label: "Comfrey Tea (Compost Tea)",
      concentrateMl: 150,
    });
  });

  it("answers watering vs diluted nutrient questions and includes verifiable sources via handleGrowChat", async () => {
    const res = await handleGrowChat({
      message: "if I use 1.5l of water per watering do I use the same amount of diluted nutrients",
      plants: [{ name: "Purple Trainwreck", stage: "Flowering", medium: "Soil" }],
      fertilizers: [
        {
          name: "Nettle Brew",
          fertilizerType: "Nettle Tea",
          form: "Diluted",
          dilutionRatio: "1:10 (100ml/L)",
        },
      ],
    });

    expect(res.reply.toLowerCase()).toContain("1.5");
    expect(res.calculatedBreakdown?.waterLitres).toBe(1.5);
    expect(res.calculatedBreakdown?.examples[0]?.concentrateMl).toBe(150);
    expect(Array.isArray(res.sources)).toBe(true);
    expect(res.sources.length).toBeGreaterThan(0);
    expect(res.sources[0]?.url).toMatch(/^https?:\/\//);
  });

  it("answers general Ask-Anything questions specifically with verified sources and without unrelated fertilizer charts", async () => {
    const mathRes = await handleGrowChat({
      message: "What is 25 * 16?",
      plants: [],
      fertilizers: [],
    });

    expect(mathRes.reply).toContain("400");
    expect(mathRes.calculatedBreakdown).toBeUndefined();
    expect(mathRes.sources.length).toBeGreaterThan(0);

    const stepsRes = await handleGrowChat({
      message: "Calculate 245 * 18 and show the steps",
      plants: [],
      fertilizers: [],
    });

    expect(stepsRes.reply).toMatch(/4,?410/);
    expect(stepsRes.reply).not.toContain("can be approached by looking at the primary facts");
    expect(stepsRes.calculatedBreakdown).toBeUndefined();
    expect(stepsRes.sources.length).toBeGreaterThan(0);
  });

  describe("Standalone GrowChatbot (AI Assistant Section) Component & Retry Flow", () => {
    const samplePlants: Plant[] = [
      {
        id: "p1",
        name: "Purple Trainwreck",
        strain: "Sativa Dominant",
        stage: "Flowering",
        started: "2026-09-01",
        medium: "Soil",
        logs: [],
      },
    ];

    const sampleFertilizers: HomemadeFertilizer[] = [
      {
        id: "f1",
        name: "Banana Peel Brew",
        fertilizerType: "Banana Peel",
        form: "Diluted",
        dilutionRatio: "1:10 (100ml/L)",
        createdAt: "2026-10-01",
      },
    ];

    beforeEach(() => {
      localStorage.clear();
      vi.restoreAllMocks();
    });

    it("renders the standalone AI Assistant section and displays answers with verified sources", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reply:
            "Yes — you pour the same **1.5 L** total volume of diluted solution, mixing **150 ml** of Banana Peel Brew concentrate into water to make **1.5 L** total.",
          calculatedBreakdown: {
            waterLitres: 1.5,
            totalMixedLitres: 1.5,
            examples: [
              {
                label: "Banana Peel Brew (Banana Peel)",
                ratio: "1:10 (100ml/L)",
                concentrateMl: 150,
                waterAddedLitres: 1.35,
              },
            ],
          },
          sources: [
            {
              title: "How to Mix Plant Nutrients Safely: Measuring ml/L, EC & pH Order",
              publisher: "CANNA Research — Horticultural Nutrition Guide",
              url: "https://www.canna.co.nz/articles",
              snippet: "Always calculate concentrate based on total water batch volume.",
            },
          ],
          source: "gemini-3.8-flash",
        }),
      } as Response);

      render(<GrowChatbot plants={samplePlants} fertilizers={sampleFertilizers} />);

      expect(screen.getByRole("heading", { name: /AI Assistant/i })).toBeInTheDocument();
      expect(screen.queryByTestId("floating-grow-chat-widget")).not.toBeInTheDocument();

      const input = screen.getByLabelText(/Ask the AI Grow Assistant a question/i);
      fireEvent.change(input, {
        target: {
          value:
            "If I use 1.5L of water per watering, do I use the same amount of diluted nutrients?",
        },
      });
      fireEvent.submit(input.closest("form")!);

      await waitFor(() => {
        expect(screen.getByText(/Exact Mixing Chart for 1.5 L Watering/i)).toBeInTheDocument();
        expect(
          screen.getAllByText(/CANNA Research — Horticultural Nutrition Guide/i).length,
        ).toBeGreaterThan(0);
      });
    });

    it("shows a Retry option when a prompt fails to send and succeeds when Retry is clicked", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        // First send tries both /api/grow-chat and /api/ai-assistant and both fail
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: async () => ({ error: "Endpoint 404 error" }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: async () => ({ error: "Endpoint 404 error" }),
        } as Response)
        // Clicking Retry succeeds!
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            reply: "Wellington is the capital city of New Zealand.",
            sources: [
              {
                title: "Wellington — Capital of New Zealand",
                publisher: "Te Ara — The Encyclopedia of New Zealand",
                url: "https://teara.govt.nz/en/wellington-region",
                snippet: "Wellington has been the capital of New Zealand since 1865.",
              },
            ],
            source: "gemini-3.8-flash",
          }),
        } as Response);

      render(<GrowChatbot plants={samplePlants} fertilizers={sampleFertilizers} />);

      const input = screen.getByLabelText(/Ask the AI Grow Assistant a question/i);
      fireEvent.change(input, {
        target: { value: "What is the capital of New Zealand?" },
      });
      fireEvent.submit(input.closest("form")!);

      // Wait for failure alert & Retry button to appear
      await waitFor(() => {
        expect(screen.getByTestId("chat-error-banner")).toBeInTheDocument();
        expect(screen.getByTestId("retry-prompt-button")).toBeInTheDocument();
      });

      // Click Retry Sending
      fireEvent.click(screen.getByTestId("retry-prompt-button"));

      await waitFor(() => {
        expect(
          screen.getByText(/Wellington is the capital city of New Zealand/i),
        ).toBeInTheDocument();
        expect(screen.queryByTestId("chat-error-banner")).not.toBeInTheDocument();
      });

      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });
});
