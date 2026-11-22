import { useEffect, useState, useCallback, useRef } from "react";
import { db, handleFirestoreError, OperationType, type FirebaseUser } from "@/lib/firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { compressImage } from "@/lib/photo-utils";

export type Stage =
  "Germination" | "Seedling" | "Vegetative" | "Flowering" | "Drying" | "Curing" | "Harvested";

export type LogType = "water" | "feed" | "training" | "environment" | "photo" | "note";

export type Log = {
  id: string;
  date: string;
  type: LogType;
  note?: string | undefined;
  photo?: string | undefined;
  amount?: string | undefined;
  ph?: string | undefined;
  ec?: string | undefined;
  nutrients?: string | undefined;
  fertilizerForm?: "Raw" | "Diluted" | undefined;
  dilutionRatio?: string | undefined;
  technique?: string | undefined;
  temp?: string | undefined;
  humidity?: string | undefined;
  height?: string | undefined;
};

export type Plant = {
  id: string;
  userId?: string | undefined;
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
  yieldG?: string | undefined;
};

const STORAGE_KEY = "canopy-plants-v2";

export const uid = () => Math.random().toString(36).slice(2, 10);
export const today = () => new Date().toISOString().slice(0, 10);

/**
 * Ensures a Plant document stays safely within Firestore's 1 MiB (1,048,576 bytes) document limit.
 * Always preserves the newest log entries and photos (at the start of `logs[]`) and only archives
 * the oldest log photos at the tail of `logs[]` if the total serialized document exceeds `maxBytes`.
 */
export function fitPlantForFirestore(plant: Plant, maxBytes = 850000): Plant {
  const measure = (p: Plant) => {
    try {
      return JSON.stringify(p).length;
    } catch {
      return 0;
    }
  };

  if (measure(plant) <= maxBytes) {
    return plant;
  }

  const nextLogs = (plant.logs || []).map((l) => ({ ...l }));

  // Pass 1: Archive photos from the OLDEST logs first (never touching index 0, the newest log)
  for (let i = nextLogs.length - 1; i >= 1; i--) {
    if (measure({ ...plant, logs: nextLogs }) <= maxBytes) {
      break;
    }
    const item = nextLogs[i];
    if (item && item.photo) {
      delete item.photo;
      item.note = item.note
        ? item.note.includes("(archived photo)")
          ? item.note
          : `${item.note} (archived photo)`
        : "[Archived Photo]";
    }
  }

  let candidate: Plant = {
    ...plant,
    logs: nextLogs,
  };

  // Pass 2: If still over maxBytes (e.g. an oversized cover + oversized newest log photo in a non-canvas environment)
  if (measure(candidate) > maxBytes && candidate.cover && candidate.cover.length > 450000) {
    const { cover: _droppedCover, ...withoutCover } = candidate;
    candidate = withoutCover;
  }

  return candidate;
}

/**
 * Compresses any oversized base64 photos (> 65KB) in `plant.cover` or `plant.logs`
 * so legacy large photos on existing plants (like Purple Train Wreck) are automatically
 * slimmed down and never block new journal photos from saving.
 */
export async function optimizePlantPhotos(plant: Plant): Promise<Plant> {
  let cover = plant.cover;
  if (cover && cover.startsWith("data:image/") && cover.length > 65000) {
    try {
      const compressedCover = await compressImage(cover, {
        maxDimension: 480,
        quality: 0.55,
        maxBase64Length: 65000,
      });
      if (compressedCover) cover = compressedCover;
    } catch {
      // keep existing cover
    }
  }

  const rawLogs = Array.isArray(plant.logs) ? plant.logs : [];
  const optimizedLogs: Log[] = [];
  for (const log of rawLogs) {
    if (log.photo && log.photo.startsWith("data:image/") && log.photo.length > 65000) {
      try {
        const compressedPhoto = await compressImage(log.photo, {
          maxDimension: 480,
          quality: 0.55,
          maxBase64Length: 65000,
        });
        optimizedLogs.push({
          ...log,
          photo: compressedPhoto || log.photo,
        });
      } catch {
        optimizedLogs.push(log);
      }
    } else {
      optimizedLogs.push(log);
    }
  }

  const sanitized = sanitizePlant(
    {
      ...plant,
      cover,
      logs: optimizedLogs,
    },
    plant.userId || "guest",
  );

  return fitPlantForFirestore(sanitized);
}

