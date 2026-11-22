import { describe, it, expect, beforeEach, vi } from "vitest";
import { formatDataUrlSize, compressImage } from "@/lib/photo-utils";
import {
  sanitizeLog,
  sanitizePlant,
  safePersistLocal,
  fitPlantForFirestore,
  reconcileCloudAndLocalPlants,
  type Plant,
  type Log,
} from "@/hooks/use-plants";

describe("Photo Utilities & Journal Persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("formatDataUrlSize", () => {
    it("returns 0 KB for empty or null inputs", () => {
      expect(formatDataUrlSize(null)).toBe("0 KB");
      expect(formatDataUrlSize("")).toBe("0 KB");
    });

    it("formats small and moderate base64 data URLs accurately", () => {
      // 100 bytes approx
      const smallDataUrl = "data:image/jpeg;base64," + "A".repeat(120);
      const formatted = formatDataUrlSize(smallDataUrl);
      expect(formatted).toMatch(/B|KB/);
    });
  });

  describe("compressImage safety & resilience", () => {
    it("returns input string if already provided", async () => {
      const mockDataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
      const res = await compressImage(mockDataUrl, { timeoutMs: 1000 });
      expect(res).toBe(mockDataUrl);
    });

    it("does not hang indefinitely when given invalid or unsupported blob", async () => {
      const blob = new Blob(["not-an-image"], { type: "text/plain" });
      const res = await compressImage(blob, { timeoutMs: 300 });
      // Should resolve safely rather than hanging
      expect(typeof res).toBe("string");
    });
  });

  describe("sanitizeLog & photo preservation", () => {
    it("preserves photo data URLs without truncation", () => {
      const photoPayload = "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ";
      const clean = sanitizeLog({
        date: "2026-10-26",
        type: "photo",
        note: "Checking trichome development",
        photo: photoPayload,
      });

      expect(clean.photo).toBe(photoPayload);
      expect(clean.type).toBe("photo");
      expect(clean.note).toBe("Checking trichome development");
    });

    it("allows attaching photo to watering, training, or environment entries", () => {
      const photoPayload = "data:image/jpeg;base64,mockrunoffphoto";
      const waterLog = sanitizeLog({
        type: "water",
        amount: "1.5",
        ph: "6.3",
        photo: photoPayload,
        note: "Runoff collected cleanly",
      });

      expect(waterLog.type).toBe("water");
      expect(waterLog.amount).toBe("1.5");
      expect(waterLog.photo).toBe(photoPayload);
    });
  });

  describe("sanitizePlant & cover photo", () => {
    it("preserves cover photo and journal logs", () => {
      const coverPhoto = "data:image/jpeg;base64,coverimg123";
      const plant = sanitizePlant({
        id: "plant-1",
        name: "Gorilla Glue",
        cover: coverPhoto,
        logs: [
          {
            id: "log-1",
            date: "2026-10-25",
            type: "photo",
            photo: "data:image/jpeg;base64,logimg456",
            note: "Day 14 looking lush",
          },
        ],
      });

      expect(plant.cover).toBe(coverPhoto);
      expect(plant.logs.length).toBe(1);
      expect(plant.logs[0]!.photo).toBe("data:image/jpeg;base64,logimg456");
    });
  });

  describe("safePersistLocal quota resilience", () => {
    it("persists normal plant records to localStorage without issue", () => {
      const testPlant: Plant = {
        id: "plant-safe-1",
        name: "Northern Lights",
        strain: "Indica",
        type: "Photoperiod",
        medium: "Soil",
        setting: "Indoor",
        started: "2026-10-01",
        stage: "Vegetative",
        stageStarted: "2026-10-01",
        logs: [
          {
            id: "log-1",
            date: "2026-10-20",
            type: "photo",
            photo: "data:image/jpeg;base64,testphoto123",
          },
        ],
      };

      safePersistLocal([testPlant]);
      const stored = localStorage.getItem("canopy-plants-v2");
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed[0].logs[0].photo).toBe("data:image/jpeg;base64,testphoto123");
    });

    it("gracefully falls back when localStorage quota is exceeded", () => {
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
      let calls = 0;
      setItemSpy.mockImplementation((key: string, value: string) => {
        calls++;
        if (calls === 1) {
          // Simulate QuotaExceededError on first call
          const err = new Error("QuotaExceededError");
          err.name = "QuotaExceededError";
          throw err;
        }
        // Second call with slimmed data succeeds
      });

      const testPlant: Plant = {
        id: "plant-huge",
        name: "Big Bud",
        strain: "Hybrid",
        type: "Photoperiod",
        medium: "Coco",
        setting: "Indoor",
        started: "2026-10-01",
        stage: "Flowering",
        stageStarted: "2026-10-01",
        logs: Array.from({ length: 10 }).map((_, i) => ({
          id: `log-${i}`,
          date: `2026-10-${10 + i}`,
          type: "photo" as const,
          photo: "data:image/jpeg;base64," + "A".repeat(1000),
          note: `Photo ${i}`,
        })),
      };

      expect(() => safePersistLocal([testPlant])).not.toThrow();
      expect(calls).toBe(2); // Should have caught and retried with slimmed data
    });
  });

  describe("Front cover change & persistence (e.g. Purple Trainwreck)", () => {
    it("updates front cover photo and persists cleanly", () => {
      const initialPlant: Plant = {
        id: "plant-purple-trainwreck",
        name: "Purple Trainwreck",
        strain: "Purple Trainwreck",
        type: "Photoperiod",
        medium: "Living soil",
        setting: "Indoor",
        started: "2026-09-15",
        stage: "Flowering",
        stageStarted: "2026-10-01",
        cover: "data:image/jpeg;base64,initialcover123",
        logs: [],
      };

      // 1. Initial save
      safePersistLocal([initialPlant]);
      let saved = JSON.parse(localStorage.getItem("canopy-plants-v2")!);
      expect(saved[0].cover).toBe("data:image/jpeg;base64,initialcover123");

      // 2. Change front cover to a fresh photo
      const newCoverPhoto = "data:image/jpeg;base64,purpletrainwrecknewcover999";
      const updatedPlant = sanitizePlant({
        ...initialPlant,
        cover: newCoverPhoto,
      });

      safePersistLocal([updatedPlant]);
      saved = JSON.parse(localStorage.getItem("canopy-plants-v2")!);
      expect(saved[0].cover).toBe(newCoverPhoto);
      expect(saved[0].name).toBe("Purple Trainwreck");
    });

    it("allows removing front cover and omits undefined/empty cover cleanly", () => {
      const plantWithCover: Plant = {
        id: "plant-purple-trainwreck-2",
        name: "Purple Trainwreck",
        strain: "Purple Trainwreck",
        type: "Photoperiod",
        medium: "Soil",
        setting: "Indoor",
        started: "2026-09-15",
        stage: "Vegetative",
        stageStarted: "2026-09-15",
        cover: "data:image/jpeg;base64,coverToRemove",
        logs: [],
      };

      // Clear cover
      const clearedPlant = sanitizePlant({
        ...plantWithCover,
        cover: undefined,
      });

      expect(clearedPlant.cover).toBeUndefined();
      safePersistLocal([clearedPlant]);
      const saved = JSON.parse(localStorage.getItem("canopy-plants-v2")!);
      expect(saved[0].cover).toBeUndefined();
    });

    it("preserves custom and complex plant IDs up to 128 chars without corruption", () => {
      const complexId = "usr_99_plant_purple_trainwreck_pheno-2";
      const plant = sanitizePlant({
        id: complexId,
        name: "Purple Trainwreck Pheno #2",
        strain: "Purple Trainwreck",
        started: "2026-09-20",
        stage: "Flowering",
      });

      expect(plant.id).toBe(complexId);
      expect(plant.name).toBe("Purple Trainwreck Pheno #2");
    });

    it("keeps newly added Purple Train Wreck journal photo when fitting plant for Firestore 1MB limit", () => {
      const newlyAddedPhoto = "data:image/jpeg;base64," + "N".repeat(50000);
      const oldHeavyPhoto1 = "data:image/jpeg;base64," + "O".repeat(450000);
      const oldHeavyPhoto2 = "data:image/jpeg;base64," + "P".repeat(450000);

      const purpleTrainWreck: Plant = sanitizePlant({
        id: "plant-purple-train-wreck",
        name: "Purple Train Wreck",
        strain: "Purple Train Wreck",
        type: "Photoperiod",
        medium: "Soil",
        setting: "Outdoor",
        started: "2026-09-15",
        stage: "Flowering",
        stageStarted: "2026-10-01",
        cover: "data:image/jpeg;base64," + "C".repeat(40000),
        logs: [
          {
            id: "log-newest",
            date: "2026-10-31",
            type: "photo",
            photo: newlyAddedPhoto,
            note: "Fresh bud swell photo added today",
          },
          {
            id: "log-older-1",
            date: "2026-10-20",
            type: "photo",
            photo: oldHeavyPhoto1,
            note: "Older week 3 photo",
          },
          {
            id: "log-older-2",
            date: "2026-10-10",
            type: "photo",
            photo: oldHeavyPhoto2,
            note: "Oldest week 1 photo",
          },
        ],
      });

      const fitted = fitPlantForFirestore(purpleTrainWreck, 850000);
      expect(JSON.stringify(fitted).length).toBeLessThanOrEqual(850000);
      // Must preserve the newly added photo at index 0
      expect(fitted.logs[0]?.id).toBe("log-newest");
      expect(fitted.logs[0]?.photo).toBe(newlyAddedPhoto);
      // Oldest heavy photo was archived to fit under 850KB
      expect(fitted.logs[2]?.photo).toBeUndefined();
      expect(fitted.logs[2]?.note).toContain("(archived photo)");
    });

    it("reconciles local Purple Train Wreck journal photos when Firestore snapshot has older state", () => {
      const cloudPlant: Plant = sanitizePlant(
        {
          id: "plant-ptw",
          name: "Purple Train Wreck",
          strain: "Purple Train Wreck",
          started: "2026-09-15",
          stage: "Flowering",
          logs: [
            {
              id: "log-old-1",
              date: "2026-10-15",
              type: "water",
              amount: "2L",
              note: "Watered",
            },
          ],
        },
        "user-1",
      );

      const localPlantWithNewPhoto: Plant = sanitizePlant(
        {
          ...cloudPlant,
          logs: [
            {
              id: "log-new-photo-99",
              date: "2026-10-31",
              type: "photo",
              photo: "data:image/jpeg;base64,newpurpletrainwreckphoto99",
              note: "Added new canopy photo",
            },
            ...cloudPlant.logs,
          ],
        },
        "user-1",
      );

      const { merged, dirtyPlants } = reconcileCloudAndLocalPlants(
        [cloudPlant],
        [localPlantWithNewPhoto],
        new Set(),
        "user-1",
      );

      expect(merged.length).toBe(1);
      expect(merged[0]!.logs.length).toBe(2);
      expect(merged[0]!.logs[0]!.id).toBe("log-new-photo-99");
      expect(merged[0]!.logs[0]!.photo).toBe("data:image/jpeg;base64,newpurpletrainwreckphoto99");
      expect(dirtyPlants.length).toBe(1);
    });
  });
});
