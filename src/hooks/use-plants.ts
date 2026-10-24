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
  cover?: string | undefined;
  logs: Log[];
  yieldG?: string;
};

const STORAGE_KEY = "canopy-plants-v2";

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);

export function usePlants(currentUser?: FirebaseUser | null) {
  const [plants, setPlants] = useState<Plant[]>(() => {
    try {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return JSON.parse(stored);
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
        const local = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        setPlants(local);
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
          cloudPlants.push(d.data() as Plant);
        });

        // Auto-migrate local storage plants to cloud on first login
        if (cloudPlants.length === 0) {
          try {
            const local: Plant[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            if (local.length > 0) {
              local.forEach((p) => {
                const migrated = { ...p, userId: currentUser.uid };
                setDoc(doc(db, "users", currentUser.uid, "plants", p.id), migrated).catch(
                  console.error,
                );
              });
              setPlants(local);
              setLoading(false);
              return;
            }
          } catch {
            // Ignore
          }
        }

        setPlants(cloudPlants);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `users/${currentUser.uid}/plants`);
      },
    );

    return () => unsubscribe();
  }, [currentUser]);

  // Persist to local cache
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plants));
    } catch {
      // Storage quota safety
    }
  }, [plants]);

  const updatePlant = useCallback(
    async (id: string, fn: (p: Plant) => Plant) => {
      setPlants((prev) => {
        const next = prev.map((p) => (p.id === id ? fn(p) : p));
        const updated = next.find((p) => p.id === id);
        if (currentUser && updated) {
          const toSave: Plant = {
            ...updated,
            userId: currentUser.uid,
            started: updated.started || today(),
            stageStarted: updated.stageStarted || updated.started || today(),
            logs: updated.logs || [],
          };
          setDoc(doc(db, "users", currentUser.uid, "plants", id), toSave).catch((err) => {
            handleFirestoreError(
              err,
              OperationType.UPDATE,
              `users/${currentUser.uid}/plants/${id}`,
            );
          });
        }
        return next;
      });
    },
    [currentUser],
  );

  const addLogToPlants = useCallback(
    async (plantIds: string[], logData: Omit<Log, "id">) => {
      if (plantIds.length === 0) return;

      setPlants((prev) => {
        const next = prev.map((p) => {
          if (!plantIds.includes(p.id)) return p;
          const newLog: Log = {
            id: uid(),
            date: logData.date || today(),
            ...logData,
          };
          const updatedPlant: Plant = {
            ...p,
            userId: currentUser ? currentUser.uid : p.userId || "guest",
            started: p.started || today(),
            stageStarted: p.stageStarted || p.started || today(),
            logs: [newLog, ...(p.logs || [])],
          };

          if (currentUser) {
            setDoc(doc(db, "users", currentUser.uid, "plants", p.id), updatedPlant).catch((err) => {
              handleFirestoreError(
                err,
                OperationType.UPDATE,
                `users/${currentUser.uid}/plants/${p.id}`,
              );
            });
          }

          return updatedPlant;
        });

        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [currentUser],
  );

  const createPlant = useCallback(
    async (p: Plant) => {
      const toSave: Plant = {
        ...p,
        userId: currentUser?.uid || "guest",
        started: p.started || today(),
        stageStarted: p.stageStarted || p.started || today(),
        logs: p.logs || [],
      };
      setPlants((prev) => [toSave, ...prev]);

      if (currentUser) {
        try {
          await setDoc(doc(db, "users", currentUser.uid, "plants", toSave.id), toSave);
        } catch (err) {
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
      setPlants((prev) => prev.filter((p) => p.id !== id));

      if (currentUser) {
        try {
          await deleteDoc(doc(db, "users", currentUser.uid, "plants", id));
        } catch (err) {
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
