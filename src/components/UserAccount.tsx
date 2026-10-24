import { LogIn, LogOut, User as UserIcon } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/contexts/AuthContext";

export function UserAccountButton() {
  const { user, loading, signInWithGoogle, signOutUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) {
    return <div className="h-9 w-20 animate-pulse rounded-xl bg-card/60" />;
  }

  if (!user) {
    return (
      <button
        onClick={signInWithGoogle}
        className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
        title="Sign in to save and sync your plants across devices"
      >
        <LogIn className="h-3.5 w-3.5" />
        <span>Sign in</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 rounded-xl border bg-card px-2.5 py-1.5 text-xs font-medium transition hover:bg-card/80"
      >
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || "User"}
            className="h-5 w-5 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
            {user.displayName?.[0] || user.email?.[0] || "U"}
          </div>
        )}
        <span className="max-w-[100px] truncate text-foreground sm:max-w-[140px]">
          {user.displayName || user.email?.split("@")[0]}
        </span>
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 z-40 mt-1.5 w-56 rounded-2xl border bg-card p-3 shadow-xl backdrop-blur">
            <div className="mb-2 border-b pb-2">
              <p className="truncate text-xs font-semibold text-foreground">
                {user.displayName || "Grower"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span>Cloud Sync Active</span>
              </div>
            </div>
            <button
              onClick={async () => {
                setMenuOpen(false);
                await signOutUser();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
