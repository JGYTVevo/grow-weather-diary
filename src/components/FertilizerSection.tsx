import React, { useState } from "react";
import {
  HOMEMADE_FERTILIZER_TYPES,
  DILUTION_RATIO_PRESETS,
  RAW_DOSAGE_PRESETS,
  type HomemadeFertilizer,
  type FertilizerForm,
} from "@/hooks/use-fertilizers";
import type { Plant, Log } from "@/hooks/use-plants";
import type { FirebaseUser } from "@/lib/firebase";
import {
  FlaskConical,
  Droplets,
  Plus,
  Trash2,
  Check,
  Sprout,
  Beaker,
  Sparkles,
  Cloud,
} from "lucide-react";

interface FertilizerSectionProps {
  fertilizers: HomemadeFertilizer[];
  onAddFertilizer: (
    item: Omit<HomemadeFertilizer, "id" | "createdAt">,
  ) => Promise<HomemadeFertilizer>;
  onUpdateFertilizer: (
    id: string,
    fn: (f: HomemadeFertilizer) => HomemadeFertilizer,
  ) => Promise<void>;
  onDeleteFertilizer: (id: string) => Promise<void>;
  plants?: Plant[];
  defaultPlantId?: string | null;
  onLogFeedToPlants?: (plantIds: string[], logData: Omit<Log, "id">) => Promise<void>;
  currentUser?: FirebaseUser | null;
  onOpenAccount?: () => void;
}

const TARGET_STAGES = ["All Stages", "Seedling", "Vegetative", "Flowering"] as const;

