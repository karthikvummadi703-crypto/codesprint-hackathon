/** Persistence for air-quality records, predictions, and carbon trips. */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import {
  devRead,
  devWrite,
  isoNow,
  type AirQualityRecord,
  type CarbonTripRecord,
  type Json,
  type PredictionRecord,
} from './dataServiceShared';

// ---- Air quality records ----
export async function addAirQualityRecord(uid: string, record: Json): Promise<void> {
  const data = { ...record, timestamp: record.timestamp || isoNow() };
  if (isFirebaseConfigured && db) {
    try {
      await addDoc(collection(db, 'users', uid, 'airQuality'), data);
      return;
    } catch (err) {
      console.warn('Firestore addAirQualityRecord failed, falling back to local storage:', err);
    }
  }
  const items = devRead<AirQualityRecord>(uid, 'airQuality');
  items.push({ id: `aq-${Date.now()}`, ...data } as AirQualityRecord);
  devWrite(uid, 'airQuality', items);
}

export async function listAirQualityRecords(uid: string, max = 20): Promise<AirQualityRecord[]> {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(
        collection(db, 'users', uid, 'airQuality'),
        orderBy('timestamp', 'desc'),
        fsLimit(max),
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }) as AirQualityRecord);
    } catch (err) {
      console.warn('Firestore listAirQualityRecords failed, falling back to local storage:', err);
    }
  }
  return devRead<AirQualityRecord>(uid, 'airQuality')
    .sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1))
    .slice(0, max);
}

// ---- Predictions ----
export async function savePredictions(uid: string, predictions: unknown[]): Promise<void> {
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

export async function getLatestPredictions(uid: string): Promise<unknown[]> {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(
        collection(db, 'users', uid, 'predictions'),
        orderBy('createdAt', 'desc'),
        fsLimit(1),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docData = snap.docs[0]!.data();
        return Array.isArray(docData.predictions) ? docData.predictions : [];
      }
    } catch (err) {
      console.warn('Firestore getLatestPredictions failed, falling back to local storage:', err);
    }
  }
  const items = devRead<PredictionRecord>(uid, 'predictions').sort((a, b) =>
    a.createdAt > b.createdAt ? -1 : 1,
  );
  return items.length ? items[0]!.predictions : [];
}

// ---- Carbon trips ----
export async function addCarbonTrip(uid: string, trip: Json): Promise<string> {
  const data = { ...trip, date: trip.date || isoNow() };
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

export async function listCarbonTrips(uid: string): Promise<CarbonTripRecord[]> {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'users', uid, 'carbonTrips'), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }) as CarbonTripRecord);
    } catch (err) {
      console.warn('Firestore listCarbonTrips failed, falling back to local storage:', err);
    }
  }
  return devRead<CarbonTripRecord>(uid, 'carbonTrips').sort((a, b) => (a.date > b.date ? -1 : 1));
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
    devRead<CarbonTripRecord>(uid, 'carbonTrips').filter(t => t.id !== tripId),
  );
}
