import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PlantsPanel, type LogType } from "@/components/Plants";
import { WeatherBlock } from "@/components/WeatherBlock";
import { AIDoctor } from "@/components/AIDoctor";
import { AIAdvice, type AdviceToolMode } from "@/components/AIAdvice";
import { QuickLogModal } from "@/components/QuickLogModal";
import { AccountModal } from "@/components/AccountModal";
import { PWAInstallButton } from "@/components/PWAInstallButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { auth, onAuthStateChanged, type FirebaseUser } from "@/lib/firebase";
import { usePlants } from "@/hooks/use-plants";
import { User, Cloud, Stethoscope, Sprout, CloudSun, Compass, Plus } from "lucide-react";

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
});

function Index() {
  const [tab, setTab] = useState<"weather" | "plants" | "doctor" | "advice">("weather");
  const [adviceSubtool, setAdviceSubtool] = useState<AdviceToolMode>("advice");
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [targetPlantIdForDoctor, setTargetPlantIdForDoctor] = useState<string | null>(null);
  const [targetPlantIdForAdvice, setTargetPlantIdForAdvice] = useState<string | null>(null);
  const [openedPlantId, setOpenedPlantId] = useState<string | null>(null);
  const [showQuickLog, setShowQuickLog] = useState(false);

  const plantsState = usePlants(user);
  const { plants, addLogToPlants } = plantsState;

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
      type: "training" | "water" | "feed" | "note";
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
        <header className="mb-6 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-primary font-semibold">Canopy</p>
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
          {tab === "doctor" && (
            <AIDoctor
              plants={plants}
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
        </div>
      </div>

      {/* Floating Action Button for Quick Daily Logging */}
      <div className="fixed bottom-20 right-4 sm:right-6 z-30">
        <button
          type="button"
          onClick={() => setShowQuickLog(true)}
          className="group inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-150 cursor-pointer border border-primary-foreground/15"
          title="Quick log today's plant status"
          aria-label="Quick log plant status"
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-primary-foreground">
            <Plus className="h-3.5 w-3.5 stroke-[3]" />
          </div>
          <span className="tracking-wide">Quick Log</span>
        </button>
      </div>

      {/* Quick Daily Plant Status Modal */}
      <QuickLogModal
        isOpen={showQuickLog}
        onClose={() => setShowQuickLog(false)}
        plants={plants}
        defaultPlantId={openedPlantId || targetPlantIdForAdvice || targetPlantIdForDoctor}
        onSaveLog={addLogToPlants}
      />

      {/* Persistent Bottom Navigation */}
      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 backdrop-blur z-40">
        <div className="mx-auto flex max-w-2xl">
          <button
            onClick={() => setTab("weather")}
            className={`flex-1 py-3.5 flex flex-col items-center gap-1 text-xs font-semibold transition ${
              tab === "weather" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CloudSun className="h-4 w-4" />
            <span>Weather</span>
          </button>
          <button
            onClick={() => setTab("plants")}
            className={`flex-1 py-3.5 flex flex-col items-center gap-1 text-xs font-semibold transition ${
              tab === "plants" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sprout className="h-4 w-4" />
            <span>My Grows</span>
          </button>
          <button
            onClick={() => setTab("doctor")}
            className={`flex-1 py-3.5 flex flex-col items-center gap-1 text-xs font-semibold transition ${
              tab === "doctor" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Stethoscope className="h-4 w-4" />
            <span>AI Doctor</span>
          </button>
          <button
            onClick={() => setTab("advice")}
            className={`flex-1 py-3.5 flex flex-col items-center gap-1 text-xs font-semibold transition ${
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