export const FertilizerSection: React.FC<FertilizerSectionProps> = ({
  fertilizers,
  onAddFertilizer,
  onUpdateFertilizer,
  onDeleteFertilizer,
  plants = [],
  defaultPlantId = null,
  onLogFeedToPlants,
  currentUser,
  onOpenAccount,
}) => {
  const [adding, setAdding] = useState(false);
  const [filterForm, setFilterForm] = useState<"All" | FertilizerForm>("All");
  const [name, setName] = useState("");
  const [fertilizerType, setFertilizerType] = useState<string>(HOMEMADE_FERTILIZER_TYPES[0]);
  const [customType, setCustomType] = useState("");
  const [form, setForm] = useState<FertilizerForm>("Diluted");
  const [dilutionRatio, setDilutionRatio] = useState<string>("1:10 (100ml/L)");
  const [targetStage, setTargetStage] = useState<string>("All Stages");
  const [ingredients, setIngredients] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  // Inline "Log Feed to Plant(s)" state
  const [feedingFertId, setFeedingFertId] = useState<string | null>(null);
  const [feedPlantIds, setFeedPlantIds] = useState<string[]>([]);
  const [feedFormMode, setFeedFormMode] = useState<FertilizerForm>("Diluted");
  const [feedRatio, setFeedRatio] = useState<string>("");
  const [feedAmountL, setFeedAmountL] = useState<string>("1.0");
  const [feedPh, setFeedPh] = useState<string>("");
  const [feedEc, setFeedEc] = useState<string>("");
  const [feedNote, setFeedNote] = useState<string>("");
  const [feedSavedId, setFeedSavedId] = useState<string | null>(null);

  const activePlants = plants.filter((p) => p.stage !== "Harvested");
  const selectablePlants = activePlants.length > 0 ? activePlants : plants;

  const rawCount = fertilizers.filter((f) => f.form === "Raw").length;
  const dilutedCount = fertilizers.filter((f) => f.form === "Diluted").length;
  const filteredFertilizers =
    filterForm === "All" ? fertilizers : fertilizers.filter((f) => f.form === filterForm);

  const handleSwitchForm = (nextForm: FertilizerForm) => {
    setForm(nextForm);
    if (nextForm === "Diluted") {
      if (!dilutionRatio || RAW_DOSAGE_PRESETS.includes(dilutionRatio as never)) {
        setDilutionRatio("1:10 (100ml/L)");
      }
    } else {
      if (!dilutionRatio || DILUTION_RATIO_PRESETS.includes(dilutionRatio as never)) {
        setDilutionRatio("Straight drench (undiluted)");
      }
    }
  };

  const handleSaveNewFertilizer = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setFormError("Please enter a name for your homemade fertilizer.");
      return;
    }

    const finalType =
      fertilizerType === "Custom Homemade Brew" && customType.trim()
        ? customType.trim()
        : fertilizerType;

    setFormError(null);
    await onAddFertilizer({
      name: cleanName,
      fertilizerType: finalType,
      form,
      dilutionRatio: dilutionRatio.trim() || (form === "Diluted" ? "1:10" : "Raw / Undiluted"),
      targetStage,
      ingredients: ingredients.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    setName("");
    setCustomType("");
    setIngredients("");
    setNotes("");
    setAdding(false);
  };

  const openFeedPanel = (fert: HomemadeFertilizer) => {
    if (feedingFertId === fert.id) {
      setFeedingFertId(null);
      return;
    }
    setFeedingFertId(fert.id);
    setFeedFormMode(fert.form);
    setFeedRatio(
      fert.dilutionRatio || (fert.form === "Diluted" ? "1:10 (100ml/L)" : "Straight drench"),
    );
    if (defaultPlantId && selectablePlants.some((p) => p.id === defaultPlantId)) {
      setFeedPlantIds([defaultPlantId]);
    } else if (selectablePlants.length > 0) {
      setFeedPlantIds([selectablePlants[0]!.id]);
    } else {
      setFeedPlantIds([]);
    }
  };

  const toggleFeedPlant = (id: string) => {
    setFeedPlantIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleConfirmFeed = async (fert: HomemadeFertilizer) => {
    if (!onLogFeedToPlants || feedPlantIds.length === 0) return;

    const cleanRatio =
      feedRatio.trim() || (feedFormMode === "Diluted" ? "Diluted mix" : "Raw / Undiluted");
    const nutrientDesc = `${fert.name} (${fert.fertilizerType}) — ${feedFormMode} [${cleanRatio}]`;
    const noteText =
      feedNote.trim() ||
      `Fed homemade ${fert.name} (${feedFormMode.toLowerCase()}: ${cleanRatio})${
        fert.ingredients ? ` · Ingredients: ${fert.ingredients}` : ""
      }`;

    await onLogFeedToPlants(feedPlantIds, {
      date: new Date().toISOString().slice(0, 10),
      type: "feed",
      amount: feedAmountL.trim() || undefined,
      ph: feedPh.trim() || undefined,
      ec: feedEc.trim() || undefined,
      nutrients: nutrientDesc,
      fertilizerForm: feedFormMode,
      dilutionRatio: cleanRatio,
      note: noteText,
    });

    setFeedSavedId(fert.id);
    setFeedingFertId(null);
    setFeedNote("");
    setTimeout(() => setFeedSavedId(null), 3000);
  };

  const handleAddStarterPresets = async () => {
    await onAddFertilizer({
      name: "Banana Peel Potassium Tea",
      fertilizerType: "Banana Peel / Fruit Potassium Tea",
      form: "Diluted",
      dilutionRatio: "1:10 (100ml/L)",
      targetStage: "Flowering",
      ingredients: "Steeped organic banana peels + 1 tbsp unsulfured molasses in rainwater",
      notes: "Natural potassium & phosphorus boost for flower density",
    });
    await onAddFertilizer({
      name: "Nettle & Comfrey Ferment",
      fertilizerType: "Nettle / Herbal Nitrogen Brew",
      form: "Diluted",
      dilutionRatio: "1:20 (50ml/L)",
      targetStage: "Vegetative",
      ingredients: "Fresh stinging nettle leaves fermented in water for 10 days",
      notes: "Rich in bioavailable nitrogen, iron, and trace minerals",
    });
    await onAddFertilizer({
      name: "Living Worm Casting Slurry",
      fertilizerType: "Compost / Worm Tea",
      form: "Raw",
      dilutionRatio: "Straight drench (undiluted)",
      targetStage: "All Stages",
      ingredients: "Aerated worm castings & kelp meal brewed 24h",
      notes: "Safe to apply raw as a root zone microbial drench",
    });
  };

  return (
    <div className="space-y-4">
      {/* Cloud Sync Status Header Bar (matches My Grows) */}
      {onOpenAccount && (
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs">
            <Cloud
              className={`h-4 w-4 ${currentUser ? "text-primary" : "text-muted-foreground"}`}
            />
            {currentUser ? (
              <span className="text-foreground">
                Cloud Sync:{" "}
                <strong className="text-primary font-medium">
                  {currentUser.displayName || currentUser.email}
                </strong>
              </span>
            ) : (
              <span className="text-muted-foreground">Local storage only (single device)</span>
            )}
          </div>
          <button
            type="button"
            onClick={onOpenAccount}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {currentUser ? "Manage" : "Sign In to Sync"}
          </button>
        </div>
      )}

      {/* Stats Summary (matches My Grows 3-column summary) */}
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Total", fertilizers.length],
          ["Raw", rawCount],
          ["Diluted", dilutedCount],
        ].map(([label, val]) => (
          <div key={label} className="rounded-2xl border bg-card p-3 text-center">
            <div className="font-display text-2xl">{val}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {/* Section Title & New Fertilizer Button (matches My Grows header) */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl">My fertilizers</h2>
          <p className="text-xs text-muted-foreground">
            Track your homemade raw concentrates and diluted water mixes
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(!adding)}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground cursor-pointer"
        >
          {adding ? "Cancel" : "+ New fertilizer"}
        </button>
      </div>

      {/* Filter Pills for All / Raw / Diluted */}
      {fertilizers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "All", label: `All (${fertilizers.length})` },
              { id: "Raw", label: `🧪 Raw (${rawCount})` },
              { id: "Diluted", label: `💧 Diluted (${dilutedCount})` },
            ] as const
          ).map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => setFilterForm(tabItem.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition cursor-pointer ${
                filterForm === tabItem.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
      )}

      {/* Add New Homemade Fertilizer Form */}
      {adding && (
        <form
          onSubmit={handleSaveNewFertilizer}
          className="rounded-2xl border bg-card p-4 space-y-3"
        >
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Beaker className="h-3.5 w-3.5" />
              <span>New Homemade Fertilizer Recipe</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Fertilizer Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setFormError(null);
                }}
                placeholder="e.g. Banana Peel Tea, Nettle Brew..."
                className="w-full rounded-xl border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Type of Fertilizer
              </label>
              <select
                value={fertilizerType}
                onChange={(e) => setFertilizerType(e.target.value)}
                className="w-full rounded-xl border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                {HOMEMADE_FERTILIZER_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-card text-foreground">
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {fertilizerType === "Custom Homemade Brew" && (
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Custom Fertilizer Type Label
              </label>
              <input
                type="text"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="e.g. Fermented Fruit Extract, Coffee Grounds Mix..."
                className="w-full rounded-xl border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {/* Raw vs Diluted Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground block">
              Concentration State (Raw vs. Diluted) *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSwitchForm("Raw")}
                className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 px-3 text-xs font-semibold transition cursor-pointer ${
                  form === "Raw"
                    ? "border-amber-500 bg-amber-500/15 text-amber-400"
                    : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <FlaskConical className="h-3.5 w-3.5" />
                <span>Raw (Undiluted / Straight)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchForm("Diluted")}
                className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 px-3 text-xs font-semibold transition cursor-pointer ${
                  form === "Diluted"
                    ? "border-info bg-info/15 text-info"
                    : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <Droplets className="h-3.5 w-3.5" />
                <span>Diluted (Mixed with Water)</span>
              </button>
            </div>
          </div>

          {/* Dilution Ratio or Raw Application Rate */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground block">
              {form === "Diluted"
                ? "Dilution Ratio / Mix Rate (with water)"
                : "Raw Application Rate / Dosage"}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(form === "Diluted" ? DILUTION_RATIO_PRESETS : RAW_DOSAGE_PRESETS).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDilutionRatio(preset)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition cursor-pointer ${
                    dilutionRatio === preset
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={dilutionRatio}
              onChange={(e) => setDilutionRatio(e.target.value)}
              placeholder={
                form === "Diluted"
                  ? "e.g. 1:10, 50ml per 1L water..."
                  : "e.g. Straight root drench, 2 tbsp top-dress..."
              }
              className="w-full rounded-xl border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Target Stage & Ingredients */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Best Growth Stage
              </label>
              <div className="flex flex-wrap gap-1">
                {TARGET_STAGES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setTargetStage(st)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition cursor-pointer ${
                      targetStage === st
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Ingredients / Recipe (Optional)
              </label>
              <input
                type="text"
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
                placeholder="e.g. Banana peels, molasses, rainwater..."
                className="w-full rounded-xl border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground">
              Preparation / Feeding Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Brewed 5 days; apply every 2nd watering..."
              className="w-full rounded-xl border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {formError && <p className="text-xs font-medium text-destructive">{formError}</p>}

          <button
            type="submit"
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition cursor-pointer"
          >
            Create fertilizer
          </button>
        </form>
      )}

      {/* Empty State */}
      {fertilizers.length === 0 && !adding && (
        <div className="rounded-2xl border border-dashed p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Start your homemade fertilizer shelf. Add your own raw or diluted organic recipes, or
            load starter brews.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Custom Fertilizer</span>
            </button>
            <button
              type="button"
              onClick={handleAddStarterPresets}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-secondary px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-secondary/80 transition cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>Load 3 Homemade Starter Recipes</span>
            </button>
          </div>
        </div>
      )}

      {/* Saved Homemade Fertilizers List */}
      {filteredFertilizers.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {filteredFertilizers.map((fert) => {
            const isFeedingThis = feedingFertId === fert.id;
            const isJustSaved = feedSavedId === fert.id;

            return (
              <div
                key={fert.id}
                className="rounded-2xl border border-border bg-card p-4 space-y-3 transition"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-lg text-foreground">{fert.name}</h3>
                      <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                        {fert.fertilizerType}
                      </span>
                      {fert.targetStage && (
                        <span className="text-xs text-muted-foreground">· {fert.targetStage}</span>
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 font-semibold ${
                          fert.form === "Raw"
                            ? "border-amber-500/40 bg-amber-500/15 text-amber-400"
                            : "border-info/40 bg-info/15 text-info"
                        }`}
                      >
                        {fert.form === "Raw" ? "🧪 Raw (Undiluted)" : "💧 Diluted"}
                      </span>
                      {fert.dilutionRatio && (
                        <span className="text-muted-foreground">
                          Ratio / Dose:{" "}
                          <strong className="text-foreground">{fert.dilutionRatio}</strong>
                        </span>
                      )}
                    </div>

                    {fert.ingredients && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">Ingredients:</span>{" "}
                        {fert.ingredients}
                      </p>
                    )}
                    {fert.notes && (
                      <p className="mt-0.5 text-xs text-muted-foreground italic">{fert.notes}</p>
                    )}
                  </div>

                  {/* Quick Actions: Toggle Raw/Diluted, Feed Plant, Delete */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateFertilizer(fert.id, (prev) => {
                          const nextForm: FertilizerForm = prev.form === "Raw" ? "Diluted" : "Raw";
                          const nextRatio =
                            nextForm === "Diluted" &&
                            (!prev.dilutionRatio ||
                              prev.dilutionRatio.toLowerCase().includes("straight") ||
                              prev.dilutionRatio.toLowerCase().includes("raw"))
                              ? "1:10 (100ml/L)"
                              : nextForm === "Raw" &&
                                  prev.dilutionRatio &&
                                  prev.dilutionRatio.includes(":")
                                ? "Straight drench (undiluted)"
                                : prev.dilutionRatio;
                          return {
                            ...prev,
                            form: nextForm,
                            dilutionRatio: nextRatio,
                          };
                        })
                      }
                      className="rounded-xl border border-border bg-secondary px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/80 transition cursor-pointer"
                      title="Switch between Raw and Diluted"
                    >
                      Switch to {fert.form === "Raw" ? "Diluted" : "Raw"}
                    </button>

                    {onLogFeedToPlants && selectablePlants.length > 0 && (
                      <button
                        type="button"
                        onClick={() => openFeedPanel(fert)}
                        className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                          isJustSaved
                            ? "bg-emerald-600 text-white"
                            : isFeedingThis
                              ? "bg-secondary text-foreground border border-border"
                              : "bg-primary text-primary-foreground hover:bg-primary/90"
                        }`}
                      >
                        {isJustSaved ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>Logged!</span>
                          </>
                        ) : (
                          <>
                            <Sprout className="h-3.5 w-3.5" />
                            <span>{isFeedingThis ? "Close" : "Feed Plant"}</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onDeleteFertilizer(fert.id)}
                      className="rounded-xl p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition cursor-pointer"
                      title="Delete homemade fertilizer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Inline Log Feed to Plant(s) Drawer */}
                {isFeedingThis && onLogFeedToPlants && (
                  <div className="mt-2 rounded-xl border border-primary/30 bg-secondary/30 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">
                        Log Feeding: {fert.name}
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setFeedFormMode("Raw");
                            if (feedRatio.includes(":")) setFeedRatio("Straight drench");
                          }}
                          className={`rounded-lg border px-2 py-0.5 text-[10px] font-semibold cursor-pointer ${
                            feedFormMode === "Raw"
                              ? "border-amber-500 bg-amber-500/20 text-amber-400"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          Raw
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFeedFormMode("Diluted");
                            if (
                              !feedRatio ||
                              feedRatio.toLowerCase().includes("straight") ||
                              feedRatio.toLowerCase().includes("raw")
                            ) {
                              setFeedRatio("1:10 (100ml/L)");
                            }
                          }}
                          className={`rounded-lg border px-2 py-0.5 text-[10px] font-semibold cursor-pointer ${
                            feedFormMode === "Diluted"
                              ? "border-info bg-info/20 text-info"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          Diluted
                        </button>
                      </div>
                    </div>

                    {/* Select Plants to Feed */}
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold block">
                        Select Plant(s)
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectablePlants.map((pl) => {
                          const selected = feedPlantIds.includes(pl.id);
                          return (
                            <button
                              key={pl.id}
                              type="button"
                              onClick={() => toggleFeedPlant(pl.id)}
                              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-card text-foreground"
                              }`}
                            >
                              {selected && <Check className="h-3 w-3" />}
                              <span>{pl.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Ratio, Litres, pH, EC */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">
                          {feedFormMode === "Diluted" ? "Dilution Ratio" : "Raw Dose"}
                        </label>
                        <input
                          type="text"
                          value={feedRatio}
                          onChange={(e) => setFeedRatio(e.target.value)}
                          placeholder={feedFormMode === "Diluted" ? "1:10" : "Straight"}
                          className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs text-foreground outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">
                          Total Volume (L)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={feedAmountL}
                          onChange={(e) => setFeedAmountL(e.target.value)}
                          placeholder="1.0"
                          className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs text-foreground outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">
                          pH (Optional)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={feedPh}
                          onChange={(e) => setFeedPh(e.target.value)}
                          placeholder="6.3"
                          className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs text-foreground outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">
                          EC (Optional)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={feedEc}
                          onChange={(e) => setFeedEc(e.target.value)}
                          placeholder="1.2"
                          className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs text-foreground outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={feedNote}
                        onChange={(e) => setFeedNote(e.target.value)}
                        placeholder="Optional feeding observation note..."
                        className="flex-1 rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs text-foreground outline-none"
                      />
                      <button
                        type="button"
                        disabled={feedPlantIds.length === 0}
                        onClick={() => handleConfirmFeed(fert)}
                        className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition cursor-pointer shrink-0"
                      >
                        Save Feed ({feedPlantIds.length})
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
