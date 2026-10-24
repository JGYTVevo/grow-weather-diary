import { Download, Smartphone, X } from "lucide-react";
import React, { useState } from "react";

import { usePWAInstall } from "@/hooks/usePWAInstall";

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // If already running as an installed standalone app, hide button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
        title="Install Canopy directly onto your phone"
      >
        <Smartphone className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Install App</span>
        <span className="sm:hidden">Install</span>
      </button>
    );
  }

  // General or iOS button with instructions
  return (
    <>
      <button
        onClick={() => setShowGuide(true)}
        className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        title="How to install on your phone"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Install on Phone</span>
        <span className="sm:hidden">App</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-sm rounded-2xl border bg-card p-6 shadow-2xl">
            <button
              onClick={() => setShowGuide(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-xl">
                🌱
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Install Canopy App</h3>
                <p className="text-xs text-muted-foreground">Add to your phone home screen</p>
              </div>
            </div>

            {isIOS ? (
              <div className="space-y-3 rounded-xl bg-secondary/50 p-3.5 text-xs text-foreground">
                <p className="font-medium text-primary">On iPhone / iPad (Safari):</p>
                <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
                  <li>
                    Tap the <strong className="text-foreground">Share</strong> icon at the bottom of
                    Safari.
                  </li>
                  <li>
                    Scroll down and tap{" "}
                    <strong className="text-foreground">Add to Home Screen</strong>.
                  </li>
                  <li>Tap Add in the top-right corner.</li>
                </ol>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl bg-secondary/50 p-3.5 text-xs text-foreground">
                <p className="font-medium text-primary">On Android (Chrome / Edge / Firefox):</p>
                <ol className="list-decimal space-y-1.5 pl-4 text-muted-foreground">
                  <li>
                    Tap the <strong className="text-foreground">⋮ menu</strong> in the top right of
                    your browser.
                  </li>
                  <li>
                    Select <strong className="text-foreground">Install app</strong> or{" "}
                    <strong className="text-foreground">Add to Home screen</strong>.
                  </li>
                  <li>The app will install as a native icon with offline support!</li>
                </ol>
              </div>
            )}

            <div className="mt-4 border-t pt-3">
              <p className="text-[11px] text-muted-foreground">
                Once added, it runs in fullscreen standalone mode without browser bars, just like a
                native APK.
              </p>
            </div>

            <button
              onClick={() => setShowGuide(false)}
              className="mt-4 w-full rounded-xl bg-primary py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
