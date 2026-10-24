import React, { useState } from "react";
import { loginWithGoogle, logoutUser, type FirebaseUser } from "@/lib/firebase";
import {
  User as UserIcon,
  Cloud,
  CloudCheck,
  LogOut,
  X,
  Smartphone,
  Laptop,
  Check,
  AlertCircle,
} from "lucide-react";
import { ThemeSelector } from "@/components/ThemeToggle";

interface AccountModalProps {
  user: FirebaseUser | null;
  isOpen: boolean;
  onClose: () => void;
  plantCount: number;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  user,
  isOpen,
  onClose,
  plantCount,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      await loginWithGoogle();
      onClose();
    } catch (err: unknown) {
      console.error(err);
      setError("Sign-in was cancelled or failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    setError("");
    try {
      await logoutUser();
      onClose();
    } catch (err: unknown) {
      console.error(err);
      setError("Sign out failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <Cloud className="h-4 w-4" />
            </span>
            <h3 className="font-semibold text-base text-foreground">
              {user ? "Cloud Account" : "Multi-Device Sync"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        {user ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3.5">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || "User"}
                  className="h-11 w-11 rounded-full border border-primary/40 object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-base">
                  {user.displayName ? user.displayName[0] : "U"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-foreground truncate">
                  {user.displayName || "Gardener"}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-primary font-medium">
                  <Cloud className="h-3 w-3" />
                  <span>Cloud sync active</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-secondary/40 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Synced plants in cloud</span>
                <strong className="text-foreground">{plantCount} plants</strong>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Cross-device updates</span>
                <strong className="text-primary flex items-center gap-1">
                  <Check className="h-3 w-3" /> Real-time
                </strong>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Your journals, logs, and plant photos are safely backed up to Firebase Firestore and
              sync automatically between your phone, tablet, and computer.
            </p>

            <div className="space-y-1.5 pt-1 border-t border-border">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Display Theme
              </label>
              <ThemeSelector />
            </div>

            <button
              onClick={handleLogout}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 py-2.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{loading ? "Signing out…" : "Sign Out"}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-3">
              <div className="flex items-center justify-center gap-4 text-muted-foreground py-2">
                <div className="flex flex-col items-center gap-1">
                  <Smartphone className="h-6 w-6 text-primary" />
                  <span className="text-[10px]">Phone</span>
                </div>
                <span className="text-primary font-bold">⇄</span>
                <div className="flex flex-col items-center gap-1">
                  <Cloud className="h-7 w-7 text-primary animate-pulse" />
                  <span className="text-[10px]">Cloud Sync</span>
                </div>
                <span className="text-primary font-bold">⇄</span>
                <div className="flex flex-col items-center gap-1">
                  <Laptop className="h-6 w-6 text-primary" />
                  <span className="text-[10px]">Desktop</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Sign in to save your grow diary to your account so you can view, update, and manage
                your plants on any device.
              </p>
            </div>

            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="text-primary font-bold">✓</span>
                <span>Automatic sync across all your phones & computers</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary font-bold">✓</span>
                <span>Keep your existing local plants without losing data</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-primary font-bold">✓</span>
                <span>Secure cloud backup for your photos and logs</span>
              </li>
            </ul>

            <div className="space-y-1.5 pt-2 border-t border-border">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Display Theme
              </label>
              <ThemeSelector />
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
            >
              <UserIcon className="h-4 w-4" />
              <span>{loading ? "Connecting to Google…" : "Sign In with Google"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
