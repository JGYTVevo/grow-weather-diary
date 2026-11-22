import { useState, useEffect, useCallback, useRef } from "react";
import { db, handleFirestoreError, OperationType, type FirebaseUser } from "@/lib/firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { uid, today } from "@/hooks/use-plants";

export type FertilizerForm = "Raw" | "Diluted";

export interface HomemadeFertilizer {
  id: string;
  userId?: string | undefined;
  name: string;
  fertilizerType: string;
  form: FertilizerForm;
  dilutionRatio?: string | undefined;
  ingredients?: string | undefined;
  targetStage?: string | undefined;
  notes?: string | undefined;
  createdAt: string;
}

export const HOMEMADE_FERTILIZER_TYPES = [
  "Compost / Worm Tea",
  "Fermented Plant Juice (FPJ)",
  "Banana Peel / Fruit Potassium Tea",
  "Nettle / Herbal Nitrogen Brew",
  "Eggshell Calcium Extract (WCA)",
  "Fish / Kelp Emulsion",
  "Wood Ash / Dry Top-Dress",
  "Aloe / Root Tonic",
  "Custom Homemade Brew",
] as const;

export const DILUTION_RATIO_PRESETS = [
  "1:5 (200ml/L)",
  "1:10 (100ml/L)",
  "1:20 (50ml/L)",
  "1:50 (20ml/L)",
  "10 ml/L",
  "25 ml/L",
] as const;

export const RAW_DOSAGE_PRESETS = [
  "Straight drench (undiluted)",
  "100ml raw pour",
  "2 tbsp raw top-dress",
  "1/2 cup top-dress",
  "Undiluted foliar mist",
] as const;

const FERTILIZER_STORAGE_KEY = "canopy-homemade-fertilizers-v1";

export function sanitizeFertilizer(
  raw: Partial<HomemadeFertilizer>,
  defaultUserId = "guest",
): HomemadeFertilizer {
  const cleanedId =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id
          .trim()
          .replace(/[^a-zA-Z0-9_-]/g, "")
          .slice(0, 128)
      : "";

  const form: FertilizerForm = raw.form === "Raw" ? "Raw" : "Diluted";

  const clean: HomemadeFertilizer = {
    id: cleanedId || uid(),
    userId:
      typeof raw.userId === "string" && raw.userId.trim()
        ? raw.userId.trim().slice(0, 128)
        : defaultUserId,
    name:
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim().slice(0, 128)
        : "Homemade Brew",
    fertilizerType:
      typeof raw.fertilizerType === "string" && raw.fertilizerType.trim()
        ? raw.fertilizerType.trim().slice(0, 128)
        : "Custom Homemade Brew",
    form,
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt.trim()
        ? raw.createdAt.trim().slice(0, 64)
        : today(),
  };

  if (
    raw.dilutionRatio !== undefined &&
    raw.dilutionRatio !== null &&
    String(raw.dilutionRatio).trim() !== ""
  ) {
    clean.dilutionRatio = String(raw.dilutionRatio).trim().slice(0, 128);
  }
  if (
    raw.ingredients !== undefined &&
    raw.ingredients !== null &&
    String(raw.ingredients).trim() !== ""
  ) {
    clean.ingredients = String(raw.ingredients).trim().slice(0, 1024);
  }
  if (
    raw.targetStage !== undefined &&
    raw.targetStage !== null &&
    String(raw.targetStage).trim() !== ""
  ) {
    clean.targetStage = String(raw.targetStage).trim().slice(0, 64);
  }
  if (raw.notes !== undefined && raw.notes !== null && String(raw.notes).trim() !== "") {
    clean.notes = String(raw.notes).trim().slice(0, 1024);
  }

  return clean;
}

export function loadLocalFertilizers(): HomemadeFertilizer[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(FERTILIZER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => sanitizeFertilizer(item));
  } catch {
    return [];
  }
}

