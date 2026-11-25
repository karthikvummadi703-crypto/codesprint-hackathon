/** Upload-metadata persistence and readiness checks. */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

import type { Json, UploadRecord } from '../../types';
import { db, isFirebaseConfigured } from '../firebase';
import { devRead, devWrite, isoNow } from './devStore';

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
