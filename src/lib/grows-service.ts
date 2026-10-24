import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";

import { db, handleFirestoreError, OperationType } from "./firebase";

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
  createdAt?: string;
};

export type Plant = {
  id: string;
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
  createdAt?: string;
  updatedAt?: string;
};

export const LOCAL_STORAGE_KEY = "canopy-plants-v2";

// Clean object helper so no undefined values are sent to Firestore
function cleanPayload<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") {
      result[k] = v;
    }
  }
  return result as T;
}

/**
 * Real-time listener for user's plants in Firestore
 */
export function subscribeUserPlants(
  userId: string,
  onUpdate: (plants: Plant[]) => void,
): () => void {
  const colPath = `users/${userId}/plants`;
  const q = query(collection(db, "users", userId, "plants"), orderBy("createdAt", "desc"));

  return onSnapshot(
    q,
    async (snapshot) => {
      const plants: Plant[] = [];
      for (const docSnap of snapshot.docs) {
        const d = docSnap.data();
        plants.push({
          id: d.id,
          name: d.name,
          strain: d.strain || "",
          type: d.type || "Photoperiod",
          medium: d.medium || "Soil",
          setting: d.setting || "Outdoor",
          started: d.started,
          stage: d.stage,
          stageStarted: d.stageStarted,
          cover: d.cover || undefined,
          yieldG: d.yieldG || undefined,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          logs: [], // Logs are loaded per plant
        });
      }
      onUpdate(plants);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, colPath);
    },
  );
}

/**
 * Real-time listener for a plant's logs
 */
export function subscribePlantLogs(
  userId: string,
  plantId: string,
  onUpdate: (logs: Log[]) => void,
): () => void {
  const logsPath = `users/${userId}/plants/${plantId}/logs`;
  const q = query(
    collection(db, "users", userId, "plants", plantId, "logs"),
    orderBy("date", "desc"),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const logs: Log[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: d.id,
          date: d.date,
          type: d.type,
          note: d.note || undefined,
          photo: d.photo || undefined,
          amount: d.amount || undefined,
          ph: d.ph || undefined,
          ec: d.ec || undefined,
          nutrients: d.nutrients || undefined,
          technique: d.technique || undefined,
          temp: d.temp || undefined,
          humidity: d.humidity || undefined,
          height: d.height || undefined,
          createdAt: d.createdAt,
        };
      });
      onUpdate(logs);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, logsPath);
    },
  );
}

/**
 * Upsert a plant document
 */
export async function savePlantToFirestore(userId: string, plant: Plant): Promise<void> {
  const docPath = `users/${userId}/plants/${plant.id}`;
  const now = new Date().toISOString();
  const payload = cleanPayload({
    id: plant.id,
    userId,
    name: plant.name.slice(0, 100),
    strain: plant.strain ? plant.strain.slice(0, 100) : undefined,
    type: plant.type,
    medium: plant.medium ? plant.medium.slice(0, 50) : undefined,
    setting: plant.setting,
    stage: plant.stage,
    started: plant.started.slice(0, 20),
    stageStarted: plant.stageStarted.slice(0, 20),
    cover: plant.cover,
    yieldG: plant.yieldG ? plant.yieldG.slice(0, 20) : undefined,
    createdAt: plant.createdAt || now,
    updatedAt: now,
  });

  try {
    await setDoc(doc(db, "users", userId, "plants", plant.id), payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

/**
 * Delete a plant and its logs
 */
export async function deletePlantFromFirestore(userId: string, plantId: string): Promise<void> {
  const docPath = `users/${userId}/plants/${plantId}`;
  try {
    // Delete logs first
    const logsSnap = await getDocs(collection(db, "users", userId, "plants", plantId, "logs"));
    for (const logDoc of logsSnap.docs) {
      await deleteDoc(logDoc.ref);
    }
    // Delete plant doc
    await deleteDoc(doc(db, "users", userId, "plants", plantId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

/**
 * Add or update a plant log
 */
export async function savePlantLogToFirestore(
  userId: string,
  plantId: string,
  log: Log,
): Promise<void> {
  const docPath = `users/${userId}/plants/${plantId}/logs/${log.id}`;
  const now = new Date().toISOString();
  const payload = cleanPayload({
    id: log.id,
    plantId,
    userId,
    date: log.date.slice(0, 20),
    type: log.type,
    note: log.note ? log.note.slice(0, 1000) : undefined,
    photo: log.photo,
    amount: log.amount ? log.amount.slice(0, 20) : undefined,
    ph: log.ph ? log.ph.slice(0, 10) : undefined,
    ec: log.ec ? log.ec.slice(0, 10) : undefined,
    nutrients: log.nutrients ? log.nutrients.slice(0, 200) : undefined,
    technique: log.technique ? log.technique.slice(0, 50) : undefined,
    temp: log.temp ? log.temp.slice(0, 10) : undefined,
    humidity: log.humidity ? log.humidity.slice(0, 10) : undefined,
    height: log.height ? log.height.slice(0, 10) : undefined,
    createdAt: log.createdAt || now,
  });

  try {
    await setDoc(doc(db, "users", userId, "plants", plantId, "logs", log.id), payload, {
      merge: true,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

/**
 * Delete a plant log
 */
export async function deletePlantLogFromFirestore(
  userId: string,
  plantId: string,
  logId: string,
): Promise<void> {
  const docPath = `users/${userId}/plants/${plantId}/logs/${logId}`;
  try {
    await deleteDoc(doc(db, "users", userId, "plants", plantId, "logs", logId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

/**
 * Migrate offline/localStorage plants to Firestore when user logs in
 */
export async function migrateLocalGrowsToCloud(
  userId: string,
  localPlants: Plant[],
): Promise<number> {
  if (!localPlants.length) return 0;
  let count = 0;
  for (const plant of localPlants) {
    await savePlantToFirestore(userId, plant);
    if (plant.logs && plant.logs.length) {
      for (const log of plant.logs) {
        await savePlantLogToFirestore(userId, plant.id, log);
      }
    }
    count++;
  }
  return count;
}
