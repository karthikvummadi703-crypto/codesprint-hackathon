/** Carbon-trip persistence. */
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

import type { CarbonTripRecord, Json } from '../../types';
import { db, isFirebaseConfigured } from '../firebase';
import { devRead, devWrite, isoNow } from './devStore';

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
