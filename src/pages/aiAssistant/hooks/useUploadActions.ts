import React, { useCallback, useMemo } from 'react';
import { deleteRagFile } from '../../../services/backendService';
import { deleteUpload } from '../../../services/dataService';
import { deleteFromStorage } from '../../../services/storageService';
import type { KnowledgeFile } from '../../../types';
import { runUpload, UploadFlowCallbacks } from '../modules/uploadFlow';
import { uploadStoragePath } from '../modules/uploads';

type FileListSetter = React.Dispatch<React.SetStateAction<KnowledgeFile[]>>;

export function useUploadCallbacks(
  setUploadedFiles: FileListSetter,
  setUploadProgress: React.Dispatch<React.SetStateAction<Record<string, number>>>,
  setAttachmentError: React.Dispatch<React.SetStateAction<string>>,
): UploadFlowCallbacks {
  return useMemo(
    () => ({
      setError: setAttachmentError,
      addFile: file => setUploadedFiles(prev => [file, ...prev]),
      setProgress: (fileId, pct) =>
        setUploadProgress(prev => ({ ...prev, [fileId]: Math.max(prev[fileId] || 5, pct) })),
      markReady: (fileId, ready) =>
        setUploadedFiles(prev => prev.map(f => (f.id === fileId ? ready : f))),
      markError: fileId =>
        setUploadedFiles(prev => prev.map(f => (f.id === fileId ? { ...f, status: 'error' } : f))),
      clearProgress: fileId =>
        setUploadProgress(prev => {
          const next = { ...prev };
          delete next[fileId];
          return next;
        }),
    }),
    [setUploadedFiles, setUploadProgress, setAttachmentError],
  );
}

export function useUploadOne(userUid: string | undefined, callbacks: UploadFlowCallbacks) {
  return useCallback(
    (file: File) => (userUid ? runUpload(userUid, file, callbacks) : Promise.resolve(null)),
    [userUid, callbacks],
  );
}

export function useUploadFiles(
  user: { uid: string } | null,
  uploadOne: (file: File) => Promise<KnowledgeFile | null>,
  setAttachmentError: React.Dispatch<React.SetStateAction<string>>,
) {
  return useCallback(
    async (incoming: File[]): Promise<KnowledgeFile[]> => {
      if (!user) return [];
      setAttachmentError('');
      const uploaded: KnowledgeFile[] = [];
      for (const file of incoming) {
        const result = await uploadOne(file);
        if (result) uploaded.push(result);
      }
      return uploaded;
    },
    [user, uploadOne, setAttachmentError],
  );
}

export function useFileInputHandler(
  user: { uid: string } | null,
  uploadFiles: (files: File[]) => Promise<KnowledgeFile[]>,
) {
  return useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || !user) return;
      e.target.value = '';
      await uploadFiles(Array.from(files));
    },
    [user, uploadFiles],
  );
}

export function useFileDeleteHandler(
  user: { uid: string } | null,
  setUploadedFiles: FileListSetter,
  setPendingAttachment: React.Dispatch<React.SetStateAction<KnowledgeFile | null>>,
) {
  return useCallback(
    async (file: KnowledgeFile) => {
      if (!user) return;
      setUploadedFiles(prev => prev.filter(f => f.id !== file.id));
      setPendingAttachment(prev => (prev?.id === file.id ? null : prev));
      if (file.ragFileId) await deleteRagFile(file.ragFileId).catch(() => {});
      if (file.name)
        await deleteFromStorage(uploadStoragePath(user.uid, file.name)).catch(() => {});
      await deleteUpload(user.uid, file.id).catch(() => {});
    },
    [user, setUploadedFiles, setPendingAttachment],
  );
}

export function useAttachmentActions(
  uploadFiles: (files: File[]) => Promise<KnowledgeFile[]>,
  setPendingAttachment: React.Dispatch<React.SetStateAction<KnowledgeFile | null>>,
  setAttachmentError: React.Dispatch<React.SetStateAction<string>>,
  setDragActive: React.Dispatch<React.SetStateAction<boolean>>,
) {
  const attachFile = useCallback(
    (file: KnowledgeFile) => {
      if (file.status !== 'ready') {
        setAttachmentError('That document is still being indexed.');
        return;
      }
      setPendingAttachment(file);
      setAttachmentError('');
    },
    [setPendingAttachment, setAttachmentError],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const uploaded = await uploadFiles(Array.from(e.dataTransfer?.files ?? []));
      const first = uploaded.find(f => f.status === 'ready');
      if (first) setPendingAttachment(first);
    },
    [uploadFiles, setPendingAttachment, setDragActive],
  );

  const clearAttachment = useCallback(() => {
    setPendingAttachment(null);
    setAttachmentError('');
  }, [setPendingAttachment, setAttachmentError]);

  return { attachFile, handleDrop, clearAttachment };
}
