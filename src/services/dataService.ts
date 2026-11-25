/**
 * Firestore and localStorage persistence facade for users, conversations,
 * messages, uploads, AQI history, carbon trips, and lifestyle settings.
 */
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  orderBy,
  limit as fsLimit,
  addDoc,
  deleteDoc,
  where,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import type {
  AirQualityRecord,
  CarbonTripRecord,
  ChatMessage,
  ConversationRecord,
  Json,
  MessageRecord,
  PredictionRecord,
  StoredRecord,
  UploadRecord,
} from '../types';

type P = PredictionRecord;

function isoNow(): string {
  return new Date().toISOString();
}

// ---- MOCK fallback store (used only when Firebase is not configured) ----
const DEV_PREFIX = 'airguard_dev_data_';

function devRead<T extends StoredRecord = StoredRecord>(uid: string, kind: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(`${DEV_PREFIX}${uid}_${kind}`) || '[]') as T[];
  } catch {
    return [];
  }
}

function devWrite<T extends StoredRecord>(uid: string, kind: string, items: T[]): void {
  localStorage.setItem(`${DEV_PREFIX}${uid}_${kind}`, JSON.stringify(items));
}

// ---- Users ----
export async function getUser(uid: string): Promise<Json | null> {
  if (isFirebaseConfigured && db) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      return snap.exists() ? (snap.data() as Json) : null;
    } catch (err) {
      console.warn('Firestore getUser failed, falling back to local storage:', err);
    }
  }
  const raw = localStorage.getItem(`${DEV_PREFIX}${uid}_profile`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Json;
  } catch (err) {
    console.warn('Corrupt local profile ignored:', err);
    return null;
  }
}

export async function saveUser(uid: string, data: Json): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      await setDoc(doc(db, 'users', uid), { ...data, updatedAt: isoNow() }, { merge: true });
      return;
    } catch (err) {
      console.warn('Firestore saveUser failed, falling back to local storage:', err);
    }
  }
  const prev = await getUser(uid);
  localStorage.setItem(
    `${DEV_PREFIX}${uid}_profile`,
    JSON.stringify({ ...(prev || {}), ...data, updatedAt: isoNow() }),
  );
}

export async function updateUser(uid: string, data: Json): Promise<void> {
  await saveUser(uid, data);
}

// ---- Conversations ----
export async function listConversations(uid: string): Promise<ConversationRecord[]> {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'users', uid, 'conversations'), orderBy('updatedAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ConversationRecord);
    } catch (err) {
      console.warn('Firestore listConversations failed, falling back to local storage:', err);
    }
  }
  const items = devRead<ConversationRecord>(uid, 'conversations');
  return items.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
}

export async function createConversation(uid: string, title: string): Promise<string> {
  const now = isoNow();
  const data = { title, updatedAt: now, createdAt: now };
  if (isFirebaseConfigured && db) {
    try {
      const ref = await addDoc(collection(db, 'users', uid, 'conversations'), data);
      return ref.id;
    } catch (err) {
      console.warn('Firestore createConversation failed, falling back to local storage:', err);
    }
  }
  const items = devRead<ConversationRecord>(uid, 'conversations');
  const id = `conv-${Date.now()}`;
  items.push({ id, ...data });
  devWrite(uid, 'conversations', items);
  return id;
}

export async function updateConversation(
  uid: string,
  convId: string,
  title: string,
  updatedAt?: string,
): Promise<void> {
  const now = updatedAt || isoNow();
  if (isFirebaseConfigured && db) {
    try {
      await updateDoc(doc(db, 'users', uid, 'conversations', convId), { title, updatedAt: now });
      return;
    } catch (err) {
      console.warn('Firestore updateConversation failed, falling back to local storage:', err);
    }
  }
  const items = devRead<ConversationRecord>(uid, 'conversations').map((c) =>
    c.id === convId ? { ...c, title, updatedAt: now } : c,
  );
  devWrite(uid, 'conversations', items);
}

export async function deleteConversation(uid: string, convId: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      await deleteDoc(doc(db, 'users', uid, 'conversations', convId));
      return;
    } catch (err) {
      console.warn('Firestore deleteConversation failed, falling back to local storage:', err);
    }
  }
  devWrite(
    uid,
    'conversations',
    devRead<ConversationRecord>(uid, 'conversations').filter((c) => c.id !== convId),
  );
  localStorage.removeItem(`${DEV_PREFIX}${uid}_messages_${convId}`);
}

