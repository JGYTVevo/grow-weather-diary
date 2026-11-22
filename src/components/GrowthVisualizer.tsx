import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { Plant } from "@/hooks/use-plants";
import type { HomemadeFertilizer } from "@/hooks/use-fertilizers";
import { buildPlantJournalSummary } from "@/lib/journal-context";
import { compressImage } from "@/lib/photo-utils";
import {
  generateGrowthVisualizationPlan,
  buildDailyGrowthTimeline,
  type FertilizerScheduleEntry,
  type GrowthVisualStage,
  type GrowthVisualizationPlan,
  type DailyGrowthPoint,
} from "@/lib/growth-visualizer";
import {
  renderPlantStageToDataUrl,
  buildDownloadableCollagePoster,
} from "@/lib/growth-visualizer-canvas";
import {
  Camera,
  Upload,
  Sparkles,
  Sprout,
  Grid3X3,
  Layers,
  Download,
  BookOpen,
  Play,
  Pause,
  Loader2,
  Check,
  X,
  Plus,
  FlaskConical,
  Scissors,
  Crosshair,
  SlidersHorizontal,
  Eye,
  EyeOff,
  RotateCcw,
  ArrowRight,
  Calendar,
  AlertTriangle,
} from "lucide-react";

const SOIL_INGREDIENT_PRESETS = [
  "Organic Compost",
  "Worm Castings",
  "Perlite / Pumice",
  "Living Soil Mulch",
  "Garden Topsoil / Loam",
  "Coco Coir",
  "Peat Moss",
  "Biochar",
  "Kelp Meal",
  "Blood & Bone",
] as const;

const TRAINING_OPTIONS = [
  "LST",
  "Topping",
  "FIM",
  "SCROG",
  "Defoliation",
  "Lollipopping",
  "Supercropping",
  "Natural / Untrained",
] as const;

const FREQUENCY_OPTIONS = [
  "Every watering",
  "Weekly",
  "Every 2 weeks",
  "Top-dress monthly",
  "Bloom boost only",
] as const;

const MEDIUM_OPTIONS = [
  "Living Soil (In the Ground)",
  "In the Ground",
  "Living Soil",
  "Soil",
  "Coco Coir",
  "Hydro / DWC",
] as const;

const CYCLE_DAY_OPTIONS = [70, 84, 98, 112] as const;

interface GrowthVisualizerProps {
  plants: Plant[];
  fertilizers: HomemadeFertilizer[];
  initialSelectedPlantId?: string | null;
  onLogToPlant?: (
    plantIds: string[],
    logData: {
      type: "training" | "water" | "feed" | "note" | "photo";
      note: string;
      photo?: string;
    },
  ) => Promise<void>;
  onNavigateToPlant?: (plantId: string) => void;
}

function inferDefaultStagesForFertilizer(fert: HomemadeFertilizer): GrowthVisualStage[] {
  const combined =
    `${fert.name} ${fert.fertilizerType} ${fert.targetStage || ""} ${fert.ingredients || ""}`.toLowerCase();
  if (
    combined.includes("banana") ||
    combined.includes("bloom") ||
    combined.includes("potassium") ||
    combined.includes("ash") ||
    combined.includes("flower")
  ) {
    return ["Flowering"];
  }
  if (combined.includes("nettle") || combined.includes("nitrogen") || combined.includes("veg")) {
    return ["Vegetative"];
  }
  if (combined.includes("aloe") || combined.includes("root") || combined.includes("seedling")) {
    return ["Seedling", "Vegetative"];
  }
  return ["Vegetative", "Flowering"];
}

function buildScheduleFromFertilizers(
  fertilizers: HomemadeFertilizer[],
): FertilizerScheduleEntry[] {
  return fertilizers.map((f) => {
    const stages = inferDefaultStagesForFertilizer(f);
    const startWeek = stages.includes("Seedling") ? 1 : stages.includes("Vegetative") ? 3 : 7;
    const endWeek = stages.includes("Flowering") ? 14 : stages.includes("Vegetative") ? 8 : 3;
    return {
      id: f.id,
      name: f.name,
      fertilizerType: f.fertilizerType,
      form: f.form,
      dilutionRatio: f.dilutionRatio,
      ingredients: f.ingredients,
      stages,
      frequency: f.form === "Raw" ? "Top-dress monthly" : "Weekly",
      startWeek,
      endWeek,
    };
  });
}

