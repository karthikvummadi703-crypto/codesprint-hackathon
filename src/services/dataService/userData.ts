/** User profile and household-lifestyle persistence. */
import { doc, getDoc, setDoc } from 'firebase/firestore';

import type { Json } from '../../types';
import { db, isFirebaseConfigured } from '../firebase';
import { DEV_PREFIX, isoNow } from './devStore';

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
