/** Air-quality history and prediction persistence. */
import { addDoc, collection, getDocs, limit as fsLimit, orderBy, query } from 'firebase/firestore';

import type { AirQualityRecord, Json } from '../../types';
import { db, isFirebaseConfigured } from '../firebase';
import { devRead, devWrite, isoNow } from './devStore';
import type { P } from './devStore';

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
  const items = devRead<P>(uid, 'predictions');
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
