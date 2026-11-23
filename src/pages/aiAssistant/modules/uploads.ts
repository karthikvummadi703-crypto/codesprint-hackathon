import type { KnowledgeFile } from '../../../types';
import type { UploadRecord } from '../../../services/dataServiceShared';

export function toKnowledgeFile(raw: UploadRecord): KnowledgeFile {
  return {
    id: raw.fileId || raw.id || '',
    name: raw.name,
    type: raw.type,
    size: Number(raw.size || 0),
    uploadedAt: new Date(raw.uploadedAt),
    status: raw.status || 'ready',
    ragFileId: raw.ragFileId || undefined,
  };
}

export function uploadValidationError(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== 'pdf' && extension !== 'csv' && extension !== 'txt') {
    return `Unsupported file type: ${file.name}. Upload PDF, CSV, or TXT.`;
  }
  if (file.size > 10 * 1024 * 1024) {
    return `${file.name} is larger than 10MB. Choose a smaller file.`;
  }
  return null;
}

export function createUploadFile(file: File): KnowledgeFile {
  const extension = file.name.split('.').pop()?.toLowerCase() as 'pdf' | 'csv' | 'txt';
  const fileId = Date.now().toString() + Math.random().toString(36).substring(2, 7);
  return {
    id: fileId,
    name: file.name,
    type: extension,
    size: file.size,
    uploadedAt: new Date(),
    status: 'processing',
  };
}

export function uploadStoragePath(uid: string, fileName: string): string {
  return `users/${uid}/uploads/${fileName}`;
}
