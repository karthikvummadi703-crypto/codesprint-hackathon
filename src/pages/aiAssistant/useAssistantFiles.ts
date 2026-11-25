/** Upload and attachment state for the AI assistant page. */
import { useState } from 'react';
import type React from 'react';

import { deleteUpload } from '../../services/dataService';
import { deleteRagFile } from '../../services/backendService';
import { deleteFromStorage } from '../../services/storageService';
import type { AppUser } from '../../services/authService';
import type { KnowledgeFile } from '../../types';
import { uploadFilesForUser } from './upload';

interface FilesOptions {
  user: AppUser | null;
}

export function useAssistantFiles({ user }: FilesOptions) {
  const [uploadedFiles, setUploadedFiles] = useState<KnowledgeFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  // Documents chosen for the next message. Kept separate from `uploadedFiles`
  // because the choice is per-message: the file is referenced by id in the chat
  // request, not silently added to the whole knowledge base.
  const [pendingAttachment, setPendingAttachment] = useState<KnowledgeFile | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const uploadFiles = async (incoming: File[]): Promise<KnowledgeFile[]> => {
    if (!user) return [];
    return uploadFilesForUser(incoming, user, {
      setUploadedFiles,
      setUploadProgress,
      setAttachmentError,
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;
    e.target.value = '';
    await uploadFiles(Array.from(files));
  };

  const handleDeleteFile = async (file: KnowledgeFile) => {
    if (!user) return;
    setUploadedFiles((prev) => prev.filter((f) => f.id !== file.id));
    // Drop it from the composer too, otherwise the next message would
    // reference a document that no longer exists.
    setPendingAttachment((prev) => (prev?.id === file.id ? null : prev));
    if (file.ragFileId) {
      await deleteRagFile(file.ragFileId).catch(() => {});
    }
    if (file.name) {
      await deleteFromStorage(`users/${user.uid}/uploads/${file.name}`).catch(() => {});
    }
    await deleteUpload(user.uid, file.id).catch(() => {});
  };

  /** Attach an already-indexed document to the next message. */
  const attachFile = (file: KnowledgeFile) => {
    if (file.status !== 'ready') {
      setAttachmentError('That document is still being indexed.');
      return;
    }
    setPendingAttachment(file);
    setAttachmentError('');
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (dropped.length === 0) return;
    const uploaded = await uploadFiles(dropped);
    // A single dropped file is also staged for the current message, which is
    // what makes drag-and-drop usable for "what does this report say?".
    const first = uploaded.find((f) => f.status === 'ready');
    if (first) setPendingAttachment(first);
  };

  return {
    uploadedFiles,
    setUploadedFiles,
    uploadProgress,
    pendingAttachment,
    setPendingAttachment,
    attachmentError,
    setAttachmentError,
    dragActive,
    setDragActive,
    handleFileUpload,
    handleDeleteFile,
    attachFile,
    handleDrop,
  };
}
