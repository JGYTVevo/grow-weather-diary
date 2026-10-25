import { useEffect, useState, useCallback } from "react";
import { db, handleFirestoreError, OperationType, type FirebaseUser } from "@/lib/firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";

export type Stage =
  "Germination" | "Seedling" | "Vegetative" | "Flowering" | "Drying" | "Curing" | "Harvested";

export type LogType = "water" | "feed" | "training" | "environment" | "photo" | "note";

export type Log = {
  id: string;
  date: string;
  type: LogType;
  note?: string;
  photo?: string;
  amount?: string;
  ph?: string;
  ec?: string;
  nutrients?: string;
  technique?: string;
  temp?: string;
  humidity?: string;
  height?: string;
};

export type Plant = {
  id: string;
  userId?: string;
  name: string;
  strain: string;
  type: "Photoperiod" | "Autoflower";
  medium: string;
  setting: "Indoor" | "Outdoor" | "Greenhouse";
  started: string;
  stage: Stage;
  stageStarted: string;
  cover?: string;
  logs: Log[];
  yieldG?: string;
};

const STORAGE_KEY = "canopy-plants-v2";

export const uid = () => Math.random().toString(36).slice(2, 10);
export const today = () => new Date().toISOString().slice(0, 10);

/**
 * Strips all undefined fields and ensures robust types for a Log
 */
export function sanitizeLog(raw: Partial<Log>): Log {
  const cleanDate =
    typeof raw.date === "string" && raw.date.trim() ? raw.date.trim().slice(0, 32) : today();

  const clean: Log = {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    date: cleanDate,
    type:
      raw.type && ["water", "feed", "training", "environment", "photo", "note"].includes(raw.type)
        ? raw.type
        : "note",
  };

  if (raw.note !== undefined && raw.note !== null && String(raw.note).trim() !== "") {
    clean.note = String(raw.note);
  }
  if (raw.photo !== undefined && raw.photo !== null && String(raw.photo).trim() !== "") {
    clean.photo = String(raw.photo);
  }
  if (raw.amount !== undefined && raw.amount !== null && String(raw.amount).trim() !== "") {
    clean.amount = String(raw.amount);
  }
  if (raw.ph !== undefined && raw.ph !== null && String(raw.ph).trim() !== "") {
    clean.ph = String(raw.ph);
  }
  if (raw.ec !== undefined && raw.ec !== null && String(raw.ec).trim() !== "") {
    clean.ec = String(raw.ec);
  }
  if (
    raw.nutrients !== undefined &&
    raw.nutrients !== null &&
    String(raw.nutrients).trim() !== ""
  ) {
    clean.nutrients = String(raw.nutrients);
  }
  if (
    raw.technique !== undefined &&
    raw.technique !== null &&
    String(raw.technique).trim() !== ""
  ) {
    clean.technique = String(raw.technique);
  }
  if (raw.temp !== undefined && raw.temp !== null && String(raw.temp).trim() !== "") {
    clean.temp = String(raw.temp);
  }
  if (raw.humidity !== undefined && raw.humidity !== null && String(raw.humidity).trim() !== "") {
    clean.humidity = String(raw.humidity);
  }
  if (raw.height !== undefined && raw.height !== null && String(raw.height).trim() !== "") {
    clean.height = String(raw.height);
  }

  return clean;
}

/**
 * Sanitizes a plant object ensuring required fields conform to Firestore rules and JSON schema
 */
