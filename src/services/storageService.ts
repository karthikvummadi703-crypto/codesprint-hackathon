import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, isFirebaseConfigured } from './firebase';

export function isStorageConfigured(): boolean {
  return isFirebaseConfigured && storage !== null;
}

export function uploadToStorage(
  uid: string,
  fileName: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  if (!isFirebaseConfigured || !storage) {
    throw new Error('Firebase Storage is not configured.');
  }
  const path = `users/${uid}/uploads/${fileName}`;
  const fileRef = ref(storage, path);
  const uploadTask = uploadBytesResumable(fileRef, file);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        onProgress?.(pct);
      },
      (err) => reject(err),
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(url);
      }
    );
  });
}

export async function deleteFromStorage(path: string): Promise<void> {
  if (!isFirebaseConfigured || !storage) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // ignore missing object
  }
}