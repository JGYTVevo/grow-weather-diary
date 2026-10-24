import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AIDoctor } from "@/components/AIDoctor";
import { PlantsPanel } from "@/components/Plants";
import { PWAInstallButton } from "@/components/PWAInstallButton";
import { UserAccountButton } from "@/components/UserAccount";
import { WeatherDashboard } from "@/components/WeatherDashboard";
import { useAuth } from "@/contexts/AuthContext";
import { LOCAL_STORAGE_KEY, subscribeUserPlants, type Plant } from "@/lib/grows-service";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Canopy — Grow Diary & Weather Alerts" },
      {
        name: "description",
        content:
          "Track your plants and get local weather warnings for frost, heat, wind and mould risk.",
      },
      { property: "og:title", content: "Canopy — Grow Diary & Weather Alerts" },
      {
        property: "og:description",
        content: "Grow diary with local weather alerts for your plants.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const [tab, setTab] = useState<"weather" | "plants" | "doctor">("weather");
  const { user } = useAuth();
  const [plants, setPlants] = useState<Plant[]>([]);

  useEffect(() => {
    if (user) {
      const unsub = subscribeUserPlants(user.uid, (p) => setPlants(p));
      return () => unsub();
    } else {
      try {
        const local = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]") as Plant[];
        setPlants(local);
      } catch {
        /* ignore */
      }
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-hero">
      <div className="mx-auto max-w-2xl px-4 pb-28 pt-8">
        <header className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-primary">Canopy</p>
            <h1 className="text-4xl font-semibold">Grow diary</h1>
          </div>
          <div className="flex items-center gap-2">
            <PWAInstallButton />
            <UserAccountButton />
          </div>
        </header>

        {tab === "weather" && <WeatherDashboard />}
        {tab === "plants" && <PlantsPanel />}
        {tab === "doctor" && <AIDoctor plants={plants} />}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl">
          {[
            { id: "weather", label: "☁ Weather" },
            { id: "plants", label: "🌱 Plants" },
            { id: "doctor", label: "🔬 AI Doctor" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as "weather" | "plants" | "doctor")}
              className={`flex-1 py-4 text-xs sm:text-sm font-semibold capitalize transition ${
                tab === t.id ? "text-primary border-t-2 border-primary" : "text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