export function saveLocalFertilizers(list: HomemadeFertilizer[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(FERTILIZER_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors
  }
}

export function useFertilizers(currentUser?: FirebaseUser | null) {
  const [fertilizers, setFertilizers] = useState<HomemadeFertilizer[]>(() =>
    loadLocalFertilizers(),
  );
  const fertilizersRef = useRef<HomemadeFertilizer[]>(fertilizers);
  const deletedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    fertilizersRef.current = fertilizers;
  }, [fertilizers]);

  useEffect(() => {
    if (!currentUser) {
      setFertilizers(loadLocalFertilizers());
      return;
    }

    const colRef = collection(db, "users", currentUser.uid, "fertilizers");
    const unsubscribe = onSnapshot(
      colRef,
      async (snapshot) => {
        const remoteMap = new Map<string, HomemadeFertilizer>();
        snapshot.forEach((docSnap) => {
          const item = sanitizeFertilizer(
            { ...(docSnap.data() as Partial<HomemadeFertilizer>), id: docSnap.id },
            currentUser.uid,
          );
          remoteMap.set(item.id, item);
        });

        // Reconcile local items not yet in Firestore (excluding intentionally deleted IDs)
        const localItems = loadLocalFertilizers();
        for (const localItem of localItems) {
          if (deletedIdsRef.current.has(localItem.id)) continue;
          if (!remoteMap.has(localItem.id)) {
            const toUpload = sanitizeFertilizer(
              { ...localItem, userId: currentUser.uid },
              currentUser.uid,
            );
            remoteMap.set(toUpload.id, toUpload);
            setDoc(doc(db, "users", currentUser.uid, "fertilizers", toUpload.id), toUpload).catch(
              (err) => {
                console.warn("Failed to sync local fertilizer to Firestore:", err);
              },
            );
          }
        }

        const mergedList = Array.from(remoteMap.values()).filter(
          (item) => !deletedIdsRef.current.has(item.id),
        );
        mergedList.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

        setFertilizers(mergedList);
        saveLocalFertilizers(mergedList);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `users/${currentUser.uid}/fertilizers`);
        } catch {
          // Handled safely
        }
      },
    );

    return () => unsubscribe();
  }, [currentUser]);

  const addFertilizer = useCallback(
    async (input: Omit<HomemadeFertilizer, "id" | "createdAt"> & { id?: string | undefined }) => {
      const uidStr = currentUser?.uid || "guest";
      const clean = sanitizeFertilizer(
        {
          ...input,
          id: input.id || uid(),
          userId: uidStr,
          createdAt: today(),
        },
        uidStr,
      );
      deletedIdsRef.current.delete(clean.id);

      setFertilizers((prev) => {
        const next = [clean, ...prev.filter((f) => f.id !== clean.id)];
        saveLocalFertilizers(next);
        return next;
      });

      if (currentUser) {
        try {
          await setDoc(doc(db, "users", currentUser.uid, "fertilizers", clean.id), clean);
        } catch (err) {
          try {
            handleFirestoreError(
              err,
              OperationType.CREATE,
              `users/${currentUser.uid}/fertilizers/${clean.id}`,
            );
          } catch {
            // Logged
          }
        }
      }

      return clean;
    },
    [currentUser],
  );

  const updateFertilizer = useCallback(
    async (id: string, fn: (f: HomemadeFertilizer) => HomemadeFertilizer) => {
      const uidStr = currentUser?.uid || "guest";
      const existing = fertilizersRef.current.find((f) => f.id === id);
      let updatedTarget: HomemadeFertilizer | null = null;

      if (existing) {
        updatedTarget = sanitizeFertilizer({ ...fn(existing), id, userId: uidStr }, uidStr);
      }

      setFertilizers((prev) => {
        const next = prev.map((f) => {
          if (f.id === id) {
            const mod = sanitizeFertilizer({ ...fn(f), id, userId: uidStr }, uidStr);
            updatedTarget = mod;
            return mod;
          }
          return f;
        });
        saveLocalFertilizers(next);
        return next;
      });

      if (currentUser && updatedTarget) {
        const toSave = updatedTarget as HomemadeFertilizer;
        try {
          await setDoc(doc(db, "users", currentUser.uid, "fertilizers", id), toSave);
        } catch (err) {
          try {
            handleFirestoreError(
              err,
              OperationType.UPDATE,
              `users/${currentUser.uid}/fertilizers/${id}`,
            );
          } catch {
            // Logged
          }
        }
      }
    },
    [currentUser],
  );

  const deleteFertilizer = useCallback(
    async (id: string) => {
      deletedIdsRef.current.add(id);
      setFertilizers((prev) => {
        const next = prev.filter((f) => f.id !== id);
        saveLocalFertilizers(next);
        return next;
      });

      if (currentUser) {
        try {
          await deleteDoc(doc(db, "users", currentUser.uid, "fertilizers", id));
        } catch (err) {
          try {
            handleFirestoreError(
              err,
              OperationType.DELETE,
              `users/${currentUser.uid}/fertilizers/${id}`,
            );
          } catch {
            // Logged
          }
        }
      }
    },
    [currentUser],
  );

  return {
    fertilizers,
    addFertilizer,
    updateFertilizer,
    deleteFertilizer,
  };
}