export function sanitizePlant(raw: Partial<Plant>, defaultUserId = "guest"): Plant {
  const pId =
    typeof raw.id === "string" && raw.id.trim() ? raw.id.replace(/[^a-zA-Z0-9_-]/g, "") : uid();
  const safeStarted =
    typeof raw.started === "string" && raw.started.trim()
      ? raw.started.trim().slice(0, 32)
      : today();
  const safeStageStarted =
    typeof raw.stageStarted === "string" && raw.stageStarted.trim()
      ? raw.stageStarted.trim().slice(0, 32)
      : safeStarted;

  const rawLogs = Array.isArray(raw.logs) ? raw.logs : [];
  const safeLogs = rawLogs.map(sanitizeLog);
  safeLogs.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const clean: Plant = {
    id: pId || uid(),
    userId: typeof raw.userId === "string" && raw.userId.trim() ? raw.userId.trim() : defaultUserId,
    name:
      typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 128) : "My Plant",
    strain: typeof raw.strain === "string" ? raw.strain.slice(0, 128) : "",
    type: raw.type === "Autoflower" ? "Autoflower" : "Photoperiod",
    medium: typeof raw.medium === "string" && raw.medium.trim() ? raw.medium.trim() : "Soil",
    setting: raw.setting === "Indoor" || raw.setting === "Greenhouse" ? raw.setting : "Outdoor",
    started: safeStarted,
    stage:
      raw.stage &&
      [
        "Germination",
        "Seedling",
        "Vegetative",
        "Flowering",
        "Drying",
        "Curing",
        "Harvested",
      ].includes(raw.stage)
        ? raw.stage
        : "Germination",
    stageStarted: safeStageStarted,
    logs: safeLogs,
  };

  if (raw.cover && typeof raw.cover === "string" && raw.cover.trim()) {
    clean.cover = raw.cover;
  }
  if (raw.yieldG && typeof raw.yieldG === "string" && raw.yieldG.trim()) {
    clean.yieldG = raw.yieldG;
  }

  return clean;
}

