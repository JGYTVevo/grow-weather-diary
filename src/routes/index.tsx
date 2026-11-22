import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PlantsPanel, type LogType } from "@/components/Plants";
import { FertilizerSection } from "@/components/FertilizerSection";
import { WeatherBlock } from "@/components/WeatherBlock";
import { AIDoctor } from "@/components/AIDoctor";
import { AIAdvice, type AdviceToolMode } from "@/components/AIAdvice";
import { GrowChatbot } from "@/components/GrowChatbot";
import { QuickLogModal } from "@/components/QuickLogModal";
import { AccountModal } from "@/components/AccountModal";
import { PWAInstallButton } from "@/components/PWAInstallButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { auth, onAuthStateChanged, type FirebaseUser } from "@/lib/firebase";
import { usePlants } from "@/hooks/use-plants";
import { useFertilizers } from "@/hooks/use-fertilizers";
import {
  Cloud,
  Stethoscope,
  Sprout,
  FlaskConical,
  CloudSun,
  Compass,
  Plus,
  Sun,
  MessageSquare,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Canopy — Grow Diary, Weather, AI Doctor, Trichome Harvest Scanner & LST",
      },
      {
        name: "description",
        content:
          "Track your plants, diagnose leaf issues, scan trichome ripeness & chop windows, compare before & after LST training, and analyze defoliation.",
      },
      {
        property: "og:title",
        content: "Canopy — Grow Diary, AI Doctor & Trichome Harvest Scanner",
      },
      {
        property: "og:description",
        content:
          "Grow diary with AI plant health doctor, macro trichome harvest ripeness scanner, defoliation analysis, and LST progression slider.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
  errorComponent: IndexRouteError,
});

function IndexRouteError({ error, reset }: { error: unknown; reset: () => void }) {
  const handleClearCache = () => {
    try {
      localStorage.removeItem("canopy-plants-v2");
    } catch {
      // ignore
    }
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-hero flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 text-center space-y-4 shadow-xl">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-left">
          <p className="text-sm font-semibold text-destructive">Diary View Notice</p>
          <p className="text-xs font-mono text-muted-foreground mt-1 break-words">
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          You can retry loading or reset the local journal cache if an entry was malformed.
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition"
          >
            Retry View
          </button>
          <button
            onClick={handleClearCache}
            className="rounded-xl border border-border bg-secondary px-4 py-2 text-xs font-semibold text-foreground hover:bg-secondary/80 transition"
          >
            Reset Local Cache
          </button>
        </div>
      </div>
    </div>
  );
}

