import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addAirQualityRecord,
  addCarbonTrip,
  addMessage,
  addUpload,
  collection as exportedCollection,
  createConversation,
  deleteCarbonTrip,
  deleteConversation,
  deleteUpload,
  doc as exportedDoc,
  getDoc as exportedGetDoc,
  getLatestPredictions,
  getLifestyleSettings,
  getUser,
  isUploadReady,
  listAirQualityRecords,
  listCarbonTrips,
  listConversations,
  listMessages,
  listUploads,
  saveLifestyleSettings,
  savePredictions,
  saveUser,
  updateConversation,
  updateUser,
} from '../dataService';

const mocks = vi.hoisted(() => ({
  configured: { value: false },
  db: { name: 'fake-firestore' },
  collection: vi.fn((...args: unknown[]) => ({ type: 'collection', args })),
  doc: vi.fn((...args: unknown[]) => ({ type: 'doc', args })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn((...args: unknown[]) => ({ type: 'query', args })),
  orderBy: vi.fn((field: string, direction: string) => ({ type: 'orderBy', field, direction })),
  limit: vi.fn((count: number) => ({ type: 'limit', count })),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  where: vi.fn((field: string, operator: string, value: unknown) => ({
    type: 'where',
    field,
    operator,
    value,
  })),
}));

vi.mock('../firebase', () => ({
  get isFirebaseConfigured() {
    return mocks.configured.value;
  },
  db: mocks.db,
}));

vi.mock('firebase/firestore', () => ({
  collection: mocks.collection,
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  getDocs: mocks.getDocs,
  query: mocks.query,
  orderBy: mocks.orderBy,
  limit: mocks.limit,
  addDoc: mocks.addDoc,
  deleteDoc: mocks.deleteDoc,
  where: mocks.where,
}));

const PREFIX = 'airguard_dev_data_';
const NOW = new Date('2026-02-01T12:00:00.000Z');
const TS = NOW.toISOString();

function stored(kind: string, uid = 'u1'): unknown {
  const raw = localStorage.getItem(`${PREFIX}${uid}_${kind}`);
  return raw ? JSON.parse(raw) : null;
}

function seed(kind: string, value: unknown, uid = 'u1'): void {
  localStorage.setItem(`${PREFIX}${uid}_${kind}`, JSON.stringify(value));
}

function snapshot(
  docs: { id: string; data: Record<string, unknown> }[],
  empty = docs.length === 0,
): unknown {
  return { docs: docs.map(entry => ({ id: entry.id, data: () => entry.data })), empty };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
  mocks.configured.value = false;
  mocks.getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.updateDoc.mockResolvedValue(undefined);
  mocks.getDocs.mockResolvedValue(snapshot([]));
  mocks.addDoc.mockResolvedValue({ id: 'fb-generated-id' });
  mocks.deleteDoc.mockResolvedValue(undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('local fallback storage', () => {
  it('returns null for a missing or corrupt local profile', async () => {
    await expect(getUser('u1')).resolves.toBeNull();
    localStorage.setItem(`${PREFIX}u1_profile`, '{not json');

    await expect(getUser('u1')).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledWith('Corrupt local profile ignored:', expect.anything());
  });

  it('merges a saved profile with previous values and a deterministic timestamp', async () => {
    seed('profile', { name: 'Old', city: 'Delhi' });

    await saveUser('u1', { name: 'New' });

    expect(stored('profile')).toEqual({ name: 'New', city: 'Delhi', updatedAt: TS });
    await updateUser('u1', { email: 'new@example.com' });
    expect(stored('profile')).toEqual({
      name: 'New',
      city: 'Delhi',
      email: 'new@example.com',
      updatedAt: TS,
    });
  });

  it('creates, updates, lists and deletes conversations in descending order', async () => {
    seed('conversations', [
      { id: 'old', title: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'new', title: 'New', updatedAt: '2026-01-20T00:00:00.000Z' },
    ]);

    await expect(listConversations('u1')).resolves.toEqual([
      { id: 'new', title: 'New', updatedAt: '2026-01-20T00:00:00.000Z' },
      { id: 'old', title: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const id = await createConversation('u1', 'Trip plan');
    expect(id).toBe(`conv-${Date.parse(NOW.toISOString())}`);
    expect(stored('conversations')).toEqual([
      { id: 'old', title: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'new', title: 'New', updatedAt: '2026-01-20T00:00:00.000Z' },
      { id, title: 'Trip plan', updatedAt: TS, createdAt: TS },
    ]);

    await updateConversation('u1', 'old', 'Renamed', '2026-01-25T00:00:00.000Z');
    expect((stored('conversations') as { title: string; updatedAt: string }[])[0]).toEqual({
      id: 'old',
      title: 'Renamed',
      updatedAt: '2026-01-25T00:00:00.000Z',
    });

    localStorage.setItem(`${PREFIX}u1_messages_old`, '[]');
    await deleteConversation('u1', 'old');
    expect((stored('conversations') as { id: string }[]).some(c => c.id === 'old')).toBe(false);
    expect(localStorage.getItem(`${PREFIX}u1_messages_old`)).toBeNull();
  });

  it('appends messages with a timestamp and stable ids', async () => {
    await addMessage('u1', 'c1', { role: 'user', content: 'Hello' });
    await addMessage('u1', 'c1', { role: 'assistant', content: 'Hi' });

    expect(stored('messages_c1')).toEqual([
      { id: `msg-${Date.parse(NOW.toISOString())}`, role: 'user', content: 'Hello', timestamp: TS },
      {
        id: `msg-${Date.parse(NOW.toISOString())}`,
        role: 'assistant',
        content: 'Hi',
        timestamp: TS,
      },
    ]);
    await expect(listMessages('u1', 'c1')).resolves.toEqual(stored('messages_c1'));
  });

  it('limits air-quality history to the newest records', async () => {
    await addAirQualityRecord('u1', { aqi: 10, timestamp: '2026-01-01T00:00:00.000Z' });
    await addAirQualityRecord('u1', { aqi: 20 });

    const all = stored('airQuality') as { id: string; aqi: number; timestamp: string }[];
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ aqi: 10, timestamp: '2026-01-01T00:00:00.000Z' });
    expect(all[1]).toMatchObject({ aqi: 20, timestamp: TS });
    await expect(listAirQualityRecords('u1', 1)).resolves.toEqual([all[1]]);
  });

  it('returns the newest prediction batch', async () => {
    seed('predictions', [
      { id: 'p-old', predictions: ['old'], createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'p-new', predictions: ['new'], createdAt: '2026-01-20T00:00:00.000Z' },
    ]);

    await expect(getLatestPredictions('u1')).resolves.toEqual(['new']);
    await savePredictions('u1', ['fresh']);
    expect(stored('predictions')).toEqual([
      { id: 'p-old', predictions: ['old'], createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'p-new', predictions: ['new'], createdAt: '2026-01-20T00:00:00.000Z' },
      { id: `pred-${Date.parse(NOW.toISOString())}`, predictions: ['fresh'], createdAt: TS },
    ]);
    await expect(getLatestPredictions('u1')).resolves.toEqual(['fresh']);
  });

  it('adds, lists and deletes carbon trips', async () => {
    const id = await addCarbonTrip('u1', { mode: 'Bike' });

    expect(id).toBe(`trip-${Date.parse(NOW.toISOString())}`);
    expect(stored('carbonTrips')).toEqual([{ id, mode: 'Bike', date: TS }]);
    expect(await listCarbonTrips('u1')).toEqual([{ id, mode: 'Bike', date: TS }]);

    await deleteCarbonTrip('u1', id);
    expect(stored('carbonTrips')).toEqual([]);
  });

  it('tracks upload readiness by file id', async () => {
    await expect(isUploadReady('u1', 'file-1')).resolves.toBe(false);

    await addUpload('u1', { fileId: 'file-1', name: 'report.pdf', uploadedAt: TS });
    await addUpload('u1', {
      fileId: 'file-2',
      name: 'older.pdf',
      uploadedAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(isUploadReady('u1', 'file-1')).resolves.toBe(true);
    await expect(isUploadReady('u1', 'missing')).resolves.toBe(false);
    expect((await listUploads('u1')).map(item => item.id!)).toEqual(['file-1', 'file-2']);

    await deleteUpload('u1', 'file-1');
    await expect(isUploadReady('u1', 'file-1')).resolves.toBe(false);
  });

  it('merges and reads lifestyle settings, ignoring corrupt data', async () => {
    seed('lifestyle', { household: { members: [] } });

    await saveLifestyleSettings('u1', { communityWatch: [{ id: 'place-1' }] });

    expect(stored('lifestyle')).toEqual({
      household: { members: [] },
      communityWatch: [{ id: 'place-1' }],
      updatedAt: TS,
    });
    await expect(getLifestyleSettings('u1')).resolves.toEqual({
      household: { members: [] },
      communityWatch: [{ id: 'place-1' }],
      updatedAt: TS,
    });

    localStorage.setItem(`${PREFIX}u1_lifestyle`, '{bad');
    await expect(getLifestyleSettings('u1')).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      'Corrupt local lifestyle settings ignored:',
      expect.anything(),
    );
  });

  it('re-exports the firestore primitives used by callers', () => {
    expect(exportedCollection).toBe(mocks.collection);
    expect(exportedDoc).toBe(mocks.doc);
    expect(exportedGetDoc).toBe(mocks.getDoc);
  });
});

describe('Firestore success paths', () => {
  beforeEach(() => {
    mocks.configured.value = true;
  });

  it('reads an existing profile document and merges writes with updatedAt', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ name: 'Asha' }) });

    await expect(getUser('u1')).resolves.toEqual({ name: 'Asha' });
    expect(mocks.doc).toHaveBeenCalledWith(mocks.db, 'users', 'u1');

    await saveUser('u1', { city: 'Delhi' });
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { type: 'doc', args: [mocks.db, 'users', 'u1'] },
      { city: 'Delhi', updatedAt: TS },
      { merge: true },
    );
  });

  it('maps conversation documents and composes the ordered query', async () => {
    mocks.getDocs.mockResolvedValue(
      snapshot([
        { id: 'c1', data: { title: 'One', updatedAt: TS } },
        { id: 'c2', data: { title: 'Two', updatedAt: TS } },
      ]),
    );

    await expect(listConversations('u1')).resolves.toEqual([
      { id: 'c1', title: 'One', updatedAt: TS },
      { id: 'c2', title: 'Two', updatedAt: TS },
    ]);
    expect(mocks.collection).toHaveBeenCalledWith(mocks.db, 'users', 'u1', 'conversations');
    expect(mocks.orderBy).toHaveBeenCalledWith('updatedAt', 'desc');
    expect(mocks.query).toHaveBeenCalledWith(
      { type: 'collection', args: [mocks.db, 'users', 'u1', 'conversations'] },
      { type: 'orderBy', field: 'updatedAt', direction: 'desc' },
    );
  });

  it('uses Firestore ids and document paths for conversation writes', async () => {
    const id = await createConversation('u1', 'Title');

    expect(id).toBe('fb-generated-id');
    expect(mocks.addDoc).toHaveBeenCalledWith(
      { type: 'collection', args: [mocks.db, 'users', 'u1', 'conversations'] },
      { title: 'Title', updatedAt: TS, createdAt: TS },
    );

    await updateConversation('u1', 'c1', 'Renamed');
    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { type: 'doc', args: [mocks.db, 'users', 'u1', 'conversations', 'c1'] },
      { title: 'Renamed', updatedAt: TS },
    );

    await deleteConversation('u1', 'c1');
    expect(mocks.deleteDoc).toHaveBeenCalledWith({
      type: 'doc',
      args: [mocks.db, 'users', 'u1', 'conversations', 'c1'],
    });
    expect(localStorage.getItem(`${PREFIX}u1_conversations`)).toBeNull();
  });

  it('maps messages and appends them to the nested messages collection', async () => {
    mocks.getDocs.mockResolvedValue(
      snapshot([{ id: 'm1', data: { role: 'user', content: 'Hi' } }]),
    );

    await expect(listMessages('u1', 'c1')).resolves.toEqual([
      { id: 'm1', role: 'user', content: 'Hi' },
    ]);
    expect(mocks.orderBy).toHaveBeenCalledWith('timestamp', 'asc');

    await addMessage('u1', 'c1', { role: 'user', content: 'Hello' });
    expect(mocks.addDoc).toHaveBeenCalledWith(
      { type: 'collection', args: [mocks.db, 'users', 'u1', 'conversations', 'c1', 'messages'] },
      { role: 'user', content: 'Hello', timestamp: TS },
    );
  });

  it('bounds air-quality queries and returns the mapped records', async () => {
    mocks.getDocs.mockResolvedValue(snapshot([{ id: 'aq-1', data: { aqi: 60 } }]));

    await expect(listAirQualityRecords('u1', 5)).resolves.toEqual([{ id: 'aq-1', aqi: 60 }]);
    expect(mocks.orderBy).toHaveBeenCalledWith('timestamp', 'desc');
    expect(mocks.limit).toHaveBeenCalledWith(5);

    await addAirQualityRecord('u1', { aqi: 61 });
    expect(mocks.addDoc).toHaveBeenCalledWith(
      { type: 'collection', args: [mocks.db, 'users', 'u1', 'airQuality'] },
      { aqi: 61, timestamp: TS },
    );
  });

  it('reads a Firestore prediction batch and falls back only when it is empty', async () => {
    mocks.getDocs.mockResolvedValueOnce(
      snapshot([{ id: 'p1', data: { predictions: ['cloud'], createdAt: TS } }]),
    );

    await expect(getLatestPredictions('u1')).resolves.toEqual(['cloud']);
    expect(mocks.limit).toHaveBeenCalledWith(1);

    seed('predictions', [{ id: 'local', predictions: ['local'], createdAt: TS }]);
    await expect(getLatestPredictions('u1')).resolves.toEqual(['local']);
  });

  it('writes carbon trips and uploads at their user-owned paths', async () => {
    await expect(addCarbonTrip('u1', { mode: 'Train' })).resolves.toBe('fb-generated-id');
    expect(mocks.collection).toHaveBeenCalledWith(mocks.db, 'users', 'u1', 'carbonTrips');

    await listCarbonTrips('u1');
    expect(mocks.orderBy).toHaveBeenCalledWith('date', 'desc');

    await deleteCarbonTrip('u1', 'trip-1');
    expect(mocks.deleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ args: [mocks.db, 'users', 'u1', 'carbonTrips', 'trip-1'] }),
    );

    await addUpload('u1', { fileId: 'file-1' });
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { type: 'doc', args: [mocks.db, 'users', 'u1', 'uploads', 'file-1'] },
      { fileId: 'file-1', uploadedAt: TS },
    );

    await listUploads('u1');
    expect(mocks.orderBy).toHaveBeenCalledWith('uploadedAt', 'desc');

    await deleteUpload('u1', 'file-1');
    expect(mocks.deleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ args: [mocks.db, 'users', 'u1', 'uploads', 'file-1'] }),
    );

    mocks.getDocs.mockResolvedValue(snapshot([], false));
    await expect(isUploadReady('u1', 'file-1')).resolves.toBe(true);
    expect(mocks.where).toHaveBeenCalledWith('fileId', '==', 'file-1');
  });

  it('reads and saves only the lifestyle fields from the profile document', async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ household: { members: [] }, communityWatch: ['place-1'], name: 'Ignored' }),
    });

    await expect(getLifestyleSettings('u1')).resolves.toEqual({
      household: { members: [] },
      communityWatch: ['place-1'],
    });

    await saveLifestyleSettings('u1', { household: { members: ['member-1'] } });
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { type: 'doc', args: [mocks.db, 'users', 'u1'] },
      { household: { members: ['member-1'] }, updatedAt: TS },
      { merge: true },
    );
  });
});