// ---- Messages ----
export async function listMessages(uid: string, convId: string): Promise<MessageRecord[]> {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(
        collection(db, 'users', uid, 'conversations', convId, 'messages'),
        orderBy('timestamp', 'asc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessageRecord);
    } catch (err) {
      console.warn('Firestore listMessages failed, falling back to local storage:', err);
    }
  }
  return devRead<MessageRecord>(uid, `messages_${convId}`);
}

export async function addMessage(
  uid: string,
  convId: string,
  msg: { role: ChatMessage['role']; content: string },
): Promise<void> {
  const data = { ...msg, timestamp: isoNow() };
  if (isFirebaseConfigured && db) {
    try {
      await addDoc(collection(db, 'users', uid, 'conversations', convId, 'messages'), data);
      return;
    } catch (err) {
      console.warn('Firestore addMessage failed, falling back to local storage:', err);
    }
  }
  const items = devRead<MessageRecord>(uid, `messages_${convId}`);
  items.push({ id: `msg-${Date.now()}`, ...data });
  devWrite(uid, `messages_${convId}`, items);
}

// ---- Air quality records ----
export async function addAirQualityRecord(uid: string, record: Json): Promise<void> {
  const data = { ...record, timestamp: (record.timestamp as string) || isoNow() };
  if (isFirebaseConfigured && db) {
    try {
      await addDoc(collection(db, 'users', uid, 'airQuality'), data);
      return;
    } catch (err) {
      console.warn('Firestore addAirQualityRecord failed, falling back to local storage:', err);
    }
  }
  const items = devRead<AirQualityRecord>(uid, 'airQuality');
  items.push({ id: `aq-${Date.now()}`, ...data });
  devWrite(uid, 'airQuality', items);
}

export async function listAirQualityRecords(uid: string, max = 20): Promise<AirQualityRecord[]> {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'users', uid, 'airQuality'), orderBy('timestamp', 'desc'), fsLimit(max));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AirQualityRecord);
    } catch (err) {
      console.warn('Firestore listAirQualityRecords failed, falling back to local storage:', err);
    }
  }
  return devRead<AirQualityRecord>(uid, 'airQuality')
    .sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1))
    .slice(0, max);
}

// ---- Predictions ----
export async function savePredictions(uid: string, predictions: Json[]): Promise<void> {
  const data = { predictions, createdAt: isoNow() };
  if (isFirebaseConfigured && db) {
    try {
      await addDoc(collection(db, 'users', uid, 'predictions'), data);
      return;
    } catch (err) {
      console.warn('Firestore savePredictions failed, falling back to local storage:', err);
    }
  }
  const items = devRead<PredictionRecord>(uid, 'predictions');
  items.push({ id: `pred-${Date.now()}`, ...data });
  devWrite(uid, 'predictions', items);
}

export async function getLatestPredictions(uid: string): Promise<Json[]> {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'users', uid, 'predictions'), orderBy('createdAt', 'desc'), fsLimit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docData = snap.docs[0]!.data();
        return Array.isArray(docData.predictions) ? (docData.predictions as Json[]) : [];
      }
    } catch (err) {
      console.warn('Firestore getLatestPredictions failed, falling back to local storage:', err);
    }
  }
  const items = devRead<P>(uid, 'predictions').sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  return items.length ? items[0]!.predictions : [];
}

// ---- Carbon trips ----
export async function addCarbonTrip(uid: string, trip: Json): Promise<string> {
  const data = { ...trip, date: (trip.date as string) || isoNow() };
  if (isFirebaseConfigured && db) {
    try {
      const ref = await addDoc(collection(db, 'users', uid, 'carbonTrips'), data);
      return ref.id;
    } catch (err) {
      console.warn('Firestore addCarbonTrip failed, falling back to local storage:', err);
    }
  }
  const items = devRead<CarbonTripRecord>(uid, 'carbonTrips');
  const id = `trip-${Date.now()}`;
  items.push({ id, ...data } as CarbonTripRecord);
  devWrite(uid, 'carbonTrips', items);
  return id;
}

