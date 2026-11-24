import { beforeEach, describe, expect, it, vi } from 'vitest';

type UploadObserver = (
  event: string,
  next: (snapshot: { bytesTransferred: number; totalBytes: number }) => void,
  error: (err: Error) => void,
  complete: () => Promise<void>,
) => void;
type UploadTask = {
  on: ReturnType<typeof vi.fn<UploadObserver>>;
  snapshot: { ref: string };
};

const firebaseState = vi.hoisted(() => ({
  configured: true,
  storage: { name: 'mock-storage' } as { name: string } | null,
}));

const storageMocks = vi.hoisted(() => ({
  ref: vi.fn<(storage: unknown, path: string) => { path: string }>(),
  uploadBytesResumable: vi.fn<(fileRef: unknown, file: File) => UploadTask>(),
  getDownloadURL: vi.fn<(fileRef: unknown) => Promise<string>>(),
  deleteObject: vi.fn<(fileRef: unknown) => Promise<void>>(),
}));

vi.mock('firebase/storage', () => storageMocks);
vi.mock('../firebase', () => ({
  get isFirebaseConfigured() {
    return firebaseState.configured;
  },
  get storage() {
    return firebaseState.storage;
  },
}));

import { deleteFromStorage, isStorageConfigured, uploadToStorage } from '../storageService';

function createTask(): UploadTask {
  return { on: vi.fn<UploadObserver>(), snapshot: { ref: 'uploads/file-ref' } };
}

describe('storageService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    firebaseState.configured = true;
    firebaseState.storage = { name: 'mock-storage' };
    storageMocks.ref.mockImplementation((_storage, path) => ({ path }));
    storageMocks.getDownloadURL.mockResolvedValue('https://storage.test/download');
    storageMocks.deleteObject.mockResolvedValue(undefined);
  });

  it('reports storage availability from both configuration flags', () => {
    expect(isStorageConfigured()).toBe(true);

    firebaseState.configured = false;
    expect(isStorageConfigured()).toBe(false);

    firebaseState.configured = true;
    firebaseState.storage = null;
    expect(isStorageConfigured()).toBe(false);
  });

  it('throws synchronously when storage is not available', () => {
    const file = new File(['x'], 'file.png', { type: 'image/png' });
    firebaseState.configured = false;

    expect(() => uploadToStorage('u1', 'file.png', file)).toThrow('Firebase Storage is not configured.');

    firebaseState.configured = true;
    firebaseState.storage = null;
    expect(() => uploadToStorage('u1', 'file.png', file)).toThrow('Firebase Storage is not configured.');
    expect(storageMocks.ref).not.toHaveBeenCalled();
  });

  it('reports rounded progress and resolves with the download URL', async () => {
    const task = createTask();
    storageMocks.uploadBytesResumable.mockReturnValue(task);
    const file = new File(['x'], 'file.png', { type: 'image/png' });
    const onProgress = vi.fn<(pct: number) => void>();

    const uploaded = uploadToStorage('u1', 'file.png', file, onProgress);

    expect(storageMocks.ref).toHaveBeenCalledWith(firebaseState.storage, 'users/u1/uploads/file.png');
    expect(storageMocks.uploadBytesResumable).toHaveBeenCalledWith(
      { path: 'users/u1/uploads/file.png' },
      file,
    );
    expect(task.on).toHaveBeenCalledWith(
      'state_changed',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );

    const [, progress, , complete] = task.on.mock.calls[0]!;
    progress({ bytesTransferred: 1, totalBytes: 3 });
    progress({ bytesTransferred: 3, totalBytes: 3 });
    expect(onProgress.mock.calls.map((call) => call[0])).toEqual([33, 100]);

    await complete();
    await expect(uploaded).resolves.toBe('https://storage.test/download');
    expect(storageMocks.getDownloadURL).toHaveBeenCalledWith('uploads/file-ref');
  });

  it('works without a progress callback', async () => {
    const task = createTask();
    storageMocks.uploadBytesResumable.mockReturnValue(task);
    const uploaded = uploadToStorage('u1', 'avatar.jpg', new File(['x'], 'avatar.jpg'));

    const [, progress, , complete] = task.on.mock.calls[0]!;
    progress({ bytesTransferred: 50, totalBytes: 100 });
    await complete();

    await expect(uploaded).resolves.toBe('https://storage.test/download');
  });

  it('rejects when the upload task reports an error', async () => {
    const task = createTask();
    storageMocks.uploadBytesResumable.mockReturnValue(task);
    const uploaded = uploadToStorage('u1', 'bad.png', new File(['x'], 'bad.png'));

    const [, , fail] = task.on.mock.calls[0]!;
    fail(new Error('quota exceeded'));

    await expect(uploaded).rejects.toThrow('quota exceeded');
    expect(storageMocks.getDownloadURL).not.toHaveBeenCalled();
  });

  it('rejects when the download URL cannot be read', async () => {
    const task = createTask();
    storageMocks.uploadBytesResumable.mockReturnValue(task);
    storageMocks.getDownloadURL.mockRejectedValue(new Error('download failed'));
    const uploaded = uploadToStorage('u1', 'bad.png', new File(['x'], 'bad.png'));

    const [, , , complete] = task.on.mock.calls[0]!;
    const completion = complete();
    const completionRejection = expect(completion).rejects.toThrow('download failed');

    const outcome = await Promise.race([
      uploaded.then(
        () => 'resolved' as const,
        () => 'rejected' as const,
      ),
      Promise.resolve<'pending'>('pending'),
    ]);
    expect(outcome).toBe('pending');
    await completionRejection;
  });

  it('deletes an object at the supplied path', async () => {
    await deleteFromStorage('users/u1/uploads/old.png');

    expect(storageMocks.ref).toHaveBeenCalledWith(firebaseState.storage, 'users/u1/uploads/old.png');
    expect(storageMocks.deleteObject).toHaveBeenCalledWith({ path: 'users/u1/uploads/old.png' });
  });

  it('does nothing when storage is unavailable', async () => {
    firebaseState.storage = null;
    await deleteFromStorage('users/u1/uploads/old.png');

    firebaseState.configured = false;
    firebaseState.storage = { name: 'mock-storage' };
    await deleteFromStorage('users/u1/uploads/old.png');

    expect(storageMocks.ref).not.toHaveBeenCalled();
    expect(storageMocks.deleteObject).not.toHaveBeenCalled();
  });

  it('swallows deletion failures for missing objects', async () => {
    storageMocks.deleteObject.mockRejectedValue(new Error('not found'));

    await expect(deleteFromStorage('users/u1/uploads/gone.png')).resolves.toBeUndefined();
    expect(storageMocks.deleteObject).toHaveBeenCalledOnce();
  });
});