describe('Firestore failure fallbacks', () => {
  beforeEach(() => {
    mocks.configured.value = true;
  });

  it('falls back to local storage when a profile read or write fails', async () => {
    mocks.getDoc.mockRejectedValue(new Error('offline'));
    mocks.setDoc.mockRejectedValue(new Error('offline'));

    await expect(getUser('u1')).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      'Firestore getUser failed, falling back to local storage:',
      expect.anything(),
    );

    await saveUser('u1', { name: 'Local' });
    expect(stored('profile')).toEqual({ name: 'Local', updatedAt: TS });
  });

  it('recovers conversations locally from every failing Firestore operation', async () => {
    mocks.getDocs.mockRejectedValue(new Error('rules'));
    mocks.addDoc.mockRejectedValue(new Error('rules'));
    mocks.updateDoc.mockRejectedValue(new Error('rules'));
    mocks.deleteDoc.mockRejectedValue(new Error('rules'));
    seed('conversations', [{ id: 'c1', title: 'Old', updatedAt: TS }]);

    expect((await listConversations('u1'))[0]).toMatchObject({ id: 'c1', title: 'Old' });
    expect(await createConversation('u1', 'New')).toBe(`conv-${Date.parse(NOW.toISOString())}`);
    await updateConversation('u1', 'c1', 'Renamed');
    await deleteConversation('u1', 'c1');

    expect(stored('conversations')).toEqual([
      {
        id: `conv-${Date.parse(NOW.toISOString())}`,
        title: 'New',
        updatedAt: TS,
        createdAt: TS,
      },
    ]);
  });

  it('falls back for messages, air quality, and predictions', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));
    mocks.addDoc.mockRejectedValue(new Error('offline'));

    await addMessage('u1', 'c1', { role: 'user', content: 'local' });
    expect(await listMessages('u1', 'c1')).toEqual([
      { id: `msg-${Date.parse(NOW.toISOString())}`, role: 'user', content: 'local', timestamp: TS },
    ]);

    await addAirQualityRecord('u1', { aqi: 5 });
    expect((await listAirQualityRecords('u1'))[0]).toMatchObject({ aqi: 5 });

    await savePredictions('u1', ['local']);
    expect(await getLatestPredictions('u1')).toEqual(['local']);
  });

  it('falls back for trips, uploads, and lifestyle settings', async () => {
    mocks.getDocs.mockRejectedValue(new Error('offline'));
    mocks.addDoc.mockRejectedValue(new Error('offline'));
    mocks.setDoc.mockRejectedValue(new Error('offline'));
    mocks.deleteDoc.mockRejectedValue(new Error('offline'));
    mocks.getDoc.mockRejectedValue(new Error('offline'));

    await addCarbonTrip('u1', { mode: 'Car' });
    expect((await listCarbonTrips('u1'))[0]).toMatchObject({ mode: 'Car' });
    await deleteCarbonTrip('u1', `trip-${Date.parse(NOW.toISOString())}`);
    expect(stored('carbonTrips')).toEqual([]);

    await addUpload('u1', { fileId: 'file-1' });
    expect(await isUploadReady('u1', 'file-1')).toBe(true);
    await deleteUpload('u1', 'file-1');
    expect(await isUploadReady('u1', 'file-1')).toBe(false);

    await saveLifestyleSettings('u1', { household: { members: [] } });
    expect(await getLifestyleSettings('u1')).toEqual({
      household: { members: [] },
      updatedAt: TS,
    });
  });
});