export async function listCarbonTrips(uid: string, max?: number): Promise<CarbonTripRecord[]> {
  if (isFirebaseConfigured && db) {
    try {
      const trips = collection(db, 'users', uid, 'carbonTrips');
      const q = max
        ? query(trips, orderBy('date', 'desc'), fsLimit(max))
        : query(trips, orderBy('date', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CarbonTripRecord);
    } catch (err) {
      console.warn('Firestore listCarbonTrips failed, falling back to local storage:', err);
    }
  }
  const items = devRead<CarbonTripRecord>(uid, 'carbonTrips').sort((a, b) => (a.date > b.date ? -1 : 1));
  return max ? items.slice(0, max) : items;
}

export async function deleteCarbonTrip(uid: string, tripId: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      await deleteDoc(doc(db, 'users', uid, 'carbonTrips', tripId));
      return;
    } catch (err) {
      console.warn('Firestore deleteCarbonTrip failed, falling back to local storage:', err);
    }
  }
  devWrite(
    uid,
    'carbonTrips',
    devRead<CarbonTripRecord>(uid, 'carbonTrips').filter((t) => t.id !== tripId),
  );
}

// ---- Uploads metadata ----
export async function addUpload(uid: string, meta: Json): Promise<void> {
  const data = { ...meta, uploadedAt: (meta.uploadedAt as string) || isoNow() };
  if (isFirebaseConfigured && db) {
    try {
      await setDoc(doc(db, 'users', uid, 'uploads', String(meta.fileId)), data);
      return;
    } catch (err) {
      console.warn('Firestore addUpload failed, falling back to local storage:', err);
    }
  }
  const items = devRead<UploadRecord>(uid, 'uploads');
  items.push({ id: meta.fileId as string, ...data } as UploadRecord);
  devWrite(uid, 'uploads', items);
}

export async function listUploads(uid: string): Promise<UploadRecord[]> {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'users', uid, 'uploads'), orderBy('uploadedAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as UploadRecord);
    } catch (err) {
      console.warn('Firestore listUploads failed, falling back to local storage:', err);
    }
  }
  return devRead<UploadRecord>(uid, 'uploads').sort((a, b) => (a.uploadedAt > b.uploadedAt ? -1 : 1));
}

export async function deleteUpload(uid: string, fileId: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      await deleteDoc(doc(db, 'users', uid, 'uploads', fileId));
      return;
    } catch (err) {
      console.warn('Firestore deleteUpload failed, falling back to local storage:', err);
    }
  }
  devWrite(
    uid,
    'uploads',
    devRead<UploadRecord>(uid, 'uploads').filter((f) => f.id !== fileId),
  );
}

export async function isUploadReady(uid: string, fileId: string): Promise<boolean> {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'users', uid, 'uploads'), where('fileId', '==', fileId), fsLimit(1));
      const snap = await getDocs(q);
      return !snap.empty;
    } catch (err) {
      console.warn('Firestore isUploadReady failed, falling back to local storage:', err);
    }
  }
  return devRead<UploadRecord>(uid, 'uploads').some((f) => f.id === fileId);
}

// ---- Household & community watch (stored on the user profile) ----
export async function getLifestyleSettings(uid: string): Promise<Json | null> {
  if (isFirebaseConfigured && db) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        const data = snap.data() as Json;
        const result: Json = {};
        if (data.household) result.household = data.household;
        if (data.communityWatch) result.communityWatch = data.communityWatch;
        if (Object.keys(result).length > 0) return result;
      }
    } catch (err) {
      console.warn('Firestore getLifestyleSettings failed, falling back to local storage:', err);
    }
  }
  const raw = localStorage.getItem(`${DEV_PREFIX}${uid}_lifestyle`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Json;
  } catch (err) {
    console.warn('Corrupt local lifestyle settings ignored:', err);
    return null;
  }
}

export async function saveLifestyleSettings(uid: string, data: Json): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      await setDoc(doc(db, 'users', uid), { ...data, updatedAt: isoNow() }, { merge: true });
      return;
    } catch (err) {
      console.warn('Firestore saveLifestyleSettings failed, falling back to local storage:', err);
    }
  }
  const prev = (await getLifestyleSettings(uid)) ?? {};
  localStorage.setItem(
    `${DEV_PREFIX}${uid}_lifestyle`,
    JSON.stringify({ ...prev, ...data, updatedAt: isoNow() }),
  );
}

// Re-export for convenience
export { collection, doc, getDoc };
