import { uploadDocumentForRag } from '../../../services/backendService';
import { addUpload } from '../../../services/dataService';
import { isStorageConfigured, uploadToStorage } from '../../../services/storageService';
import type { KnowledgeFile } from '../../../types';
import { createUploadFile, uploadStoragePath, uploadValidationError } from './uploads';

export interface UploadFlowCallbacks {
  setError: (message: string) => void;
  addFile: (file: KnowledgeFile) => void;
  setProgress: (fileId: string, pct: number) => void;
  markReady: (fileId: string, file: KnowledgeFile) => void;
  markError: (fileId: string) => void;
  clearProgress: (fileId: string) => void;
}

function beginUpload(file: File, cb: UploadFlowCallbacks) {
  const error = uploadValidationError(file);
  if (error) {
    cb.setError(error);
    return null;
  }
  const info = createUploadFile(file);
  cb.addFile(info);
  cb.setProgress(info.id, 5);
  return info;
}

async function transferUpload(uid: string, file: File, fileId: string, cb: UploadFlowCallbacks) {
  const storage = isStorageConfigured()
    ? uploadToStorage(uid, file.name, file, pct => {
        cb.setProgress(fileId, Math.max(pct, 5));
      })
    : Promise.resolve(null);
  const [rag, storageUrl] = await Promise.all([
    uploadDocumentForRag(file),
    storage.catch(() => null),
  ]);
  return { ragFileId: rag?.fileId, storageUrl };
}

async function saveUploadRecord(
  uid: string,
  file: File,
  fileId: string,
  extension: string,
  ragFileId: string | undefined,
  storageUrl: string | null,
) {
  await addUpload(uid, {
    fileId,
    name: file.name,
    type: extension,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    status: 'ready',
    ragFileId: ragFileId || null,
    storagePath: storageUrl ? uploadStoragePath(uid, file.name) : null,
  }).catch(() => {});
}

export async function runUpload(
  uid: string,
  file: File,
  cb: UploadFlowCallbacks,
): Promise<KnowledgeFile | null> {
  const info = beginUpload(file, cb);
  if (!info) return null;
  let succeeded = false;
  try {
    const transfer = await transferUpload(uid, file, info.id, cb);
    succeeded = true;
    cb.setProgress(info.id, 100);
    await saveUploadRecord(uid, file, info.id, info.type, transfer.ragFileId, transfer.storageUrl);
    const ready: KnowledgeFile = { ...info, status: 'ready', ragFileId: transfer.ragFileId };
    cb.markReady(info.id, ready);
    return ready;
  } catch (err) {
    cb.markError(info.id);
    cb.setError(
      `Upload failed: ${err instanceof Error ? err.message : String(err)}. Make sure the backend is running.`,
    );
    return null;
  } finally {
    if (!succeeded) cb.clearProgress(info.id);
  }
}