function triggerImageDownload(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function GrowthVisualizer({
  plants,
  fertilizers,
  initialSelectedPlantId,
  onLogToPlant,
  onNavigateToPlant,
}: GrowthVisualizerProps) {
  const [selectedPlantId, setSelectedPlantId] = useState<string>(
    initialSelectedPlantId || (plants[0]?.id ?? ""),
  );

  // Grow area & plant photo uploads
  const [growAreaPhoto, setGrowAreaPhoto] = useState<string | null>(null);
  const [plantPhoto, setPlantPhoto] = useState<string | null>(null);
  const [manualAnchor, setManualAnchor] = useState<{ x: number; y: number } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Grow parameters (synced to selected plant & fertilizers)
  const [plantName, setPlantName] = useState("My Garden Plant");
  const [strain, setStrain] = useState("Purple Trainwreck");
  const [plantType, setPlantType] = useState<"Photoperiod" | "Autoflower">("Photoperiod");
  const [setting, setSetting] = useState<"Indoor" | "Outdoor" | "Greenhouse">("Outdoor");
  const [medium, setMedium] = useState<string>("Living Soil (In the Ground)");
  const [soilComposition, setSoilComposition] = useState<string>(
    "Living soil mix: organic garden topsoil, homemade compost, worm castings, pumice for drainage, and straw mulch",
  );
  const [trainingMethods, setTrainingMethods] = useState<string[]>(["LST", "Topping"]);
  const [totalDays, setTotalDays] = useState<number>(98);
  const [extraNotes, setExtraNotes] = useState<string>("");

  // Linked fertilizers & schedule
  const [enabledFertIds, setEnabledFertIds] = useState<string[]>(() =>
    fertilizers.map((f) => f.id),
  );
  const [fertSchedules, setFertSchedules] = useState<FertilizerScheduleEntry[]>(() =>
    buildScheduleFromFertilizers(fertilizers),
  );
  const [customFertName, setCustomFertName] = useState("");
  const [customFertStage, setCustomFertStage] = useState<GrowthVisualStage>("Flowering");
  const [customFertFreq, setCustomFertFreq] = useState<string>("Weekly");

  // Output & view state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [plan, setPlan] = useState<GrowthVisualizationPlan | null>(null);
  const [viewMode, setViewMode] = useState<"three-stage" | "daily-collage">("three-stage");
  const [showOverlayLabels, setShowOverlayLabels] = useState(true);
  const [stageImages, setStageImages] = useState<Record<GrowthVisualStage, string>>({
    Seedling: "",
    Vegetative: "",
    Flowering: "",
  });
  const [dailyImages, setDailyImages] = useState<Array<{ day: number; dataUrl: string }>>([]);
  const [collageProgress, setCollageProgress] = useState(0);
  const [renderingCollage, setRenderingCollage] = useState(false);
  const [collageStageFilter, setCollageStageFilter] = useState<"All" | GrowthVisualStage>("All");

  // Time-lapse scrubber & day modal
  const [activeTimelapseDay, setActiveTimelapseDay] = useState<number>(1);
  const [isPlayingTimelapse, setIsPlayingTimelapse] = useState(false);
  const [inspectedDay, setInspectedDay] = useState<DailyGrowthPoint | null>(null);
  const [downloadingPoster, setDownloadingPoster] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  const loadedBgImgRef = useRef<HTMLImageElement | null>(null);
  const renderGenerationRef = useRef(0);

  // Sync initialSelectedPlantId prop
  useEffect(() => {
    if (initialSelectedPlantId && plants.some((p) => p.id === initialSelectedPlantId)) {
      setSelectedPlantId(initialSelectedPlantId);
    } else if (!selectedPlantId && plants.length > 0) {
      setSelectedPlantId(plants[0]!.id);
    }
  }, [initialSelectedPlantId, plants, selectedPlantId]);

  // Sync fertilizer list whenever user's Fertilizer Journal changes
  useEffect(() => {
    setFertSchedules((prev) => {
      const existingById = new Map(prev.map((item) => [item.id, item]));
      const customOnes = prev.filter((item) => item.id.startsWith("custom-"));
      const syncedFromJournal = fertilizers.map((f) => {
        const existing = existingById.get(f.id);
        if (existing) {
          return {
            ...existing,
            name: f.name,
            fertilizerType: f.fertilizerType,
            form: f.form,
            dilutionRatio: f.dilutionRatio,
            ingredients: f.ingredients,
          };
        }
        return buildScheduleFromFertilizers([f])[0]!;
      });
      return [...syncedFromJournal, ...customOnes];
    });
    setEnabledFertIds((prev) => {
      const next = new Set(prev);
      for (const f of fertilizers) {
        if (!prev.length) next.add(f.id);
      }
      return Array.from(next);
    });
  }, [fertilizers]);

  const linkedPlant = useMemo(
    () => plants.find((p) => p.id === selectedPlantId) || null,
    [plants, selectedPlantId],
  );

  const journalSummary = useMemo(
    () => (linkedPlant ? buildPlantJournalSummary(linkedPlant, fertilizers) : null),
    [linkedPlant, fertilizers],
  );

  // Sync form fields whenever linked plant changes
  useEffect(() => {
    if (!linkedPlant || !journalSummary) return;
    setPlantName(linkedPlant.name);
    setStrain(linkedPlant.strain || linkedPlant.name);
    setPlantType(linkedPlant.type || "Photoperiod");
    setSetting(linkedPlant.setting || "Outdoor");
    setMedium(journalSummary.medium);
    setTotalDays(linkedPlant.type === "Autoflower" ? 84 : 98);

    // Pre-populate soil composition based on linked plant medium
    if (journalSummary.isLivingSoil && journalSummary.isInGround) {
      setSoilComposition(
        "In-ground living soil bed: garden topsoil, homemade compost, worm castings, pumice/perlite aeration, and organic mulch",
      );
    } else if (journalSummary.isLivingSoil) {
      setSoilComposition(
        "Living soil pot mix: organic compost, worm castings, peat/coco base, pumice aeration, and top-dressed mulch",
      );
    } else if (/coco/i.test(journalSummary.medium)) {
      setSoilComposition("70% buffered Coco Coir + 30% coarse Perlite for airy root oxygenation");
    } else if (/hydro/i.test(journalSummary.medium)) {
      setSoilComposition("Hydroponic / DWC aerated reservoir with clay pebbles (hydroton)");
    } else {
      setSoilComposition("Rich potting soil blended with 25% perlite and organic compost");
    }

    // Sync training methods already logged in the plant's journal
    if (journalSummary.trainingTechniques.length > 0) {
      const matched = TRAINING_OPTIONS.filter((opt) =>
        journalSummary.trainingTechniques.some((logged) =>
          logged.toLowerCase().includes(opt.toLowerCase()),
        ),
      );
      if (matched.length > 0) {
        setTrainingMethods(matched);
      }
    }
  }, [linkedPlant, journalSummary]);

  // Preload uploaded grow area image into an HTMLImageElement for instant canvas compositing
  useEffect(() => {
    if (!growAreaPhoto) {
      loadedBgImgRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      loadedBgImgRef.current = img;
    };
    img.src = growAreaPhoto;
  }, [growAreaPhoto]);

  const activeFertilizerSchedule = useMemo(
    () => fertSchedules.filter((f) => enabledFertIds.includes(f.id)),
    [fertSchedules, enabledFertIds],
  );

  const dailyTimeline = useMemo(() => {
    if (!plan) return [];
    return buildDailyGrowthTimeline(plan, trainingMethods, activeFertilizerSchedule);
  }, [plan, trainingMethods, activeFertilizerSchedule]);

  const effectiveSceneAnalysis = useMemo(() => {
    if (!plan) return null;
    if (!manualAnchor) return plan.sceneAnalysis;
    return {
      ...plan.sceneAnalysis,
      anchorX: manualAnchor.x,
      anchorY: manualAnchor.y,
    };
  }, [plan, manualAnchor]);

  // Render the 3 stage photos + day-by-day collage frames whenever plan, anchor, or overlay toggle changes
  const renderAllVisuals = useCallback(
    async (targetPlan: GrowthVisualizationPlan, timeline: DailyGrowthPoint[]) => {
      const genId = ++renderGenerationRef.current;

      // Ensure background image element is ready if growAreaPhoto is set
      let bgImg: HTMLImageElement | null = loadedBgImgRef.current;
      if (growAreaPhoto && (!bgImg || bgImg.src !== growAreaPhoto)) {
        bgImg = await new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = growAreaPhoto;
        });
        loadedBgImgRef.current = bgImg;
      }

      if (genId !== renderGenerationRef.current) return;

      const scene = manualAnchor
        ? { ...targetPlan.sceneAnalysis, anchorX: manualAnchor.x, anchorY: manualAnchor.y }
        : targetPlan.sceneAnalysis;

      // 1. Render the 3 main Stage Photos (Seedling, Vegetative, Flowering)
      const nextStageImages: Record<GrowthVisualStage, string> = {
        Seedling: "",
        Vegetative: "",
        Flowering: "",
      };

      for (const stagePlan of targetPlan.stages) {
        const repDayPoint =
          timeline.find((d) => d.day === stagePlan.representativeDay) ||
          timeline.find((d) => d.stage === stagePlan.stage && d.stageProgress >= 0.72) ||
          timeline[0];

        if (repDayPoint) {
          nextStageImages[stagePlan.stage] = renderPlantStageToDataUrl({
            backgroundImage: bgImg,
            setting,
            medium,
            soilComposition,
            plantName,
            strain,
            trainingMethods,
            sceneAnalysis: scene,
            strainProfile: targetPlan.strainProfile,
            dayPoint: repDayPoint,
            width: 640,
            height: 480,
            showOverlay: showOverlayLabels,
            compactBadge: false,
          });
        }
      }

      setStageImages(nextStageImages);

      // 2. Chunk-render EVERY single day for the Daily Growth Collage without blocking UI
      setRenderingCollage(true);
      setCollageProgress(0);
      const renderedDays: Array<{ day: number; dataUrl: string }> = [];
      const BATCH_SIZE = 7;

      for (let i = 0; i < timeline.length; i += BATCH_SIZE) {
        if (genId !== renderGenerationRef.current) return;
        const slice = timeline.slice(i, i + BATCH_SIZE);
        for (const pt of slice) {
          const url = renderPlantStageToDataUrl({
            backgroundImage: bgImg,
            setting,
            medium,
            soilComposition,
            plantName,
            strain,
            trainingMethods,
            sceneAnalysis: scene,
            strainProfile: targetPlan.strainProfile,
            dayPoint: pt,
            width: 240,
            height: 180,
            showOverlay: showOverlayLabels,
            compactBadge: true,
          });
          renderedDays.push({ day: pt.day, dataUrl: url });
        }
        setCollageProgress(Math.min(100, Math.round(((i + slice.length) / timeline.length) * 100)));
        setDailyImages([...renderedDays]);
        await new Promise((r) => setTimeout(r, 0));
      }

      if (genId === renderGenerationRef.current) {
        setRenderingCollage(false);
      }
    },
    [
      growAreaPhoto,
      manualAnchor,
      medium,
      plantName,
      setting,
      showOverlayLabels,
      soilComposition,
      strain,
      trainingMethods,
    ],
  );

  useEffect(() => {
    if (plan && dailyTimeline.length > 0) {
      void renderAllVisuals(plan, dailyTimeline);
    }
    return () => {
      renderGenerationRef.current += 1;
    };
  }, [plan, dailyTimeline, showOverlayLabels, manualAnchor, renderAllVisuals]);

  // Time-lapse autoplay timer
  useEffect(() => {
    if (!isPlayingTimelapse || dailyTimeline.length === 0) return;
    const timer = setInterval(() => {
      setActiveTimelapseDay((prev) => (prev >= dailyTimeline.length ? 1 : prev + 1));
    }, 180);
    return () => clearInterval(timer);
  }, [isPlayingTimelapse, dailyTimeline.length]);

  const handlePhotoUpload = async (file: File | undefined, target: "area" | "plant") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please choose an image file (JPG, PNG, or WEBP).");
      return;
    }
    setUploadingPhoto(true);
    setErrorMsg("");
    try {
      const compressed = await compressImage(file, {
        maxDimension: 960,
        quality: 0.8,
        maxBase64Length: 260000,
      });
      if (!compressed) {
        setErrorMsg("Could not read that photo. Please try another image.");
        return;
      }
      if (target === "area") {
        setGrowAreaPhoto(compressed);
        setManualAnchor(null);
      } else {
        setPlantPhoto(compressed);
      }
    } catch {
      setErrorMsg("Failed to process image. Please try another photo.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleToggleTraining = (method: string) => {
    setTrainingMethods((prev) => {
      if (method === "Natural / Untrained") {
        return prev.includes(method) ? [] : ["Natural / Untrained"];
      }
      const withoutNatural = prev.filter((m) => m !== "Natural / Untrained");
      if (withoutNatural.includes(method)) {
        return withoutNatural.filter((m) => m !== method);
      }
      return [...withoutNatural, method];
    });
  };

  const handleAppendSoilIngredient = (ingredient: string) => {
    setSoilComposition((prev) => {
      if (prev.toLowerCase().includes(ingredient.toLowerCase())) return prev;
      return prev.trim() ? `${prev.trim()}, ${ingredient}` : ingredient;
    });
  };

  const handleToggleFertEnabled = (id: string) => {
    setEnabledFertIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleToggleFertStage = (id: string, stage: GrowthVisualStage) => {
    setFertSchedules((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const has = item.stages.includes(stage);
        const nextStages = has ? item.stages.filter((s) => s !== stage) : [...item.stages, stage];
        const safeStages: GrowthVisualStage[] = nextStages.length > 0 ? nextStages : [stage];
        return {
          ...item,
          stages: safeStages,
          startWeek: safeStages.includes("Seedling")
            ? 1
            : safeStages.includes("Vegetative")
              ? 3
              : 7,
          endWeek: safeStages.includes("Flowering")
            ? 14
            : safeStages.includes("Vegetative")
              ? 8
              : 3,
        };
      }),
    );
  };

  const handleUpdateFertFrequency = (id: string, frequency: string) => {
    setFertSchedules((prev) =>
      prev.map((item) => (item.id === id ? { ...item, frequency } : item)),
    );
  };

  const handleAddCustomFertilizer = () => {
    const trimmed = customFertName.trim();
    if (!trimmed) return;
    const newId = `custom-${Date.now().toString(36)}`;
    const entry: FertilizerScheduleEntry = {
      id: newId,
      name: trimmed,
      fertilizerType: "Custom Feed",
      form: "Diluted",
      stages: [customFertStage],
      frequency: customFertFreq,
      startWeek: customFertStage === "Seedling" ? 1 : customFertStage === "Vegetative" ? 3 : 7,
      endWeek: customFertStage === "Flowering" ? 14 : customFertStage === "Vegetative" ? 8 : 3,
    };
    setFertSchedules((prev) => [...prev, entry]);
    setEnabledFertIds((prev) => [...prev, newId]);
    setCustomFertName("");
  };

  const handleAnchorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0.18, Math.min(0.82, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0.52, Math.min(0.88, (e.clientY - rect.top) / rect.height));
    setManualAnchor({ x: +x.toFixed(3), y: +y.toFixed(3) });
  };

  const handleGenerate = async () => {
    setLoading(true);
    setErrorMsg("");
    setSavedToast(null);
    setIsPlayingTimelapse(false);

    try {
      const response = await generateGrowthVisualizationPlan({
        growAreaPhotoBase64: growAreaPhoto || undefined,
        growAreaMimeType: "image/jpeg",
        plantPhotoBase64: plantPhoto || undefined,
        plantPhotoMimeType: "image/jpeg",
        plantName: plantName.trim() || strain.trim() || "Garden Plant",
        strain: strain.trim() || "Hybrid Cultivar",
        plantType,
        setting,
        medium,
        soilComposition: soilComposition.trim() || medium,
        trainingMethods: trainingMethods.length > 0 ? trainingMethods : ["Natural / Untrained"],
        fertilizerSchedule: activeFertilizerSchedule,
        totalDays,
        notes: extraNotes.trim() || undefined,
        journalContext: journalSummary || undefined,
      });

      setPlan(response);
      setActiveTimelapseDay(1);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Could not generate growth previews right now. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSavePhotoToJournal = async (dataUrl: string, caption: string) => {
    if (!onLogToPlant || !selectedPlantId) {
      setErrorMsg("Select a saved plant from My Grows above to log this photo to its journal.");
      return;
    }
    try {
      // Compress safely for Firestore 1MiB document budget
      const compressed =
        (await compressImage(dataUrl, {
          maxDimension: 512,
          quality: 0.62,
          maxBase64Length: 62000,
        })) || dataUrl;

      await onLogToPlant([selectedPlantId], {
        type: "photo",
        note: caption,
        photo: compressed,
      });

      setSavedToast(`✓ Saved "${caption}" to ${linkedPlant?.name || "plant"}'s journal!`);
      setTimeout(() => setSavedToast(null), 4000);
    } catch {
      setErrorMsg("Could not save preview to plant journal.");
    }
  };

  const handleDownloadFullCollage = async () => {
    if (!plan || dailyImages.length === 0) return;
    setDownloadingPoster(true);
    try {
      const filtered = dailyImages
        .map((img) => {
          const pt = dailyTimeline.find((d) => d.day === img.day);
          return pt ? { day: pt.day, stage: pt.stage, dataUrl: img.dataUrl } : null;
        })
        .filter((x): x is { day: number; stage: string; dataUrl: string } => Boolean(x))
        .filter((x) => collageStageFilter === "All" || x.stage === collageStageFilter);

      const posterUrl = await buildDownloadableCollagePoster({
        dayImages: filtered,
        plan,
        plantName,
        strain,
        soilComposition,
        trainingMethods,
      });

      if (posterUrl) {
        triggerImageDownload(
          posterUrl,
          `${(plantName || "plant").toLowerCase().replace(/\s+/g, "-")}-daily-growth-collage.jpg`,
        );
      }
    } finally {
      setDownloadingPoster(false);
    }
  };

  const handleSaveCollageToJournal = async () => {
    if (!plan || dailyImages.length === 0) return;
    const sample = dailyImages
      .filter((_, idx) => idx % Math.max(1, Math.floor(dailyImages.length / 18)) === 0)
      .map((img) => {
        const pt = dailyTimeline.find((d) => d.day === img.day);
        return { day: img.day, stage: pt?.stage || "Growth", dataUrl: img.dataUrl };
      });
    const posterUrl = await buildDownloadableCollagePoster({
      dayImages: sample,
      plan,
      plantName,
      strain,
      soilComposition,
      trainingMethods,
    });
    if (posterUrl) {
      await handleSavePhotoToJournal(
        posterUrl,
        `[AI Growth Collage] ${plantName} (${strain}) — ${totalDays}-day progression (${trainingMethods.join(", ") || "Natural"})`,
      );
    }
  };

  const filteredCollageDays = useMemo(() => {
    return dailyTimeline.filter(
      (pt) => collageStageFilter === "All" || pt.stage === collageStageFilter,
    );
  }, [dailyTimeline, collageStageFilter]);

  const dailyImageMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of dailyImages) {
      map.set(item.day, item.dataUrl);
    }
    return map;
  }, [dailyImages]);

  const activeTimelapsePoint = useMemo(() => {
    return dailyTimeline.find((d) => d.day === activeTimelapseDay) || dailyTimeline[0] || null;
  }, [dailyTimeline, activeTimelapseDay]);

  const activeTimelapsePreviewUrl = useMemo(() => {
    if (!plan || !activeTimelapsePoint || !effectiveSceneAnalysis) return "";
    return renderPlantStageToDataUrl({
      backgroundImage: loadedBgImgRef.current,
      setting,
      medium,
      soilComposition,
      plantName,
      strain,
      trainingMethods,
      sceneAnalysis: effectiveSceneAnalysis,
      strainProfile: plan.strainProfile,
      dayPoint: activeTimelapsePoint,
      width: 640,
      height: 480,
      showOverlay: showOverlayLabels,
      compactBadge: false,
    });
  }, [
    plan,
    activeTimelapsePoint,
    effectiveSceneAnalysis,
    setting,
    medium,
    soilComposition,
    plantName,
    strain,
    trainingMethods,
    showOverlayLabels,
  ]);

  return (
    <div className="space-y-5" data-testid="growth-visualizer-section">
      {/* Header Card */}
      <div className="rounded-2xl border border-primary/30 bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                AI Growth Stage Visualizer &amp; Daily Collage
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upload your grow area &amp; plant photos, link your soil mix, seed strain,
                fertilizer schedule &amp; training — see 3 stage previews (Seedling, Veg, Flower)
                plus a day-by-day growth collage.
              </p>
            </div>
          </div>
          {plan && (
            <button
              type="button"
              onClick={() => {
                setPlan(null);
                setDailyImages([]);
                setIsPlayingTimelapse(false);
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80 transition cursor-pointer shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Step 1: Link to Plant Journal */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="visualizer-plant-select"
            className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>1. Link to Your Grow Diary Plant</span>
          </label>
          {linkedPlant && onNavigateToPlant && (
            <button
              type="button"
              onClick={() => onNavigateToPlant(linkedPlant.id)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
            >
              <span>Open {linkedPlant.name} Journal</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>

        <select
          id="visualizer-plant-select"
          value={selectedPlantId}
          onChange={(e) => setSelectedPlantId(e.target.value)}
          className="w-full rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Custom / New Grow Plan (Unlinked)</option>
          {plants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.strain || p.type} ({p.stage} · {p.medium})
            </option>
          ))}
        </select>

        {journalSummary && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {journalSummary.journalContextBadges.map((badge, idx) => (
              <span
                key={idx}
                className="rounded-lg border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-foreground"
              >
                {badge}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Step 2: Upload Grow Area & Plant Photos */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5" />
            <span>2. Upload Your Grow Area &amp; Plant Photos</span>
          </h3>
          {journalSummary?.latestPhoto && (
            <button
              type="button"
              onClick={() => {
                setGrowAreaPhoto(journalSummary.latestPhoto || null);
                setManualAnchor(null);
              }}
              className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition cursor-pointer"
            >
              Use Plant&apos;s Journal Photo
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Grow Area / Spot Photo */}
          <div className="rounded-xl border border-border bg-secondary/35 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">Grow Area / Planting Spot</p>
                <p className="text-[11px] text-muted-foreground">
                  Garden bed, pot, greenhouse, or tent backdrop
                </p>
              </div>
              {growAreaPhoto && (
                <button
                  type="button"
                  onClick={() => {
                    setGrowAreaPhoto(null);
                    setManualAnchor(null);
                  }}
                  className="rounded-lg p-1 text-muted-foreground hover:text-destructive transition cursor-pointer"
                  aria-label="Remove grow area photo"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {growAreaPhoto ? (
              <div className="space-y-1.5">
                <div
                  onClick={handleAnchorClick}
                  className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-primary/40 cursor-crosshair select-none"
                  title="Tap where your plant grows in the soil or pot"
                >
                  <img
                    src={growAreaPhoto}
                    alt="Uploaded grow area"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                  <div
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                    style={{
                      left: `${(manualAnchor?.x ?? plan?.sceneAnalysis.anchorX ?? 0.5) * 100}%`,
                      top: `${(manualAnchor?.y ?? plan?.sceneAnalysis.anchorY ?? 0.76) * 100}%`,
                    }}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-white">
                      <Crosshair className="h-3.5 w-3.5" />
                    </span>
                    <span className="mt-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-semibold text-white whitespace-nowrap">
                      Planting Spot
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Crosshair className="h-3 w-3 text-primary" />
                  <span>Tap anywhere on your grow area photo to adjust where the stem grows.</span>
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                <label className="flex-1 min-w-[120px] cursor-pointer rounded-xl border border-dashed border-border bg-card px-3 py-4 text-center hover:border-primary transition flex flex-col items-center gap-1.5">
                  <Upload className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Upload Grow Area</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingPhoto}
                    className="sr-only"
                    onChange={(e) => {
                      void handlePhotoUpload(e.target.files?.[0], "area");
                      e.target.value = "";
                    }}
                  />
                </label>
                <label className="cursor-pointer rounded-xl border border-primary/30 bg-primary/10 px-3 py-4 text-center hover:bg-primary/20 transition flex flex-col items-center justify-center gap-1.5">
                  <Camera className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-primary">Camera</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={uploadingPhoto}
                    className="sr-only"
                    onChange={(e) => {
                      void handlePhotoUpload(e.target.files?.[0], "area");
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Current Plant / Seed Reference Photo (Optional) */}
          <div className="rounded-xl border border-border bg-secondary/35 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Current Plant Photo (Optional)
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Helps AI inspect current leaf color &amp; stem shape
                </p>
              </div>
              {plantPhoto && (
                <button
                  type="button"
                  onClick={() => setPlantPhoto(null)}
                  className="rounded-lg p-1 text-muted-foreground hover:text-destructive transition cursor-pointer"
                  aria-label="Remove plant reference photo"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {plantPhoto ? (
              <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-border">
                <img
                  src={plantPhoto}
                  alt="Current plant reference"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                <label className="flex-1 min-w-[120px] cursor-pointer rounded-xl border border-dashed border-border bg-card px-3 py-4 text-center hover:border-primary transition flex flex-col items-center gap-1.5">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">Upload Plant Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingPhoto}
                    className="sr-only"
                    onChange={(e) => {
                      void handlePhotoUpload(e.target.files?.[0], "plant");
                      e.target.value = "";
                    }}
                  />
                </label>
                <label className="cursor-pointer rounded-xl border border-border bg-card px-3 py-4 text-center hover:bg-secondary transition flex flex-col items-center justify-center gap-1.5">
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">Snap</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={uploadingPhoto}
                    className="sr-only"
                    onChange={(e) => {
                      void handlePhotoUpload(e.target.files?.[0], "plant");
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Step 3: Strain, Medium & Soil Composition */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3.5 shadow-xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Sprout className="h-3.5 w-3.5" />
          <span>3. Seed Strain, Growing Medium &amp; Soil Mix</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Seed Strain / Cultivar
            </label>
            <input
              type="text"
              value={strain}
              onChange={(e) => setStrain(e.target.value)}
              placeholder="e.g. Purple Trainwreck, Northern Lights, Blue Dream"
              className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Growing Medium
            </label>
            <select
              value={medium}
              onChange={(e) => setMedium(e.target.value)}
              className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {MEDIUM_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Seed Genetics &amp; Setting
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <select
                value={plantType}
                onChange={(e) => {
                  const next = e.target.value as "Photoperiod" | "Autoflower";
                  setPlantType(next);
                  setTotalDays(next === "Autoflower" ? 84 : 98);
                }}
                className="rounded-xl border border-border bg-secondary px-2.5 py-2 text-xs font-semibold text-foreground outline-none"
              >
                <option value="Photoperiod">Photoperiod</option>
                <option value="Autoflower">Autoflower</option>
              </select>
              <select
                value={setting}
                onChange={(e) => setSetting(e.target.value as "Indoor" | "Outdoor" | "Greenhouse")}
                className="rounded-xl border border-border bg-secondary px-2.5 py-2 text-xs font-semibold text-foreground outline-none"
              >
                <option value="Outdoor">Outdoor</option>
                <option value="Indoor">Indoor</option>
                <option value="Greenhouse">Greenhouse</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Daily Collage Cycle Length
            </label>
            <div className="flex gap-1.5">
              {CYCLE_DAY_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setTotalDays(d)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition cursor-pointer ${
                    totalDays === d
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Soil Composition */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted-foreground">
            What Your Soil / Growing Medium Is Made Of
          </label>
          <textarea
            rows={2}
            value={soilComposition}
            onChange={(e) => setSoilComposition(e.target.value)}
            placeholder="Describe your soil mix (e.g. 40% topsoil, 30% compost, 20% pumice, 10% worm castings + straw mulch)..."
            className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {SOIL_INGREDIENT_PRESETS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleAppendSoilIngredient(item)}
                className="rounded-lg border border-border bg-secondary/70 px-2 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground transition cursor-pointer"
              >
                + {item}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Step 4: Fertilizers & When You Will Use Them (Linked to Fertilizer Journal) */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <FlaskConical className="h-3.5 w-3.5" />
            <span>4. Fertilizers &amp; Feeding Schedule</span>
          </h3>
          <span className="text-[11px] text-muted-foreground">
            Synced with Fertilizer Journal ({activeFertilizerSchedule.length} active)
          </span>
        </div>

        {fertSchedules.length > 0 ? (
          <div className="space-y-2">
            {fertSchedules.map((fert) => {
              const isChecked = enabledFertIds.includes(fert.id);
              return (
                <div
                  key={fert.id}
                  className={`rounded-xl border p-3 transition space-y-2 ${
                    isChecked
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-secondary/30 opacity-65"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleFertEnabled(fert.id)}
                        className="h-4 w-4 accent-primary rounded cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-foreground">{fert.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        ({fert.fertilizerType}
                        {fert.dilutionRatio ? ` · ${fert.dilutionRatio}` : ` · ${fert.form}`})
                      </span>
                    </label>

                    <select
                      value={fert.frequency}
                      disabled={!isChecked}
                      onChange={(e) => handleUpdateFertFrequency(fert.id, e.target.value)}
                      className="rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground outline-none"
                    >
                      {FREQUENCY_OPTIONS.map((freq) => (
                        <option key={freq} value={freq}>
                          {freq}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isChecked && (
                    <div className="flex flex-wrap items-center gap-1.5 pl-6">
                      <span className="text-[10px] font-semibold text-muted-foreground mr-1">
                        Use during:
                      </span>
                      {(["Seedling", "Vegetative", "Flowering"] as const).map((st) => {
                        const active = fert.stages.includes(st);
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleToggleFertStage(fert.id, st)}
                            className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold transition cursor-pointer ${
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-card text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {st}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No fertilizers in your Fertilizer Journal yet — add any brew or feed below.
          </p>
        )}

        {/* Quick add custom fertilizer to schedule */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-border/60">
          <input
            type="text"
            value={customFertName}
            onChange={(e) => setCustomFertName(e.target.value)}
            placeholder="Add extra fertilizer (e.g. Kelp Tea, Cal-Mag, Bloom Booster)..."
            className="flex-1 min-w-[180px] rounded-xl border border-border bg-secondary px-3 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={customFertStage}
            onChange={(e) => setCustomFertStage(e.target.value as GrowthVisualStage)}
            className="rounded-xl border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground outline-none"
          >
            <option value="Seedling">Seedling</option>
            <option value="Vegetative">Vegetative</option>
            <option value="Flowering">Flowering</option>
          </select>
          <select
            value={customFertFreq}
            onChange={(e) => setCustomFertFreq(e.target.value)}
            className="rounded-xl border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground outline-none"
          >
            {FREQUENCY_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddCustomFertilizer}
            className="inline-flex items-center gap-1 rounded-xl bg-secondary border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary transition cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 text-primary" />
            <span>Add</span>
          </button>
        </div>
      </section>

      {/* Step 5: Plant Training Methods */}
      <section className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Scissors className="h-3.5 w-3.5" />
            <span>5. Plant Training Methods</span>
          </h3>
          <span className="text-[11px] text-muted-foreground">
            Shapes canopy height &amp; cola layout
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {TRAINING_OPTIONS.map((method) => {
            const active = trainingMethods.includes(method);
            return (
              <button
                key={method}
                type="button"
                onClick={() => handleToggleTraining(method)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-xs"
                    : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {active ? "✓ " : ""}
                {method}
              </button>
            );
          })}
        </div>

        <input
          type="text"
          value={extraNotes}
          onChange={(e) => setExtraNotes(e.target.value)}
          placeholder="Optional extra notes (e.g. topping at 5th node, 14h NZ summer sunlight, trellis at 60cm)..."
          className="w-full rounded-xl border border-border bg-secondary px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
      </section>

      {/* Error / Toast Banners */}
      {errorMsg && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {savedToast && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/15 px-3.5 py-2.5 text-xs font-semibold text-primary">
          <Check className="h-4 w-4 shrink-0" />
          <span>{savedToast}</span>
        </div>
      )}

      {/* Primary Generate CTA */}
      <button
        type="button"
        disabled={loading}
        onClick={handleGenerate}
        data-testid="generate-growth-visuals-btn"
        className="w-full rounded-2xl bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 active:scale-[0.99] transition flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Analyzing Grow Area &amp; Generating Stage Previews…</span>
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            <span>Generate 3-Stage Photos &amp; {totalDays}-Day Growth Collage</span>
          </>
        )}
      </button>

      {/* Generated Results Section */}
      {plan && (
        <div className="space-y-4 pt-2" data-testid="growth-visualizer-results">
          {/* Summary Banner */}
          <div className="rounded-2xl border border-primary/35 bg-primary/10 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-foreground">{plan.planTitle}</h3>
              <button
                type="button"
                onClick={() => setShowOverlayLabels((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-secondary transition cursor-pointer"
              >
                {showOverlayLabels ? (
                  <>
                    <Eye className="h-3.5 w-3.5 text-primary" />
                    <span>Labels On</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Clean Photo</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{plan.growSummary}</p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="rounded-xl bg-card/90 border border-border p-2 text-center">
                <div className="text-[10px] uppercase text-muted-foreground">Est. Final Height</div>
                <div className="text-sm font-bold text-foreground">
                  {plan.strainProfile.expectedHeightCm} cm
                </div>
              </div>
              <div className="rounded-xl bg-card/90 border border-border p-2 text-center">
                <div className="text-[10px] uppercase text-muted-foreground">Canopy Spread</div>
                <div className="text-sm font-bold text-foreground">
                  {plan.strainProfile.expectedCanopyWidthCm} cm
                </div>
              </div>
              <div className="rounded-xl bg-card/90 border border-border p-2 text-center">
                <div className="text-[10px] uppercase text-muted-foreground">Full Cycle</div>
                <div className="text-sm font-bold text-foreground">{dailyTimeline.length} Days</div>
              </div>
            </div>
          </div>

          {/* Section Switcher: 3-Stage Photos vs Day-by-Day Collage */}
          <div className="flex rounded-2xl bg-secondary p-1 border border-border gap-1">
            <button
              type="button"
              onClick={() => setViewMode("three-stage")}
              data-testid="view-mode-three-stage"
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                viewMode === "three-stage"
                  ? "bg-card text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Layers className="h-4 w-4 text-primary" />
              <span>3-Stage Photos (Seedling · Veg · Flower)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("daily-collage")}
              data-testid="view-mode-daily-collage"
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                viewMode === "daily-collage"
                  ? "bg-card text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Grid3X3 className="h-4 w-4 text-amber-500" />
              <span>Daily Growth Collage ({dailyTimeline.length} Days)</span>
            </button>
          </div>

          {/* VIEW 1: EXACTLY 3 PHOTOS (1 Seedling, 1 Vegetative, 1 Flowering) */}
          {viewMode === "three-stage" && (
            <div className="space-y-4" data-testid="three-stage-gallery">
              {plan.stages.map((st) => {
                const imgSrc = stageImages[st.stage];
                const badgeColor =
                  st.stage === "Seedling"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : st.stage === "Vegetative"
                      ? "bg-green-600/15 text-green-700 dark:text-green-400 border-green-600/30"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";

                return (
                  <article
                    key={st.stage}
                    data-testid={`stage-card-${st.stage.toLowerCase()}`}
                    className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm"
                  >
                    <div className="p-3.5 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-secondary/25">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-lg border px-2.5 py-0.5 text-xs font-bold ${badgeColor}`}
                        >
                          {st.stage}
                        </span>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {st.dayRange} · Previewing Day {st.representativeDay}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">
                        {st.heightCm} cm H × {st.canopyWidthCm} cm W
                      </span>
                    </div>

                    {/* Rendered Stage Photo */}
                    <div className="relative aspect-[4/3] w-full bg-secondary/40">
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={`${plantName} ${st.stage} stage preview`}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                          Rendering {st.stage} stage preview…
                        </div>
                      )}
                    </div>

                    {/* Stage Morphological Breakdown */}
                    <div className="p-4 space-y-3">
                      <div>
                        <h4 className="text-sm font-bold text-foreground">{st.headline}</h4>
                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                          {st.visualDetails}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-xl border border-border bg-secondary/40 p-2.5">
                          <div className="font-bold text-foreground mb-0.5">
                            Fertilizers Active Here
                          </div>
                          <div className="text-muted-foreground">
                            {st.activeFertilizers.join(" · ")}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border bg-secondary/40 p-2.5">
                          <div className="font-bold text-foreground mb-0.5">Training Applied</div>
                          <div className="text-muted-foreground">
                            {st.activeTraining.join(" · ")}
                          </div>
                        </div>
                      </div>

                      <p className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-foreground">
                        <strong className="text-primary">Gardener Tip:</strong> {st.careTip}
                      </p>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {imgSrc && (
                          <button
                            type="button"
                            onClick={() =>
                              triggerImageDownload(
                                imgSrc,
                                `${(plantName || "plant").toLowerCase().replace(/\s+/g, "-")}-${st.stage.toLowerCase()}-day-${st.representativeDay}.jpg`,
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary/80 transition cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5 text-primary" />
                            <span>Download {st.stage} Photo</span>
                          </button>
                        )}
                        {imgSrc && onLogToPlant && selectedPlantId && (
                          <button
                            type="button"
                            onClick={() =>
                              handleSavePhotoToJournal(
                                imgSrc,
                                `[AI ${st.stage} Stage Preview · Day ${st.representativeDay}] ${st.headline} (${st.heightCm}cm, ${medium})`,
                              )
                            }
                            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition cursor-pointer"
                          >
                            <BookOpen className="h-3.5 w-3.5" />
                            <span>Save to {linkedPlant?.name || "Plant"} Journal</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* VIEW 2: DAY-BY-DAY GROWTH COLLAGE (EVERY SINGLE DAY OF GROWTH) */}
          {viewMode === "daily-collage" && (
            <div className="space-y-4" data-testid="daily-collage-gallery">
              {/* Interactive Day-by-Day Time-Lapse Player */}
              {activeTimelapsePoint && (
                <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
                  <div className="p-3.5 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-secondary/25">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-primary" />
                      <span className="text-xs font-bold text-foreground">
                        Day-by-Day Time-Lapse Scrubber
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-primary">
                      Day {activeTimelapsePoint.day} of {dailyTimeline.length} ·{" "}
                      {activeTimelapsePoint.stage} (Week {activeTimelapsePoint.week})
                    </span>
                  </div>

                  <div className="aspect-[4/3] w-full bg-secondary/40 relative">
                    {activeTimelapsePreviewUrl ? (
                      <img
                        src={activeTimelapsePreviewUrl}
                        alt={`Day ${activeTimelapsePoint.day} growth preview`}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        Day {activeTimelapsePoint.day} preview
                      </div>
                    )}
                  </div>

                  <div className="p-3.5 space-y-2.5">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setIsPlayingTimelapse((p) => !p)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition cursor-pointer shrink-0"
                      >
                        {isPlayingTimelapse ? (
                          <>
                            <Pause className="h-3.5 w-3.5" />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5" />
                            <span>Play Growth</span>
                          </>
                        )}
                      </button>
                      <input
                        type="range"
                        min={1}
                        max={dailyTimeline.length}
                        value={activeTimelapseDay}
                        onChange={(e) => {
                          setIsPlayingTimelapse(false);
                          setActiveTimelapseDay(Number(e.target.value));
                        }}
                        aria-label="Scrub day of growth"
                        className="w-full accent-primary cursor-pointer"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>
                        Height:{" "}
                        <strong className="text-foreground">
                          {activeTimelapsePoint.heightCm} cm
                        </strong>{" "}
                        · Width:{" "}
                        <strong className="text-foreground">
                          {activeTimelapsePoint.canopyWidthCm} cm
                        </strong>{" "}
                        · Nodes:{" "}
                        <strong className="text-foreground">{activeTimelapsePoint.nodes}</strong>
                      </span>
                      {activeTimelapsePoint.milestone && (
                        <span className="rounded-lg bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          ★ {activeTimelapsePoint.milestone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Collage Controls: Stage Filters + Export Full Poster */}
              <div className="rounded-2xl border border-border bg-card p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(["All", "Seedling", "Vegetative", "Flowering"] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setCollageStageFilter(filter)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                          collageStageFilter === filter
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {filter === "All"
                          ? `All Days (${dailyTimeline.length})`
                          : `${filter} (${dailyTimeline.filter((d) => d.stage === filter).length}d)`}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={downloadingPoster || renderingCollage || dailyImages.length === 0}
                      onClick={handleDownloadFullCollage}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition cursor-pointer"
                    >
                      {downloadingPoster ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      <span>Download Collage Poster</span>
                    </button>
                    {onLogToPlant && selectedPlantId && (
                      <button
                        type="button"
                        disabled={renderingCollage || dailyImages.length === 0}
                        onClick={handleSaveCollageToJournal}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary disabled:opacity-50 transition cursor-pointer"
                      >
                        <BookOpen className="h-3.5 w-3.5 text-primary" />
                        <span>Save Collage to Journal</span>
                      </button>
                    )}
                  </div>
                </div>

                {renderingCollage && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        Rendering every day of your {dailyTimeline.length}-day growth collage…
                      </span>
                      <span className="font-mono font-bold text-primary">{collageProgress}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-150"
                        style={{ width: `${collageProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Every-Day Photo Grid */}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {filteredCollageDays.map((pt) => {
                    const thumb = dailyImageMap.get(pt.day);
                    return (
                      <button
                        key={pt.day}
                        type="button"
                        onClick={() => {
                          setInspectedDay(pt);
                          setActiveTimelapseDay(pt.day);
                        }}
                        className={`group relative rounded-xl border overflow-hidden text-left transition hover:border-primary cursor-pointer bg-secondary/40 ${
                          pt.milestone
                            ? "border-primary/60 ring-1 ring-primary/30"
                            : "border-border"
                        }`}
                      >
                        <div className="aspect-[4/3] w-full bg-secondary/60 overflow-hidden">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={`Day ${pt.day} — ${pt.stage}`}
                              referrerPolicy="no-referrer"
                              loading="lazy"
                              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                              Day {pt.day}
                            </div>
                          )}
                        </div>
                        <div className="px-1.5 py-1 flex items-center justify-between gap-1 bg-card">
                          <span className="text-[10px] font-bold text-foreground">
                            Day {pt.day}
                          </span>
                          <span className="text-[9px] text-muted-foreground">{pt.heightCm}cm</span>
                        </div>
                        {pt.milestone && (
                          <span
                            title={pt.milestone}
                            className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-black/60"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Day Detail Inspection Modal */}
      {inspectedDay && plan && effectiveSceneAnalysis && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={() => setInspectedDay(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-card overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3.5 border-b border-border bg-secondary/30">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-bold text-foreground">
                  Day {inspectedDay.day} · {inspectedDay.stage} (Week {inspectedDay.week})
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setInspectedDay(null)}
                className="rounded-lg p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Close day preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {(() => {
              const hiResUrl = renderPlantStageToDataUrl({
                backgroundImage: loadedBgImgRef.current,
                setting,
                medium,
                soilComposition,
                plantName,
                strain,
                trainingMethods,
                sceneAnalysis: effectiveSceneAnalysis,
                strainProfile: plan.strainProfile,
                dayPoint: inspectedDay,
                width: 640,
                height: 480,
                showOverlay: showOverlayLabels,
                compactBadge: false,
              });
              return (
                <>
                  <div className="aspect-[4/3] w-full bg-secondary/50">
                    {hiResUrl && (
                      <img
                        src={hiResUrl}
                        alt={`Day ${inspectedDay.day} full preview`}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="p-4 space-y-3">
                    {inspectedDay.milestone && (
                      <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                        ★ Milestone: {inspectedDay.milestone}
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-secondary/60 p-2">
                        <div className="text-[10px] text-muted-foreground">Height</div>
                        <div className="text-xs font-bold text-foreground">
                          {inspectedDay.heightCm} cm
                        </div>
                      </div>
                      <div className="rounded-xl bg-secondary/60 p-2">
                        <div className="text-[10px] text-muted-foreground">Canopy Width</div>
                        <div className="text-xs font-bold text-foreground">
                          {inspectedDay.canopyWidthCm} cm
                        </div>
                      </div>
                      <div className="rounded-xl bg-secondary/60 p-2">
                        <div className="text-[10px] text-muted-foreground">Leaf Nodes</div>
                        <div className="text-xs font-bold text-foreground">
                          {inspectedDay.nodes}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>
                        <strong className="text-foreground">Scheduled Feeds:</strong>{" "}
                        {inspectedDay.activeFertilizers.length > 0
                          ? inspectedDay.activeFertilizers.join(", ")
                          : `Base ${medium} biology / plain water`}
                      </p>
                      <p>
                        <strong className="text-foreground">Training Active:</strong>{" "}
                        {inspectedDay.trainingApplied.length > 0
                          ? inspectedDay.trainingApplied.join(", ")
                          : "Natural structure"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {hiResUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            triggerImageDownload(
                              hiResUrl,
                              `${(plantName || "plant").toLowerCase().replace(/\s+/g, "-")}-day-${inspectedDay.day}.jpg`,
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary/80 transition cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5 text-primary" />
                          <span>Download Day {inspectedDay.day}</span>
                        </button>
                      )}
                      {hiResUrl && onLogToPlant && selectedPlantId && (
                        <button
                          type="button"
                          onClick={async () => {
                            await handleSavePhotoToJournal(
                              hiResUrl,
                              `[AI Growth Preview · Day ${inspectedDay.day} (${inspectedDay.stage})] Est. ${inspectedDay.heightCm}cm — ${inspectedDay.milestone || strain}`,
                            );
                            setInspectedDay(null);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition cursor-pointer"
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          <span>Save to Journal</span>
                        </button>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
