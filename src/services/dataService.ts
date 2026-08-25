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

type Json = Record<string, unknown>;

function isoNow(): string {
  return new Date().toISOString();
}

// ---- MOCK fallback store (used only when Firebase is not configured) ----
const DEV_PREFIX = 'airguard_dev_data_';

function devRead(uid: string, kind: string): any[] {
  try {
    return JSON.parse(localStorage.getItem(`${DEV_PREFIX}${uid}_${kind}`) || '[]');
  } catch {
    return [];
  }
}

function devWrite(uid: string, kind: string, items: any[]) {
  localStorage.setItem(`${DEV_PREFIX}${uid}_${kind}`, JSON.stringify(items));
}

function withId(doc: any): any {
  return { ...doc, id: doc.id ?? doc.uid ?? doc.fileId ?? doc.tripId ?? doc.conversationId ?? doc.recordId ?? doc.predictionId };
}

// ---- Users ----
export async function getUser(uid: string): Promise<Json | null> {
  if (isFirebaseConfigured && db) {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() as Json) : null;
  }
  const raw = localStorage.getItem(`${DEV_PREFIX}${uid}_profile`);
  return raw ? JSON.parse(raw) : null;
}

export async function saveUser(uid: string, data: Json): Promise<void> {
  if (isFirebaseConfigured && db) {
    await setDoc(doc(db, 'users', uid), { ...data, updatedAt: isoNow() }, { merge: true });
    return;
  }
  const prev = await getUser(uid);
  localStorage.setItem(`${DEV_PREFIX}${uid}_profile`, JSON.stringify({ ...(prev || {}), ...data, updatedAt: isoNow() }));
}

export async function updateUser(uid: string, data: Json): Promise<void> {
  await saveUser(uid, data);
}