function Index() {
  const [tab, setTab] = useState<
    "weather" | "plants" | "fertilizers" | "doctor" | "advice" | "chat"
  >("weather");
  const [adviceSubtool, setAdviceSubtool] = useState<AdviceToolMode>("advice");
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [targetPlantIdForDoctor, setTargetPlantIdForDoctor] = useState<string | null>(null);
  const [targetPlantIdForAdvice, setTargetPlantIdForAdvice] = useState<string | null>(null);
  const [openedPlantId, setOpenedPlantId] = useState<string | null>(null);
  const [showQuickLog, setShowQuickLog] = useState(false);

  const plantsState = usePlants(user);
  const { plants, addLogToPlants } = plantsState;
  const fertilizersState = useFertilizers(user);
  const { fertilizers, addFertilizer, updateFertilizer, deleteFertilizer } = fertilizersState;

  const [externalLog, setExternalLog] = useState<{
    type: LogType;
    note: string;
    photo?: string;
    temp?: string;
    humidity?: string;
  } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  const handleLogWeather = (temp: string, humidity: string, note: string) => {
    setExternalLog({
      type: "environment",
      temp,
      humidity,
      note,
    });
    setTab("plants");
  };

  const handleSaveDiagnosisToPlants = async (
    plantIds: string[],
    logData: { note: string; photo: string },
  ) => {
    try {
      await addLogToPlants(plantIds, {
        type: "photo",
        note: logData.note,
        photo: logData.photo,
        date: new Date().toISOString().slice(0, 10),
      });
    } catch (err) {
      console.error("Failed to save diagnosis to plants:", err);
    }
  };

  const handleLogAdviceToPlant = async (
    plantIds: string[],
    logData: {
      type: "training" | "water" | "feed" | "note" | "photo";
      note: string;
      photo?: string;
      amount?: string;
      ph?: string;
      ec?: string;
      technique?: string;
    },
  ) => {
    try {
      await addLogToPlants(plantIds, {
        ...logData,
        date: new Date().toISOString().slice(0, 10),
      });
    } catch (err) {
      console.error("Failed to log advice to plants:", err);
    }
  };

  return (
    <div className="min-h-screen bg-hero">
      <div className="mx-auto max-w-2xl px-4 pb-28 pt-6">
        {/* Main Header */}
        <header className="mb-4 flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Sun className="h-3.5 w-3.5 text-amber-500" />
              <span>Canopy · Aotearoa Summer</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold text-foreground">Grow diary</h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Dark / Light Theme Toggle */}
            <ThemeToggle />

            {/* Account / Cloud Sync Button */}
            <button
              onClick={() => setShowAccount(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition active:scale-95 shadow-xs"
              title={user ? `Signed in as ${user.email}` : "Sign in to sync between devices"}
            >
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt=""
                  className="h-5 w-5 rounded-full object-cover border border-primary"
                />
              ) : (
                <Cloud
                  className={`h-3.5 w-3.5 ${user ? "text-primary" : "text-muted-foreground"}`}
                />
              )}
              <span className="hidden sm:inline">
                {user ? user.displayName?.split(" ")[0] || "Account" : "Sync"}
              </span>
            </button>

            {/* PWA Install Button */}
            <PWAInstallButton />
          </div>
        </header>

        {/* Aotearoa New Zealand Summer Season Banner */}
        <section className="mb-5 relative overflow-hidden rounded-2xl border border-primary/30 bg-card nz-summer-banner p-4 shadow-sm">
          {/* Decorative SVG Pohutukawa, Kowhai Sun & Coastal Fern Illustration */}
          <svg
            aria-hidden="true"
            viewBox="0 0 240 120"
            className="pointer-events-none absolute -right-4 -top-2 h-32 w-56 opacity-85"
            fill="none"
          >
            {/* Golden Kowhai Summer Sun */}
            <circle cx="192" cy="36" r="26" fill="oklch(0.84 0.17 84 / 0.35)" />
            <circle cx="192" cy="36" r="16" fill="oklch(0.86 0.18 84 / 0.65)" />
            {/* Tasman Coastal Wave Line */}
            <path
              d="M90 104 C125 92, 155 112, 190 98 C210 90, 228 96, 240 92"
              stroke="oklch(0.68 0.15 205 / 0.55)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            {/* Pohutukawa Crimson Blossom Stamens */}
            <g stroke="oklch(0.63 0.23 25 / 0.75)" strokeWidth="2" strokeLinecap="round">
              <line x1="145" y1="48" x2="132" y2="30" />
              <line x1="145" y1="48" x2="140" y2="25" />
              <line x1="145" y1="48" x2="150" y2="26" />
              <line x1="145" y1="48" x2="158" y2="32" />
              <line x1="145" y1="48" x2="162" y2="42" />
            </g>
            <circle cx="132" cy="30" r="2.2" fill="oklch(0.85 0.17 84)" />
            <circle cx="140" cy="25" r="2.2" fill="oklch(0.85 0.17 84)" />
            <circle cx="150" cy="26" r="2.2" fill="oklch(0.85 0.17 84)" />
            <circle cx="158" cy="32" r="2.2" fill="oklch(0.85 0.17 84)" />
            <circle cx="162" cy="42" r="2.2" fill="oklch(0.85 0.17 84)" />
            {/* Lush Nikau / Silver Fern Frond */}
            <path
              d="M115 95 Q145 65 182 56"
              stroke="oklch(0.62 0.19 152 / 0.75)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M128 83 L122 72 M138 76 L133 65 M149 70 L145 59 M160 65 L157 55 M171 60 L169 51"
              stroke="oklch(0.62 0.19 152 / 0.7)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 max-w-md">
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-foreground">
                <span>🌺 Pōhutukawa & Kōwhai Season</span>
                <span aria-hidden="true" className="text-muted-foreground">
                  ·
                </span>
                <span className="text-primary">14.5h+ Peak Daylight</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Prime Southern Hemisphere summer sun, warm Tasman sea breezes, and fast drybacks.
                Keep root zones cool and potassium brews ready for vigorous canopy stretch.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setTab("plants")}
                className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition cursor-pointer shadow-xs"
              >
                My Grows ({plants.filter((p) => p.stage !== "Harvested").length})
              </button>
              <button
                type="button"
                onClick={() => setTab("fertilizers")}
                className="rounded-xl border border-border bg-card/90 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary transition cursor-pointer"
              >
                Summer Brews ({fertilizers.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdviceSubtool("visualizer");
                  setTab("advice");
                }}
                className="rounded-xl border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/25 transition cursor-pointer"
              >
                Growth Visualizer
              </button>
              <button
                type="button"
                onClick={() => setTab("chat")}
                className="rounded-xl border border-border bg-card/90 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary transition cursor-pointer"
              >
                AI Assistant
              </button>
            </div>
          </div>
        </section>

        {/* Tab View with smooth transition */}
        <div key={tab} className="tab-content-enter">
          {tab === "weather" && (
            <WeatherBlock onLogWeatherToDiary={handleLogWeather} plants={plants} />
          )}
          {tab === "plants" && (
            <PlantsPanel
              currentUser={user}
              onOpenAccount={() => setShowAccount(true)}
              externalLog={externalLog}
              onClearExternalLog={() => setExternalLog(null)}
              plantsState={plantsState}
              fertilizersState={fertilizersState}
              openedPlantId={openedPlantId}
              onClosePlant={() => setOpenedPlantId(null)}
              onOpenDoctorForPlant={(plantId) => {
                setTargetPlantIdForDoctor(plantId);
                setTab("doctor");
              }}
              onOpenAdviceForPlant={(plantId, tool) => {
                setTargetPlantIdForAdvice(plantId);
                if (tool) setAdviceSubtool(tool);
                setTab("advice");
              }}
            />
          )}
          {tab === "fertilizers" && (
            <FertilizerSection
              fertilizers={fertilizers}
              onAddFertilizer={addFertilizer}
              onUpdateFertilizer={updateFertilizer}
              onDeleteFertilizer={deleteFertilizer}
              plants={plants}
              onLogFeedToPlants={addLogToPlants}
              currentUser={user}
              onOpenAccount={() => setShowAccount(true)}
            />
          )}
          {tab === "doctor" && (
            <AIDoctor
              plants={plants}
              fertilizers={fertilizers}
              initialSelectedPlantId={targetPlantIdForDoctor}
              onSaveDiagnosisToPlants={handleSaveDiagnosisToPlants}
              onNavigateToPlant={(plantId) => {
                setOpenedPlantId(plantId);
                setTab("plants");
              }}
              onNavigateToPlantsList={() => {
                setOpenedPlantId(null);
                setTab("plants");
              }}
            />
          )}
          {tab === "advice" && (
            <AIAdvice
              plants={plants}
              fertilizers={fertilizers}
              initialSelectedPlantId={targetPlantIdForAdvice}
              initialTool={adviceSubtool}
              onToolChange={setAdviceSubtool}
              onLogToPlant={handleLogAdviceToPlant}
              onNavigateToPlant={(plantId) => {
                setOpenedPlantId(plantId);
                setTab("plants");
              }}
            />
          )}
          {tab === "chat" && <GrowChatbot plants={plants} fertilizers={fertilizers} />}
        </div>
      </div>

      {/* Floating Action Button for Quick Daily Logging (hidden on AI Assistant tab to avoid overlapping chat/calculator) */}
      {tab !== "chat" && (
        <div className="fixed bottom-20 left-4 sm:left-6 z-30">
          <button
            type="button"
            onClick={() => setShowQuickLog(true)}
            className="group inline-flex items-center gap-2 rounded-full bg-card px-4 py-3 text-xs font-bold text-foreground shadow-lg hover:bg-secondary hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer border border-border"
            title="Quick log today's plant status"
            aria-label="Quick log plant status"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Plus className="h-3.5 w-3.5 stroke-[3]" />
            </div>
            <span className="tracking-wide">Quick Log</span>
          </button>
        </div>
      )}

      {/* Quick Daily Plant Status Modal */}
      <QuickLogModal
        isOpen={showQuickLog}
        onClose={() => setShowQuickLog(false)}
        plants={plants}
        fertilizers={fertilizers}
        defaultPlantId={openedPlantId || targetPlantIdForAdvice || targetPlantIdForDoctor}
        onSaveLog={addLogToPlants}
      />

      {/* Persistent Bottom Navigation */}
      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 backdrop-blur z-40">
        <div className="mx-auto flex max-w-2xl">
          <button
            onClick={() => setTab("weather")}
            className={`flex-1 py-3.5 flex flex-col items-center gap-1 text-[11px] sm:text-xs font-semibold transition ${
              tab === "weather" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CloudSun className="h-4 w-4" />
            <span>Weather</span>
          </button>
          <button
            onClick={() => setTab("plants")}
            className={`flex-1 py-3.5 flex flex-col items-center gap-1 text-[11px] sm:text-xs font-semibold transition ${
              tab === "plants" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sprout className="h-4 w-4" />
            <span>My Grows</span>
          </button>
          <button
            onClick={() => setTab("fertilizers")}
            className={`flex-1 py-3.5 flex flex-col items-center gap-1 text-[11px] sm:text-xs font-semibold transition ${
              tab === "fertilizers" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FlaskConical className="h-4 w-4" />
            <span>Fertilizers</span>
          </button>
          <button
            onClick={() => setTab("chat")}
            className={`flex-1 py-3.5 flex flex-col items-center gap-1 text-[11px] sm:text-xs font-semibold transition ${
              tab === "chat" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>AI Assistant</span>
          </button>
          <button
            onClick={() => setTab("doctor")}
            className={`flex-1 py-3.5 flex flex-col items-center gap-1 text-[11px] sm:text-xs font-semibold transition ${
              tab === "doctor" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Stethoscope className="h-4 w-4" />
            <span>AI Doctor</span>
          </button>
          <button
            onClick={() => setTab("advice")}
            className={`flex-1 py-3.5 flex flex-col items-center gap-1 text-[11px] sm:text-xs font-semibold transition ${
              tab === "advice" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Compass className="h-4 w-4" />
            <span>AI Advice</span>
          </button>
        </div>
      </nav>

      {/* Account Modal for Google Sign-In & Multi-Device Sync */}
      <AccountModal
        user={user}
        isOpen={showAccount}
        onClose={() => setShowAccount(false)}
        plantCount={plants.length}
      />
    </div>
  );
}
