import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  Flame,
  HelpCircle,
  Lightbulb,
  PlusCircle,
  RefreshCw,
  Sparkles,
  Stethoscope,
  Upload,
} from "lucide-react";
import React, { useRef, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import {
  LOCAL_STORAGE_KEY,
  savePlantLogToFirestore,
  type Log,
  type Plant,
} from "@/lib/grows-service";
import { diagnosePlantPhoto, type PlantDiagnosisResult } from "@/lib/diagnose";

export function AIDoctor({ plants = [] }: { plants?: Plant[] }) {
  const { user } = useAuth();
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedPlantId, setSelectedPlantId] = useState<string>("");
  const [growerNotes, setGrowerNotes] = useState<string>("");
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [diagnosis, setDiagnosis] = useState<PlantDiagnosisResult | null>(null);
  const [savedToPlant, setSavedToPlant] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Compress image to ensure fast transfer while preserving botanical clarity
  const processImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1024;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          setImagePreview(dataUrl);
          setDiagnosis(null);
          setSavedToPlant(false);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleStartAnalysis = async () => {
    if (!imagePreview) {
      toast.error("Please take or upload a plant photo first.");
      return;
    }

    setAnalyzing(true);
    try {
      const selectedPlant = plants.find((p) => p.id === selectedPlantId);
      const plantContext = selectedPlant
        ? `Name: ${selectedPlant.name}, Strain: ${selectedPlant.strain}, Stage: ${selectedPlant.stage}, Medium: ${selectedPlant.medium}, Environment: ${selectedPlant.setting}`
        : "";

      const result = await diagnosePlantPhoto({
        data: {
          imageBase64: imagePreview,
          notes: growerNotes,
          plantContext,
        },
      });

      setDiagnosis(result);
      toast.success("Analysis complete!");
    } catch (err: unknown) {
      console.error("Diagnosis error:", err);
      const msg = err instanceof Error ? err.message : "Plant diagnosis failed";
      toast.error(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveToDiary = async () => {
    if (!diagnosis || !imagePreview) return;

    const targetPlantId = selectedPlantId || plants[0]?.id;
    if (!targetPlantId) {
      toast.error("No plant selected to attach diagnosis to.");
      return;
    }

    const plant = plants.find((p) => p.id === targetPlantId);
    const plantName = plant ? plant.name : "Plant";

    const issueText = diagnosis.detectedIssues.length
      ? diagnosis.detectedIssues
          .map((i) => `• ${i.issue} (${i.severity} severity): ${i.symptoms}`)
          .join("\n")
      : "✓ No serious issues detected.";

    const logNote = `GrowBuddy AI Scan: ${diagnosis.healthAssessment.healthScore}/100 (${diagnosis.healthAssessment.status})\n${diagnosis.healthAssessment.summary}\n\nIssues:\n${issueText}`;

    const newLog: Log = {
      id: Math.random().toString(36).slice(2, 10),
      date: new Date().toISOString().slice(0, 10),
      type: "photo",
      photo: imagePreview,
      note: logNote,
      createdAt: new Date().toISOString(),
    };

    try {
      if (user) {
        await savePlantLogToFirestore(user.uid, targetPlantId, newLog);
      } else {
        // Save in localStorage for guest
        const local = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]") as Plant[];
        const updated = local.map((p) =>
          p.id === targetPlantId ? { ...p, logs: [newLog, ...(p.logs || [])] } : p,
        );
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      }

      setSavedToPlant(true);
      toast.success(`Diagnosis saved to ${plantName}'s grow journal!`);
    } catch (err) {
      console.error("Failed to save diagnosis log:", err);
      toast.error("Could not save to plant journal.");
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header Banner */}
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">GrowBuddy AI Plant Doctor</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Take a close-up photo of your plant, leaves, or buds to diagnose deficiencies, pests,
              and health status with an instant treatment plan.
            </p>
          </div>
        </div>
      </section>

      {/* Camera / Upload Section */}
      <section className="rounded-2xl border bg-card p-5">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) processImageFile(file);
          }}
        />
        <input
          type="file"
          ref={cameraInputRef}
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) processImageFile(file);
          }}
        />

        {imagePreview ? (
          <div className="space-y-4">
            <div className="relative mx-auto aspect-4/3 max-h-80 w-full overflow-hidden rounded-xl border bg-secondary">
              <img
                src={imagePreview}
                alt="Plant preview"
                className="h-full w-full object-contain"
              />
              <button
                onClick={() => {
                  setImagePreview(null);
                  setDiagnosis(null);
                }}
                className="absolute right-2 top-2 rounded-lg bg-black/70 px-2.5 py-1 text-xs text-white backdrop-blur transition hover:bg-black/90"
              >
                Change photo
              </button>
            </div>

            {/* Optional Context Inputs */}
            <div className="space-y-3">
              {plants.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground">
                    Link to one of your plants (optional):
                  </label>
                  <select
                    value={selectedPlantId}
                    onChange={(e) => setSelectedPlantId(e.target.value)}
                    className="mt-1 w-full rounded-xl border bg-secondary px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">-- General plant scan --</option>
                    {plants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.strain || p.type} · {p.stage})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-muted-foreground">
                  Specific symptoms or grower notes (optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Yellow tips on lower leaves, curled margins, 3rd week of flower"
                  value={growerNotes}
                  onChange={(e) => setGrowerNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border bg-secondary px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <button
                onClick={handleStartAnalysis}
                disabled={analyzing}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-95 disabled:opacity-50"
              >
                {analyzing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Analyzing plant with GrowBuddy AI…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Diagnose Plant Photo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/80 p-8 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
              <Camera className="h-7 w-7" />
            </div>
            <h3 className="font-semibold text-foreground">Add Plant Photo</h3>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              For best accuracy, take a clear photo of affected leaves, leaf undersides, or buds in
              good lighting.
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
              >
                <Camera className="h-4 w-4" />
                <span>Take Photo</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-xl border border-input bg-card px-4 py-2.5 text-xs font-medium text-foreground transition hover:bg-secondary"
              >
                <Upload className="h-4 w-4" />
                <span>Upload Image</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Analysis Results Display */}
      {diagnosis && (
        <section className="space-y-4 animate-in fade-in duration-300">
          {/* Health Score & Identification */}
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Detected Plant
                </p>
                <h3 className="text-xl font-bold text-foreground">
                  {diagnosis.plantIdentification.commonName}
                </h3>
                <p className="text-xs text-primary font-medium">
                  {diagnosis.plantIdentification.stage} · {diagnosis.plantIdentification.confidence}{" "}
                  confidence
                </p>
              </div>

              <div className="flex flex-col items-center justify-center rounded-2xl bg-secondary/80 px-4 py-3">
                <span className="font-display text-3xl font-bold">
                  {diagnosis.healthAssessment.healthScore}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  / 100 Health
                </span>
              </div>
            </div>

            <div className="p-4">
              <div
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  diagnosis.healthAssessment.status === "Healthy"
                    ? "bg-primary/20 text-primary"
                    : diagnosis.healthAssessment.status === "Minor Issues"
                      ? "bg-warning/20 text-warning"
                      : "bg-destructive/20 text-destructive"
                }`}
              >
                {diagnosis.healthAssessment.status === "Healthy" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
                <span>{diagnosis.healthAssessment.status}</span>
              </div>
              <p className="mt-2 text-sm text-foreground/90">
                {diagnosis.healthAssessment.summary}
              </p>
            </div>
          </div>

          {/* Detected Issues */}
          {diagnosis.detectedIssues.length > 0 && (
            <div className="rounded-2xl border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Flame className="h-4 w-4 text-warning" />
                <h4 className="font-semibold text-foreground">Detected Issues & Deficiencies</h4>
              </div>
              <div className="space-y-2.5">
                {diagnosis.detectedIssues.map((issue, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-border/80 bg-secondary/50 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{issue.issue}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          issue.severity === "High"
                            ? "bg-destructive/20 text-destructive"
                            : issue.severity === "Medium"
                              ? "bg-warning/20 text-warning"
                              : "bg-info/20 text-info"
                        }`}
                      >
                        {issue.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{issue.symptoms}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Treatment Plan */}
          {diagnosis.treatmentPlan.length > 0 && (
            <div className="rounded-2xl border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-foreground">Actionable Treatment Plan</h4>
              </div>
              <ol className="space-y-2.5">
                {diagnosis.treatmentPlan.map((plan, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 rounded-xl border border-border/80 bg-secondary/30 p-3 text-xs"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-foreground">{plan.step}</p>
                      <p className="mt-0.5 text-muted-foreground">{plan.action}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* GrowBuddy Pro Tips */}
          {diagnosis.growBuddyTips.length > 0 && (
            <div className="rounded-2xl border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-accent" />
                <h4 className="font-semibold text-foreground">GrowBuddy Pro Tips</h4>
              </div>
              <ul className="space-y-2 text-xs text-muted-foreground">
                {diagnosis.growBuddyTips.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Save to Grow Diary Action */}
          <div className="flex flex-col gap-2 rounded-2xl border border-primary/40 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-primary">
                Keep this diagnosis in your journal
              </p>
              <p className="text-[11px] text-muted-foreground">
                Attach this photo and treatment report as a journal entry to track recovery.
              </p>
            </div>
            <button
              onClick={handleSaveToDiary}
              disabled={savedToPlant || plants.length === 0}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow transition hover:opacity-95 disabled:opacity-50"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>{savedToPlant ? "Saved to Diary ✓" : "Save to Plant Journal"}</span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
