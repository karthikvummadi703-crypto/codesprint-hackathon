import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteFromStorage,
  isStorageConfigured,
  uploadToStorage,
} from '../storageService';

const mocks = vi.hoisted(() => ({
  configured: { value: true },
  storage: { name: 'fake-storage' },
  ref: vi.fn((_storage: unknown, path: string) => ({ path })),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
  uploadTask: {
    on: vi.fn(),
    snapshot: { ref: { path: 'uploaded-ref' } },
  },
}));

vi.mock('../firebase', () => ({
  get isFirebaseConfigured() {
    return mocks.configured.value;
  },
  get storage() {
    return mocks.configured.value ? mocks.storage : null;
  },
}));

vi.mock('firebase/storage', () => ({
  ref: mocks.ref,
  uploadBytesResumable: mocks.uploadBytesResumable,
  getDownloadURL: mocks.getDownloadURL,
  deleteObject: mocks.deleteObject,
}));

type ProgressHandler = (snapshot: { bytesTransferred: number; totalBytes: number }) => void;
type ErrorHandler = (error: Error) => void;

function registeredHandlers(): {
  progress: ProgressHandler;
  error: ErrorHandler;
  complete: () => void;
} {
  const call = mocks.uploadTask.on.mock.calls[0];
  return {
    progress: call[1] as ProgressHandler,
    error: call[2] as ErrorHandler,
    complete: call[3] as () => void,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured.value = true;
  mocks.uploadBytesResumable.mockReturnValue(mocks.uploadTask);
  mocks.getDownloadURL.mockResolvedValue('https://storage.example.test/file.png');
  mocks.deleteObject.mockResolvedValue(undefined);
});

describe('isStorageConfigured', () => {
  it('reflects both the Firebase flag and the storage instance', () => {
    expect(isStorageConfigured()).toBe(true);

    mocks.configured.value = false;
    expect(isStorageConfigured()).toBe(false);
  });
});

describe('uploadToStorage', () => {
  it('throws immediately when storage is not configured', () => {
    mocks.configured.value = false;
    const file = new File(['x'], 'avatar.png', { type: 'image/png' });

    expect(() => uploadToStorage('u1', 'avatar.png', file)).toThrow(
      'Firebase Storage is not configured.'
    );
    expect(mocks.ref).not.toHaveBeenCalled();
    expect(mocks.uploadBytesResumable).not.toHaveBeenCalled();
  });

  it('uploads under the user folder and resolves the download URL', async () => {
    const file = new File(['x'], 'avatar.png', { type: 'image/png' });
    const onProgress = vi.fn();
    const upload = uploadToStorage('u1', 'avatar.png', file, onProgress);

    expect(mocks.ref).toHaveBeenCalledWith(mocks.storage, 'users/u1/uploads/avatar.png');
    expect(mocks.uploadBytesResumable).toHaveBeenCalledWith(
      { path: 'users/u1/uploads/avatar.png' },
      file
    );
    expect(mocks.uploadTask.on.mock.calls[0][0]).toBe('state_changed');

    const { progress, complete } = registeredHandlers();
    progress({ bytesTransferred: 1, totalBytes: 3 });
    progress({ bytesTransferred: 2, totalBytes: 3 });
    progress({ bytesTransferred: 3, totalBytes: 3 });
    expect(onProgress.mock.calls.map((call) => call[0])).toEqual([33, 67, 100]);

    complete();
    await expect(upload).resolves.toBe('https://storage.example.test/file.png');
    expect(mocks.getDownloadURL).toHaveBeenCalledWith(mocks.uploadTask.snapshot.ref);
  });

  it('works without a progress callback', async () => {
    const upload = uploadToStorage('u1', 'note.txt', new File(['x'], 'note.txt'));

    registeredHandlers().progress({ bytesTransferred: 0, totalBytes: 1 });
    registeredHandlers().complete();

    await expect(upload).resolves.toBe('https://storage.example.test/file.png');
  });

  it('rejects with the storage error reported by the upload task', async () => {
    const failure = new Error('Permission denied');
    const upload = uploadToStorage('u1', 'avatar.png', new File(['x'], 'avatar.png'));

    registeredHandlers().error(failure);

    await expect(upload).rejects.toBe(failure);
    expect(mocks.getDownloadURL).not.toHaveBeenCalled();
  });
});

describe('deleteFromStorage', () => {
  it('deletes the object at the supplied path', async () => {
    await deleteFromStorage('users/u1/uploads/old.pdf');

    expect(mocks.ref).toHaveBeenCalledWith(mocks.storage, 'users/u1/uploads/old.pdf');
    expect(mocks.deleteObject).toHaveBeenCalledWith({ path: 'users/u1/uploads/old.pdf' });
  });

  it('ignores a missing object', async () => {
    mocks.deleteObject.mockRejectedValue(new Error('not found'));

    await expect(deleteFromStorage('users/u1/uploads/missing.pdf')).resolves.toBeUndefined();
  });

  it('does nothing when storage is not configured', async () => {
    mocks.configured.value = false;

    await deleteFromStorage('users/u1/uploads/old.pdf');

    expect(mocks.ref).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});
