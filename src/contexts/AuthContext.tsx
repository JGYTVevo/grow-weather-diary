import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { auth, db, googleProvider, handleFirestoreError, OperationType } from "@/lib/firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
        // Sync user profile to Firestore
        const userPath = `users/${currentUser.uid}`;
        try {
          const userRef = doc(db, "users", currentUser.uid);
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            await setDoc(userRef, {
              id: currentUser.uid,
              email: currentUser.email || "",
              displayName: currentUser.displayName || "",
              photoURL: currentUser.photoURL || "",
              createdAt: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.warn("Could not sync profile to Firestore", err);
          // Do not throw fatal error on profile fetch to avoid locking user out
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      toast.success(`Welcome, ${result.user.displayName || "grower"}!`);
    } catch (err) {
      console.error("Sign-in failed", err);
      toast.error("Could not sign in with Google. Please try again.");
    }
  };

  const signOutUser = async () => {
    try {
      await firebaseSignOut(auth);
      toast.info("Signed out. Plants are currently stored locally.");
    } catch (err) {
      console.error("Sign-out failed", err);
      toast.error("Failed to sign out.");
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