export function usePlants(currentUser?: FirebaseUser | null) {
  const [plants, setPlants] = useState<Plant[]>(() => {
    try {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            return parsed.map((p) => sanitizePlant(p, currentUser?.uid || "guest"));
          }
        }
      }
    } catch {
      // Local quota or parse error
    }
    return [];
  });
  const [loading, setLoading] = useState(true);

  // Sync with Firestore when logged in, or local storage when guest
  useEffect(() => {
    if (!currentUser) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const local = raw ? JSON.parse(raw) : [];
        if (Array.isArray(local)) {
          setPlants(local.map((p) => sanitizePlant(p, "guest")));
        }
      } catch {
        // Ignore
      }
      setLoading(false);
      return;
    }

    const colRef = collection(db, "users", currentUser.uid, "plants");
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const cloudPlants: Plant[] = [];
        snapshot.forEach((d) => {
          try {
            cloudPlants.push(sanitizePlant(d.data() as Plant, currentUser.uid));
          } catch (e) {
            console.error("Error parsing plant document", e);
          }
        });

        // Auto-migrate local storage plants to cloud on first login
        if (cloudPlants.length === 0) {
          try {
            const rawStored = localStorage.getItem(STORAGE_KEY);
            const local: Plant[] = rawStored ? JSON.parse(rawStored) : [];
            if (Array.isArray(local) && local.length > 0) {
              const sanitizedLocal = local.map((p) =>
                sanitizePlant({ ...p, userId: currentUser.uid }, currentUser.uid),
              );
              sanitizedLocal.forEach((p) => {
                setDoc(doc(db, "users", currentUser.uid, "plants", p.id), p).catch(console.error);
              });
              setPlants(sanitizedLocal);
              setLoading(false);
              return;
            }
          } catch {
            // Ignore
          }
        }

        cloudPlants.sort((a, b) => (b.started || "").localeCompare(a.started || ""));
        setPlants(cloudPlants);
        setLoading(false);
      },
      (error) => {
        console.warn("Firestore onSnapshot error, falling back to local cache:", error);
        try {
          const local = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
          if (Array.isArray(local)) {
            setPlants(local.map((p) => sanitizePlant(p, currentUser.uid)));
          }
        } catch {
          // Ignore
        }
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUser]);

  // Persist to local cache safely
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plants));
    } catch (e) {
      console.warn("Storage quota exceeded or error caching plants:", e);
    }
  }, [plants]);

  const updatePlant = useCallback(
    async (id: string, fn: (p: Plant) => Plant) => {
      let targetToSave: Plant | null = null;

      setPlants((prev) => {
        const next = prev.map((p) => {
          if (p.id !== id) return p;
          try {
            const updated = fn(p);
            const sanitized = sanitizePlant(updated, currentUser?.uid || p.userId || "guest");
            targetToSave = sanitized;
            return sanitized;
          } catch (err) {
            console.error("Failed to run updater function on plant", err);
            return p;
          }
        });

        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });

      if (currentUser && targetToSave) {
        const plantToSave = targetToSave as Plant;
        try {
          const toSave = sanitizePlant(
            {
              ...plantToSave,
              userId: currentUser.uid,
            },
            currentUser.uid,
          );
          await setDoc(doc(db, "users", currentUser.uid, "plants", id), toSave);
        } catch (err) {
          console.error("Error saving updated plant to Firestore:", err);
          handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}/plants/${id}`);
        }
      }
    },
    [currentUser],
  );

  const addLogToPlants = useCallback(
    async (plantIds: string[], logData: Omit<Log, "id">) => {
      if (!plantIds || plantIds.length === 0) return;
      const cleanLog = sanitizeLog(logData);

      const plantsToSync: Plant[] = [];

      setPlants((prev) => {
        const next = prev.map((p) => {
          if (!plantIds.includes(p.id)) return p;
          const currentLogs = Array.isArray(p.logs) ? p.logs : [];
          const updatedLogs = [cleanLog, ...currentLogs]
            .map(sanitizeLog)
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

          const updatedPlant = sanitizePlant(
            {
              ...p,
              userId: currentUser ? currentUser.uid : p.userId || "guest",
              logs: updatedLogs,
            },
            currentUser?.uid || "guest",
          );

          plantsToSync.push(updatedPlant);
          return updatedPlant;
        });

        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });

      if (currentUser && plantsToSync.length > 0) {
        for (const p of plantsToSync) {
          try {
            const toSave = sanitizePlant({ ...p, userId: currentUser.uid }, currentUser.uid);
            await setDoc(doc(db, "users", currentUser.uid, "plants", p.id), toSave);
          } catch (err) {
            console.error(`Error saving plant log to Firestore for ${p.id}:`, err);
            handleFirestoreError(
              err,
              OperationType.UPDATE,
              `users/${currentUser.uid}/plants/${p.id}`,
            );
          }
        }
      }
    },
    [currentUser],
  );

  const createPlant = useCallback(
    async (p: Plant) => {
      const toSave = sanitizePlant(
        {
          ...p,
          userId: currentUser?.uid || "guest",
        },
        currentUser?.uid || "guest",
      );

      setPlants((prev) => {
        const next = [toSave, ...prev.filter((x) => x.id !== toSave.id)];
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });

      if (currentUser) {
        try {
          await setDoc(doc(db, "users", currentUser.uid, "plants", toSave.id), toSave);
        } catch (err) {
          console.error("Error creating plant document in Firestore:", err);
          handleFirestoreError(
            err,
            OperationType.CREATE,
            `users/${currentUser.uid}/plants/${toSave.id}`,
          );
        }
      }
    },
    [currentUser],
  );

  const deletePlant = useCallback(
    async (id: string) => {
      setPlants((prev) => {
        const next = prev.filter((p) => p.id !== id);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });

      if (currentUser) {
        try {
          await deleteDoc(doc(db, "users", currentUser.uid, "plants", id));
        } catch (err) {
          console.error("Error deleting plant from Firestore:", err);
          handleFirestoreError(err, OperationType.DELETE, `users/${currentUser.uid}/plants/${id}`);
        }
      }
    },
    [currentUser],
  );

  return {
    plants,
    loading,
    updatePlant,
    addLogToPlants,
    createPlant,
    deletePlant,
  };
}