/**
 * Safely persists plants array to localStorage.
 * If quota is exceeded (due to multiple photos), creates a slimmed fallback
 * keeping the most recent photos so the browser cache never crashes.
 */
export function safePersistLocal(plants: Plant[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  const buildSlimmed = (maxPhotosPerPlant: number) =>
    plants.map((p) => {
      let photoCount = 0;
      const slimLogs = (p.logs || []).map((l) => {
        if (l.photo) {
          photoCount++;
          if (photoCount > maxPhotosPerPlant) {
            const { photo: _dropped, ...rest } = l;
            return {
              ...rest,
              note: l.note
                ? l.note.includes("(archived photo)")
                  ? l.note
                  : `${l.note} (archived photo)`
                : "[Archived Photo]",
            };
          }
        }
        return l;
      });
      return { ...p, logs: slimLogs };
    });

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plants));
  } catch {
    try {
      // Tier 2: Keep up to 6 most recent photos per plant
      const slimmed6 = buildSlimmed(6);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slimmed6));
    } catch {
      try {
        // Tier 3: Free space from heavy AI scan history caches if present, then keep 3 newest photos per plant
        try {
          localStorage.removeItem("canopy-ai-scans-v1");
          localStorage.removeItem("canopy-ai-advice-scans-v1");
        } catch {
          // ignore
        }
        const slimmed3 = buildSlimmed(3);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slimmed3));
      } catch {
        try {
          // Tier 4: Keep the newest photo (logs[0]) on each plant so the latest photo always saves
          const slimmed1 = buildSlimmed(1);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(slimmed1));
        } catch {
          // Final silent safeguard
        }
      }
    }
  }
}

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
  if (raw.fertilizerForm === "Raw" || raw.fertilizerForm === "Diluted") {
    clean.fertilizerForm = raw.fertilizerForm;
  }
  if (
    raw.dilutionRatio !== undefined &&
    raw.dilutionRatio !== null &&
    String(raw.dilutionRatio).trim() !== ""
  ) {
    clean.dilutionRatio = String(raw.dilutionRatio);
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
  const cleanedId =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id
          .trim()
          .replace(/[^a-zA-Z0-9_-]/g, "")
          .slice(0, 128)
      : "";
  const pId = cleanedId || uid();
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

/**
 * Reconciles cloud plants from Firestore with local state/cache plants so that
 * any locally added journal logs or photos (e.g. on Purple Train Wreck) are never
 * wiped out if an earlier Firestore write was still in flight or exceeded payload limits.
 */
export function reconcileCloudAndLocalPlants(
  cloudPlants: Plant[],
  localPlants: Plant[],
  deletedLogIds: Set<string>,
  userId: string,
): { merged: Plant[]; dirtyPlants: Plant[] } {
  const dirtyPlants: Plant[] = [];

  const merged = cloudPlants.map((cloudPlant) => {
    const normalizedCloudName = cloudPlant.name.trim().toLowerCase();
    const localMatch =
      localPlants.find((lp) => lp.id === cloudPlant.id) ||
      localPlants.find((lp) => lp.name.trim().toLowerCase() === normalizedCloudName);

    if (!localMatch) {
      return cloudPlant;
    }

    let isDirty = false;
    const cloudLogsById = new Map<string, Log>();
    for (const cl of cloudPlant.logs || []) {
      cloudLogsById.set(cl.id, cl);
    }

    const extraLocalLogs: Log[] = [];
    for (const localLog of localMatch.logs || []) {
      if (deletedLogIds.has(localLog.id)) continue;
      const existingCloudLog = cloudLogsById.get(localLog.id);
      if (!existingCloudLog) {
        extraLocalLogs.push(localLog);
        isDirty = true;
      } else if (localLog.photo && !existingCloudLog.photo) {
        // Restore photo if local log has it and cloud copy lacked it
        cloudLogsById.set(localLog.id, { ...existingCloudLog, photo: localLog.photo });
        isDirty = true;
      }
    }

    let mergedCover = cloudPlant.cover;
    if (!mergedCover && localMatch.cover) {
      mergedCover = localMatch.cover;
      isDirty = true;
    }

    if (!isDirty) {
      return cloudPlant;
    }

    const combinedLogs = [...extraLocalLogs, ...Array.from(cloudLogsById.values())];
    const reconciled = sanitizePlant(
      {
        ...cloudPlant,
        cover: mergedCover,
        logs: combinedLogs,
        userId,
      },
      userId,
    );
    dirtyPlants.push(reconciled);
    return reconciled;
  });

  return { merged, dirtyPlants };
}

function readStoredPlants(defaultUserId: string): Plant[] {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.map((p) => sanitizePlant(p, defaultUserId));
        }
      }
    }
  } catch {
    // ignore parse error
  }
  return [];
}

