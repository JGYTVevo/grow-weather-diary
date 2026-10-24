import React, { useState } from "react";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { Download, Smartphone, X, Check } from "lucide-react";

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // If already running inside an installed PWA / standalone container, hide
  if (isInstalled) {
    return null;
  }

  // Chromium / Android native prompt flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/30 active:scale-95 border border-primary/30"
        title="Install Canopy app on your phone"
      >
        <Download className="h-3.5 w-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  // Fallback for iOS Safari or browsers where prompt event hasn't fired yet
  return (
    <>
      <button
        onClick={() => setShowGuide(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-secondary/80 px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-secondary active:scale-95 border border-border"
        title="Install on Phone (PWA / APK)"
      >
        <Smartphone className="h-3.5 w-3.5 text-primary" />
        <span>Install App</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/20 text-primary">
                  <Smartphone className="h-4 w-4" />
                </span>
                <h3 className="font-semibold text-base text-foreground">Install Canopy</h3>
              </div>
              <button
                onClick={() => setShowGuide(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-xs text-muted-foreground space-y-3">
              <p>
                Canopy is an installable <strong>Progressive Web App</strong>. It installs directly
                to your home screen with offline caching, full-screen view, and notifications
                without needing an app store.
              </p>

              {isIOS ? (
                <div className="rounded-xl border border-border bg-secondary/50 p-3 space-y-2 text-foreground">
                  <p className="font-semibold text-primary">On iPhone / iPad (Safari):</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>
                      Tap the <strong className="text-foreground">Share</strong> icon (square with
                      arrow) at the bottom.
                    </li>
                    <li>
                      Scroll down and tap{" "}
                      <strong className="text-foreground">Add to Home Screen</strong>.
                    </li>
                    <li>
                      Tap <strong className="text-foreground">Add</strong> in the top-right corner.
                    </li>
                  </ol>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-secondary/50 p-3 space-y-2 text-foreground">
                  <p className="font-semibold text-primary">On Android (Chrome / Edge):</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>
                      Tap the <strong className="text-foreground">⋮ (Menu)</strong> icon in the top
                      right.
                    </li>
                    <li>
                      Select <strong className="text-foreground">Install app</strong> or{" "}
                      <strong className="text-foreground">Add to Home screen</strong>.
                    </li>
                    <li>
                      Confirm by tapping <strong className="text-foreground">Install</strong>.
                    </li>
                  </ol>
                </div>
              )}

              <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Want a standalone .APK file?</p>
                You can convert this live PWA into a signed Android APK package using free web tools
                like <strong>PWABuilder.com</strong> with this app's URL.
              </div>
            </div>

            <button
              onClick={() => setShowGuide(false)}
              className="w-full rounded-xl bg-primary py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
