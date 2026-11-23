import React, { useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import type { KnowledgeFile } from '../../../types';
import {
  useAttachmentActions,
  useFileDeleteHandler,
  useFileInputHandler,
  useUploadCallbacks,
  useUploadFiles,
  useUploadOne,
} from './useUploadActions';

export interface UploadController {
  uploadedFiles: KnowledgeFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<KnowledgeFile[]>>;
  uploadProgress: Record<string, number>;
  pendingAttachment: KnowledgeFile | null;
  attachmentError: string;
  dragActive: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  attachInputRef: React.RefObject<HTMLInputElement | null>;
  setAttachmentError: React.Dispatch<React.SetStateAction<string>>;
  setDragActive: React.Dispatch<React.SetStateAction<boolean>>;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDeleteFile: (file: KnowledgeFile) => Promise<void>;
  attachFile: (file: KnowledgeFile) => void;
  handleDrop: (event: React.DragEvent) => Promise<void>;
  clearAttachment: () => void;
  uploadFiles: (incoming: File[]) => Promise<KnowledgeFile[]>;
}

export function useAssistantUploads(user: ReturnType<typeof useAuth>['user']): UploadController {
  const [uploadedFiles, setUploadedFiles] = useState<KnowledgeFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [pendingAttachment, setPendingAttachment] = useState<KnowledgeFile | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

  const callbacks = useUploadCallbacks(setUploadedFiles, setUploadProgress, setAttachmentError);
  const uploadOne = useUploadOne(user?.uid, callbacks);
  const uploadFiles = useUploadFiles(user, uploadOne, setAttachmentError);
  const handleFileUpload = useFileInputHandler(user, uploadFiles);
  const handleDeleteFile = useFileDeleteHandler(user, setUploadedFiles, setPendingAttachment);
  const { attachFile, handleDrop, clearAttachment } = useAttachmentActions(
    uploadFiles,
    setPendingAttachment,
    setAttachmentError,
    setDragActive,
  );

  return {
    uploadedFiles,
    setUploadedFiles,
    uploadProgress,
    pendingAttachment,
    attachmentError,
    dragActive,
    fileInputRef,
    attachInputRef,
    setAttachmentError,
    setDragActive,
    handleFileUpload,
    handleDeleteFile,
    attachFile,
    handleDrop,
    clearAttachment,
    uploadFiles,
  };
}
