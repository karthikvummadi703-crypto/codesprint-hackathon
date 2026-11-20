import React from 'react';
import { uploadDocumentForRag } from '../../services/backendService';
import { uploadToStorage, isStorageConfigured } from '../../services/storageService';
import { addUpload } from '../../services/dataService';
import { AppUser } from '../../services/authService';
import { KnowledgeFile } from '../../types';

export interface UploadState {
  setUploadedFiles: React.Dispatch<React.SetStateAction<KnowledgeFile[]>>;
  setUploadProgress: React.Dispatch<React.SetStateAction<{ [key: string]: number }>>;
  setAttachmentError: React.Dispatch<React.SetStateAction<string>>;
}

export async function uploadFilesForUser(
  incoming: File[],
  user: AppUser,
  { setUploadedFiles, setUploadProgress, setAttachmentError }: UploadState,
): Promise<KnowledgeFile[]> {
  setAttachmentError('');
  const uploaded: KnowledgeFile[] = [];
  for (const file of incoming) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'pdf' && extension !== 'csv' && extension !== 'txt') {
      setAttachmentError(`Unsupported file type: ${file.name}. Upload PDF, CSV, or TXT.`);
      continue;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAttachmentError(`${file.name} is larger than 10MB. Choose a smaller file.`);
      continue;
    }

    const fileId = Date.now().toString() + Math.random().toString(36).substring(2, 7);
    const newFile: KnowledgeFile = {
      id: fileId,
      name: file.name,
      type: extension as 'pdf' | 'csv' | 'txt',
      size: file.size,
      uploadedAt: new Date(),
      status: 'processing',
    };

    setUploadedFiles((prev) => [newFile, ...prev]);
    setUploadProgress((prev) => ({ ...prev, [fileId]: 5 }));

    let ragSucceeded = false;
    try {
      const storagePromise = isStorageConfigured()
        ? uploadToStorage(user.uid, file.name, file, (pct) => {
            setUploadProgress((prev) => ({ ...prev, [fileId]: Math.max(prev[fileId] || 5, pct) }));
          })
        : Promise.resolve(null);
      const ragPromise = uploadDocumentForRag(file);
      const [ragResult, storageUrl] = await Promise.all([ragPromise, storagePromise.catch(() => null)]);
      ragSucceeded = true;
      setUploadProgress((prev) => ({ ...prev, [fileId]: 100 }));
      await addUpload(user.uid, {
        fileId: fileId,
        name: file.name,
        type: extension,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        status: 'ready',
        ragFileId: ragResult?.fileId || null,
        storagePath: storageUrl ? `users/${user.uid}/uploads/${file.name}` : null,
      }).catch(() => {});
      const readyFile: KnowledgeFile = {
        ...newFile,
        status: 'ready',
        ragFileId: ragResult?.fileId,
      };
      setUploadedFiles((prev) => prev.map((f) => (f.id === fileId ? readyFile : f)));
      uploaded.push(readyFile);
    } catch (err) {
      ragSucceeded = false;
      const msg = err instanceof Error ? err.message : String(err);
      setUploadedFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: 'error' } : f)));
      setAttachmentError(`Upload failed: ${msg}. Make sure the backend is running.`);
    } finally {
      if (!ragSucceeded) {
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[fileId];
          return next;
        });
      }
    }
  }
  return uploaded;
}
