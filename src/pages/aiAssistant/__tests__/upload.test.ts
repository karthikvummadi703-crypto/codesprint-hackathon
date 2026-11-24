import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetStateAction } from 'react';

import type { AppUser } from '../../../services/authService';
import type { Json, KnowledgeFile } from '../../../types';
import { uploadFilesForUser } from '../upload';
import type { UploadState } from '../upload';

type RagResult = {
  fileId: string;
  fileName: string;
  chunkCount: number;
  textPreview: string;
};

const mocks = vi.hoisted(() => ({
  uploadDocumentForRag: vi.fn<(file: File) => Promise<RagResult>>(),
  isStorageConfigured: vi.fn<() => boolean>(),
  uploadToStorage:
    vi.fn<
      (uid: string, fileName: string, file: File, onProgress?: (pct: number) => void) => Promise<string>
    >(),
  addUpload: vi.fn<(uid: string, meta: Json) => Promise<void>>(),
  setUploadedFiles: vi.fn<(value: KnowledgeFile[] | ((prev: KnowledgeFile[]) => KnowledgeFile[])) => void>(),
  setUploadProgress:
    vi.fn<
      (value: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void
    >(),
  setAttachmentError: vi.fn<(value: SetStateAction<string>) => void>(),
}));

vi.mock('../../../services/backendService', () => ({
  uploadDocumentForRag: mocks.uploadDocumentForRag,
}));

vi.mock('../../../services/storageService', () => ({
  isStorageConfigured: mocks.isStorageConfigured,
  uploadToStorage: mocks.uploadToStorage,
}));

vi.mock('../../../services/dataService', () => ({
  addUpload: mocks.addUpload,
}));

const user: AppUser = {
  uid: 'user-1',
  email: 'user@example.com',
  name: 'User',
  photoURL: null,
  isDev: false,
};

const FIXED_NOW = Date.parse('2026-03-10T09:30:00.000Z');

function makeState(): UploadState {
  return {
    setUploadedFiles: mocks.setUploadedFiles,
    setUploadProgress: mocks.setUploadProgress,
    setAttachmentError: mocks.setAttachmentError,
  };
}

function fileUpdateSnapshots(): KnowledgeFile[][] {
  let files: KnowledgeFile[] = [];
  const snapshots: KnowledgeFile[][] = [];
  for (const [update] of mocks.setUploadedFiles.mock.calls) {
    files = typeof update === 'function' ? update(files) : update;
    snapshots.push(files);
  }
  return snapshots;
}

function appliedProgress(): Record<string, number> {
  let progress: Record<string, number> = {};
  for (const [update] of mocks.setUploadProgress.mock.calls) {
    progress = typeof update === 'function' ? update(progress) : update;
  }
  return progress;
}

describe('uploadFilesForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(FIXED_NOW);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    mocks.isStorageConfigured.mockReturnValue(false);
    mocks.uploadDocumentForRag.mockResolvedValue({
      fileId: 'rag-1',
      fileName: 'report.pdf',
      chunkCount: 3,
      textPreview: 'preview',
    });
    mocks.uploadToStorage.mockResolvedValue('https://example.test/report.pdf');
    mocks.addUpload.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects unsupported extensions without touching storage or state', async () => {
    const result = await uploadFilesForUser([new File(['data'], 'report.docx')], user, makeState());

    expect(result).toEqual([]);
    expect(mocks.setAttachmentError).toHaveBeenCalledWith(
      'Unsupported file type: report.docx. Upload PDF, CSV, or TXT.',
    );
    expect(mocks.setUploadedFiles).not.toHaveBeenCalled();
    expect(mocks.uploadDocumentForRag).not.toHaveBeenCalled();
  });

  it('rejects files larger than 10MB', async () => {
    const huge = new File([new ArrayBuffer(10 * 1024 * 1024 + 1)], 'huge.pdf');

    const result = await uploadFilesForUser([huge], user, makeState());

    expect(result).toEqual([]);
    expect(mocks.setAttachmentError).toHaveBeenCalledWith(
      'huge.pdf is larger than 10MB. Choose a smaller file.',
    );
    expect(mocks.addUpload).not.toHaveBeenCalled();
  });

  it('uploads an indexed document, reports progress and persists ready metadata', async () => {
    mocks.isStorageConfigured.mockReturnValue(true);
    mocks.uploadToStorage.mockImplementation(async (_uid, _name, _file, onProgress) => {
      onProgress?.(40);
      onProgress?.(90);
      return 'https://example.test/report.pdf';
    });

    const result = await uploadFilesForUser([new File(['data'], 'report.pdf')], user, makeState());

    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe('ready');
    expect(result[0]?.ragFileId).toBe('rag-1');
    expect(result[0]?.id.startsWith(String(FIXED_NOW))).toBe(true);
    expect(mocks.setAttachmentError).toHaveBeenCalledWith('');
    expect(mocks.uploadToStorage).toHaveBeenCalledWith(
      'user-1',
      'report.pdf',
      expect.any(File),
      expect.any(Function),
    );
    expect(mocks.uploadDocumentForRag).toHaveBeenCalledTimes(1);
    expect(mocks.addUpload).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        fileId: result[0]?.id,
        name: 'report.pdf',
        type: 'pdf',
        size: 4,
        status: 'ready',
        ragFileId: 'rag-1',
        storagePath: 'users/user-1/uploads/report.pdf',
      }),
    );
    expect(fileUpdateSnapshots().map((files) => files[0]?.status)).toEqual(['processing', 'ready']);
    expect(appliedProgress()[result[0]!.id]).toBe(100);
  });

  it('skips storage when it is not configured and still indexes the document', async () => {
    const result = await uploadFilesForUser([new File(['a,b'], 'trips.CSV')], user, makeState());

    expect(result[0]).toMatchObject({ name: 'trips.CSV', type: 'csv', status: 'ready' });
    expect(result[0]?.ragFileId).toBe('rag-1');
    expect(mocks.uploadToStorage).not.toHaveBeenCalled();
    expect(mocks.addUpload).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ ragFileId: 'rag-1', storagePath: null, type: 'csv' }),
    );
  });

  it('ignores a storage failure when the RAG upload succeeds', async () => {
    mocks.isStorageConfigured.mockReturnValue(true);
    mocks.uploadToStorage.mockRejectedValue(new Error('storage denied'));

    const result = await uploadFilesForUser([new File(['data'], 'notes.txt')], user, makeState());

    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe('ready');
    expect(mocks.addUpload).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ ragFileId: 'rag-1', storagePath: null }),
    );
    expect(mocks.setAttachmentError).toHaveBeenCalledWith('');
  });

  it('marks the file as failed and removes its progress when RAG upload fails', async () => {
    mocks.uploadDocumentForRag.mockRejectedValue(new Error('backend down'));

    const result = await uploadFilesForUser([new File(['data'], 'report.pdf')], user, makeState());

    expect(result).toEqual([]);
    expect(fileUpdateSnapshots().slice(-1)[0]?.[0]?.status).toBe('error');
    expect(mocks.setAttachmentError).toHaveBeenCalledWith(
      'Upload failed: backend down. Make sure the backend is running.',
    );
    expect(mocks.addUpload).not.toHaveBeenCalled();
    expect(appliedProgress()).toEqual({});
  });

  it('still returns a ready file when metadata persistence fails', async () => {
    mocks.addUpload.mockRejectedValue(new Error('firestore denied'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await uploadFilesForUser([new File(['data'], 'report.pdf')], user, makeState());

    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe('ready');
    expect(fileUpdateSnapshots().slice(-1)[0]?.[0]?.status).toBe('ready');
  });

  it('processes every valid file in the batch with distinct ids', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.123456789).mockReturnValueOnce(0.987654321);
    mocks.uploadDocumentForRag.mockResolvedValueOnce({
      fileId: 'rag-1',
      fileName: 'one.pdf',
      chunkCount: 1,
      textPreview: 'one',
    });
    mocks.uploadDocumentForRag.mockResolvedValueOnce({
      fileId: 'rag-2',
      fileName: 'two.pdf',
      chunkCount: 1,
      textPreview: 'two',
    });

    const result = await uploadFilesForUser(
      [new File(['one'], 'one.pdf'), new File(['two'], 'two.pdf')],
      user,
      makeState(),
    );

    expect(result.map((file) => file.ragFileId)).toEqual(['rag-1', 'rag-2']);
    expect(result[0]?.id).not.toBe(result[1]?.id);
    expect(mocks.uploadDocumentForRag).toHaveBeenCalledTimes(2);
  });
});