// ---- Conversations ----
export async function listConversations(uid: string): Promise<any[]> {
  if (isFirebaseConfigured && db) {
    const q = query(collection(db, 'users', uid, 'conversations'), orderBy('updatedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const items = devRead(uid, 'conversations');
  return items.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
}

export async function createConversation(uid: string, title: string): Promise<string> {
  const now = isoNow();
  const data = { title, updatedAt: now, createdAt: now };
  if (isFirebaseConfigured && db) {
    const ref = await addDoc(collection(db, 'users', uid, 'conversations'), data);
    return ref.id;
  }
  const items = devRead(uid, 'conversations');
  const id = `conv-${Date.now()}`;
  items.push({ id, ...data });
  devWrite(uid, 'conversations', items);
  return id;
}

export async function updateConversation(uid: string, convId: string, title: string, updatedAt?: string): Promise<void> {
  const now = updatedAt || isoNow();
  if (isFirebaseConfigured && db) {
    await updateDoc(doc(db, 'users', uid, 'conversations', convId), { title, updatedAt: now });
    return;
  }
  const items = devRead(uid, 'conversations').map((c) =>
    c.id === convId ? { ...c, title, updatedAt: now } : c
  );
  devWrite(uid, 'conversations', items);
}

export async function deleteConversation(uid: string, convId: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    await deleteDoc(doc(db, 'users', uid, 'conversations', convId));
    return;
  }
  devWrite(
    uid,
    'conversations',
    devRead(uid, 'conversations').filter((c) => c.id !== convId)
  );
  localStorage.removeItem(`${DEV_PREFIX}${uid}_messages_${convId}`);
}

// ---- Messages ----
export async function listMessages(uid: string, convId: string): Promise<any[]> {
  if (isFirebaseConfigured && db) {
    const q = query(collection(db, 'users', uid, 'conversations', convId, 'messages'), orderBy('timestamp', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return devRead(uid, `messages_${convId}`);
}

export async function addMessage(uid: string, convId: string, msg: { role: string; content: string }): Promise<void> {
  const data = { ...msg, timestamp: isoNow() };
  if (isFirebaseConfigured && db) {
    await addDoc(collection(db, 'users', uid, 'conversations', convId, 'messages'), data);
    return;
  }
  const items = devRead(uid, `messages_${convId}`);
  items.push({ id: `msg-${Date.now()}`, ...data });
  devWrite(uid, `messages_${convId}`, items);
}

// ---- Air quality records ----
export async function addAirQualityRecord(uid: string, record: Json): Promise<void> {
  const data = { ...record, timestamp: record.timestamp || isoNow() };
  if (isFirebaseConfigured && db) {
    await addDoc(collection(db, 'users', uid, 'airQuality'), data);
    return;
  }
  const items = devRead(uid, 'airQuality');
  items.push({ id: `aq-${Date.now()}`, ...data });
  devWrite(uid, 'airQuality', items);
}

export async function listAirQualityRecords(uid: string, max = 20): Promise<any[]> {
  if (isFirebaseConfigured && db) {
    const q = query(collection(db, 'users', uid, 'airQuality'), orderBy('timestamp', 'desc'), fsLimit(max));
    const snap = await getDocs(q);
    return snap.docs.map((d) => withId(d));
  }
  return devRead(uid, 'airQuality')
    .sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1))
    .slice(0, max);
}

// ---- Predictions ----
export async function savePredictions(uid: string, predictions: any[]): Promise<void> {
  const data = { predictions, createdAt: isoNow() };
  if (isFirebaseConfigured && db) {
    await addDoc(collection(db, 'users', uid, 'predictions'), data);
    return;
  }
  const items = devRead(uid, 'predictions');
  items.push({ id: `pred-${Date.now()}`, ...data });
  devWrite(uid, 'predictions', items);
}

export async function getLatestPredictions(uid: string): Promise<any[]> {
  if (isFirebaseConfigured && db) {
    const q = query(collection(db, 'users', uid, 'predictions'), orderBy('createdAt', 'desc'), fsLimit(1));
    const snap = await getDocs(q);
    if (snap.empty) return [];
    const docData = snap.docs[0].data();
    return Array.isArray(docData.predictions) ? docData.predictions : [];
  }
  const items = devRead(uid, 'predictions').sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  return items.length ? items[0].predictions : [];
}

// ---- Carbon trips ----
export async function addCarbonTrip(uid: string, trip: Json): Promise<string> {
  const data = { ...trip, date: trip.date || isoNow() };
  if (isFirebaseConfigured && db) {
    const ref = await addDoc(collection(db, 'users', uid, 'carbonTrips'), data);
    return ref.id;
  }
  const items = devRead(uid, 'carbonTrips');
  const id = `trip-${Date.now()}`;
  items.push({ id, ...data });
  devWrite(uid, 'carbonTrips', items);
  return id;
}

export async function listCarbonTrips(uid: string): Promise<any[]> {
  if (isFirebaseConfigured && db) {
    const q = query(collection(db, 'users', uid, 'carbonTrips'), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => withId(d));
  }
  return devRead(uid, 'carbonTrips').sort((a, b) => (a.date > b.date ? -1 : 1));
}

export async function deleteCarbonTrip(uid: string, tripId: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    await deleteDoc(doc(db, 'users', uid, 'carbonTrips', tripId));
    return;
  }
  devWrite(
    uid,
    'carbonTrips',
    devRead(uid, 'carbonTrips').filter((t) => t.id !== tripId)
  );
}

// ---- Uploads metadata ----
export async function addUpload(uid: string, meta: Json): Promise<void> {
  const data = { ...meta, uploadedAt: meta.uploadedAt || isoNow() };
  if (isFirebaseConfigured && db) {
    await setDoc(doc(db, 'users', uid, 'uploads', String(meta.fileId)), data);
    return;
  }
  const items = devRead(uid, 'uploads');
  items.push({ id: meta.fileId, ...data });
  devWrite(uid, 'uploads', items);
}

export async function listUploads(uid: string): Promise<any[]> {
  if (isFirebaseConfigured && db) {
    const q = query(collection(db, 'users', uid, 'uploads'), orderBy('uploadedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return devRead(uid, 'uploads').sort((a, b) => (a.uploadedAt > b.uploadedAt ? -1 : 1));
}

export async function deleteUpload(uid: string, fileId: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    await deleteDoc(doc(db, 'users', uid, 'uploads', fileId));
    return;
  }
  devWrite(
    uid,
    'uploads',
    devRead(uid, 'uploads').filter((f) => f.id !== fileId)
  );
}

export async function isUploadReady(uid: string, fileId: string): Promise<boolean> {
  if (isFirebaseConfigured && db) {
    const q = query(collection(db, 'users', uid, 'uploads'), where('fileId', '==', fileId), fsLimit(1));
    const snap = await getDocs(q);
    return !snap.empty;
  }
  return devRead(uid, 'uploads').some((f) => f.id === fileId);
}

// Re-export for convenience
export { collection, doc, getDoc };