export function usePlants(currentUser?: FirebaseUser | null) {
  const [plants, setPlants] = useState<Plant[]>(() =>
    readStoredPlants(currentUser?.uid || "guest"),
  );
  const [loading, setLoading] = useState(true);

  const plantsRef = useRef<Plant[]>(plants);
  const deletedLogIdsRef = useRef<Set<string>>(new Set());
  const firestoreDocIdMapRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    plantsRef.current = plants;
  }, [plants]);

  // Sync with Firestore when logged in, or local storage when guest
  useEffect(() => {
    if (!currentUser) {
      const local = readStoredPlants("guest");
      plantsRef.current = local;
      setPlants(local);
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
            const rawData = d.data() as Partial<Plant>;
            const sanitized = sanitizePlant(
              {
                ...rawData,
                id: rawData.id && String(rawData.id).trim() ? rawData.id : d.id,
              },
              currentUser.uid,
            );
            firestoreDocIdMapRef.current.set(sanitized.id, d.id);
            cloudPlants.push(sanitized);
          } catch (e) {
            console.error("Error parsing plant document", e);
          }
        });

        // Auto-migrate local storage plants to cloud on first login
        if (cloudPlants.length === 0) {
          const local = readStoredPlants(currentUser.uid);
          if (local.length > 0) {
            const sanitizedLocal = local.map((p) =>
              fitPlantForFirestore(
                sanitizePlant({ ...p, userId: currentUser.uid }, currentUser.uid),
              ),
            );
            sanitizedLocal.forEach((p) => {
              setDoc(doc(db, "users", currentUser.uid, "plants", p.id), p).catch(console.error);
            });
            plantsRef.current = sanitizedLocal;
            setPlants(sanitizedLocal);
            safePersistLocal(sanitizedLocal);
            setLoading(false);
            return;
          }
        }

        // Reconcile cloud snapshot with any newer local logs/photos so local additions are never lost
        const currentLocal =
          plantsRef.current.length > 0 ? plantsRef.current : readStoredPlants(currentUser.uid);
        const { merged, dirtyPlants } = reconcileCloudAndLocalPlants(
          cloudPlants,
          currentLocal,
          deletedLogIdsRef.current,
          currentUser.uid,
        );

        merged.sort((a, b) => (b.started || "").localeCompare(a.started || ""));
        plantsRef.current = merged;
        setPlants(merged);
        safePersistLocal(merged);
        setLoading(false);

        // Push any reconciled local logs/photos back to Firestore after optimizing size
        if (dirtyPlants.length > 0) {
          dirtyPlants.forEach((dirty) => {
            const targetDocId = firestoreDocIdMapRef.current.get(dirty.id) || dirty.id;
            optimizePlantPhotos(dirty)
              .then((optimized) =>
                setDoc(doc(db, "users", currentUser.uid, "plants", targetDocId), optimized),
              )
              .catch((err) => console.warn("Background reconciliation sync warning:", err));
          });
        }
      },
      (error) => {
        console.warn("Firestore onSnapshot error, falling back to local cache:", error);
        const local = readStoredPlants(currentUser.uid);
        if (local.length > 0) {
          plantsRef.current = local;
          setPlants(local);
        }
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUser]);

  // Persist to local cache safely with photo quota fallback
  useEffect(() => {
    safePersistLocal(plants);
  }, [plants]);

  const updatePlant = useCallback(
    async (id: string, fn: (p: Plant) => Plant) => {
      const currentList = plantsRef.current;
      const existing = currentList.find((p) => p.id === id);
      let targetToSave: Plant | null = null;

      if (existing) {
        try {
          const updated = fn(existing);
          // Track any deleted log IDs so onSnapshot reconciliation doesn't re-add them
          const updatedLogIds = new Set((updated.logs || []).map((l) => l.id));
          for (const prevLog of existing.logs || []) {
            if (!updatedLogIds.has(prevLog.id)) {
              deletedLogIdsRef.current.add(prevLog.id);
            }
          }
          targetToSave = sanitizePlant(updated, currentUser?.uid || existing.userId || "guest");
        } catch (err) {
          console.error("Failed to precompute updated plant:", err);
        }
      }

      if (targetToSave) {
        const immediateNext = currentList.map((p) => (p.id === id ? (targetToSave as Plant) : p));
        plantsRef.current = immediateNext;
        safePersistLocal(immediateNext);
      }

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

        plantsRef.current = next;
        safePersistLocal(next);
        return next;
      });

      // Optimize any oversized photos and synchronize to Firestore
      if (targetToSave) {
        const optimized = await optimizePlantPhotos(targetToSave as Plant);
        // Update local cache with optimized photo sizes too
        const optimizedList = plantsRef.current.map((p) => (p.id === id ? optimized : p));
        plantsRef.current = optimizedList;
        safePersistLocal(optimizedList);

        if (currentUser) {
          const targetDocId = firestoreDocIdMapRef.current.get(id) || id;
          try {
            const toSave = fitPlantForFirestore(
              sanitizePlant(
                {
                  ...optimized,
                  id,
                  userId: currentUser.uid,
                },
                currentUser.uid,
              ),
            );
            await setDoc(doc(db, "users", currentUser.uid, "plants", targetDocId), toSave);
          } catch (err) {
            console.error("Error saving updated plant to Firestore:", err);
            try {
              handleFirestoreError(
                err,
                OperationType.UPDATE,
                `users/${currentUser.uid}/plants/${targetDocId}`,
              );
            } catch {
              // Logged by handleFirestoreError
            }
            throw err;
          }
        }
      }
    },
    [currentUser],
  );

  const setPlantCover = useCallback(
    async (id: string, cover?: string) => {
      let cleanCover =
        cover && typeof cover === "string" && cover.trim() ? cover.trim() : undefined;
      if (cleanCover && cleanCover.length > 45000) {
        try {
          cleanCover = await compressImage(cleanCover, {
            maxDimension: 512,
            quality: 0.6,
            maxBase64Length: 65000,
          });
        } catch (e) {
          console.warn("Cover compression fallback:", e);
        }
      }
      await updatePlant(id, (p) => {
        return {
          ...p,
          cover: cleanCover,
        };
      });
    },
    [updatePlant],
  );

  const addLogToPlants = useCallback(
    async (plantIds: string[], logData: Omit<Log, "id">) => {
      if (!plantIds || plantIds.length === 0) return;

      let preparedPhoto = logData.photo;
      if (
        preparedPhoto &&
        preparedPhoto.startsWith("data:image/") &&
        preparedPhoto.length > 45000
      ) {
        try {
          const compressed = await compressImage(preparedPhoto, {
            maxDimension: 512,
            quality: 0.6,
            maxBase64Length: 65000,
          });
          if (compressed) preparedPhoto = compressed;
        } catch {
          // keep original if compression fails
        }
      }

      const cleanLog = sanitizeLog({
        ...logData,
        photo: preparedPhoto,
      });

      const plantsToSync: Plant[] = [];
      const currentList = plantsRef.current;

      const updatedList = currentList.map((p) => {
        if (!plantIds.includes(p.id)) return p;
        const currentLogs = Array.isArray(p.logs) ? p.logs : [];
        const updatedLogs = [cleanLog, ...currentLogs]
          .map(sanitizeLog)
          .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

        const updatedPlant = sanitizePlant(
          {
            ...p,
            cover: p.cover || cleanLog.photo || undefined,
            userId: currentUser ? currentUser.uid : p.userId || "guest",
            logs: updatedLogs,
          },
          currentUser?.uid || "guest",
        );
        plantsToSync.push(updatedPlant);
        return updatedPlant;
      });

      plantsRef.current = updatedList;
      safePersistLocal(updatedList);

      setPlants((prev) => {
        const next = prev.map((p) => {
          if (!plantIds.includes(p.id)) return p;
          const currentLogs = Array.isArray(p.logs) ? p.logs : [];
          const hasLogAlready = currentLogs.some((l) => l.id === cleanLog.id);
          const mergedLogs = (hasLogAlready ? currentLogs : [cleanLog, ...currentLogs])
            .map(sanitizeLog)
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

          return sanitizePlant(
            {
              ...p,
              cover: p.cover || cleanLog.photo || undefined,
              userId: currentUser ? currentUser.uid : p.userId || "guest",
              logs: mergedLogs,
            },
            currentUser?.uid || "guest",
          );
        });

        plantsRef.current = next;
        safePersistLocal(next);
        return next;
      });

      if (currentUser && plantsToSync.length > 0) {
        for (const p of plantsToSync) {
          const targetDocId = firestoreDocIdMapRef.current.get(p.id) || p.id;
          try {
            const optimized = await optimizePlantPhotos({
              ...p,
              userId: currentUser.uid,
            });
            const toSave = fitPlantForFirestore(
              sanitizePlant({ ...optimized, userId: currentUser.uid }, currentUser.uid),
            );
            await setDoc(doc(db, "users", currentUser.uid, "plants", targetDocId), toSave);
          } catch (err) {
            console.error(`Error saving plant log to Firestore for ${p.id}:`, err);
            try {
              handleFirestoreError(
                err,
                OperationType.UPDATE,
                `users/${currentUser.uid}/plants/${targetDocId}`,
              );
            } catch {
              // Logged by handleFirestoreError
            }
            throw err;
          }
        }
      }
    },
    [currentUser],
  );

  const createPlant = useCallback(
    async (p: Plant) => {
      const optimized = await optimizePlantPhotos({
        ...p,
        userId: currentUser?.uid || "guest",
      });
      const toSave = fitPlantForFirestore(
        sanitizePlant(
          {
            ...optimized,
            userId: currentUser?.uid || "guest",
          },
          currentUser?.uid || "guest",
        ),
      );

      const nextList = [toSave, ...plantsRef.current.filter((x) => x.id !== toSave.id)];
      plantsRef.current = nextList;
      safePersistLocal(nextList);

      setPlants((prev) => {
        const next = [toSave, ...prev.filter((x) => x.id !== toSave.id)];
        plantsRef.current = next;
        safePersistLocal(next);
        return next;
      });

      if (currentUser) {
        try {
          firestoreDocIdMapRef.current.set(toSave.id, toSave.id);
          await setDoc(doc(db, "users", currentUser.uid, "plants", toSave.id), toSave);
        } catch (err) {
          console.error("Error creating plant document in Firestore:", err);
          try {
            handleFirestoreError(
              err,
              OperationType.CREATE,
              `users/${currentUser.uid}/plants/${toSave.id}`,
            );
          } catch {
            // Logged by handleFirestoreError
          }
          throw err;
        }
      }
    },
    [currentUser],
  );

  const deletePlant = useCallback(
    async (id: string) => {
      const targetDocId = firestoreDocIdMapRef.current.get(id) || id;
      const nextList = plantsRef.current.filter((p) => p.id !== id);
      plantsRef.current = nextList;
      safePersistLocal(nextList);

      setPlants((prev) => {
        const next = prev.filter((p) => p.id !== id);
        plantsRef.current = next;
        safePersistLocal(next);
        return next;
      });

      if (currentUser) {
        try {
          await deleteDoc(doc(db, "users", currentUser.uid, "plants", targetDocId));
        } catch (err) {
          console.error("Error deleting plant from Firestore:", err);
          try {
            handleFirestoreError(
              err,
              OperationType.DELETE,
              `users/${currentUser.uid}/plants/${targetDocId}`,
            );
          } catch {
            // Logged by handleFirestoreError
          }
          throw err;
        }
      }
    },
    [currentUser],
  );

  return {
    plants,
    loading,
    updatePlant,
    setPlantCover,
    addLogToPlants,
    createPlant,
    deletePlant,
  };
}
