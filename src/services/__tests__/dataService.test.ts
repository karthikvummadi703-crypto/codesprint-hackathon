import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Data = Record<string, unknown>;
type DocSnapshot = { exists: () => boolean; data: () => Data };
type QuerySnapshot = { docs: Array<{ id: string; data: () => Data }>; empty: boolean };

const firebaseState = vi.hoisted(() => ({
  configured: true,
  db: { name: 'mock-db' } as { name: string } | null,
}));

const fsMocks = vi.hoisted(() => ({
  collection: vi.fn<(...parts: string[]) => { parts: string[] }>(),
  doc: vi.fn<(...parts: string[]) => { parts: string[] }>(),
  getDoc: vi.fn<(ref: unknown) => Promise<DocSnapshot>>(),
  setDoc: vi.fn<(ref: unknown, data: Data, options?: unknown) => Promise<void>>(),
  updateDoc: vi.fn<(ref: unknown, data: Data) => Promise<void>>(),
  getDocs: vi.fn<(q: unknown) => Promise<QuerySnapshot>>(),
  query: vi.fn<(source: unknown, ...constraints: unknown[]) => { source: unknown; constraints: unknown[] }>(),
  orderBy: vi.fn<(field: string, direction?: string) => { field: string; direction?: string }>(),
  limit: vi.fn<(n: number) => { n: number }>(),
  addDoc: vi.fn<(ref: unknown, data: Data) => Promise<{ id: string }>>(),
  deleteDoc: vi.fn<(ref: unknown) => Promise<void>>(),
  where:
    vi.fn<(field: string, op: string, value: unknown) => { field: string; op: string; value: unknown }>(),
}));

vi.mock('firebase/firestore', () => fsMocks);
vi.mock('../firebase', () => ({
  get isFirebaseConfigured() {
    return firebaseState.configured;
  },
  get db() {
    return firebaseState.db;
  },
}));

import * as dataService from '../dataService';
import {
  addAirQualityRecord,
  addCarbonTrip,
  addMessage,
  addUpload,
  createConversation,
  deleteCarbonTrip,
  deleteConversation,
  deleteUpload,
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

const UID = 'user-1';
const FIXED_NOW = 1_700_000_000_000;

function docSnap(data: Data | null): DocSnapshot {
  return { exists: () => data !== null, data: () => data ?? {} };
}

function querySnap(items: Array<{ id: string; data: Data }>): QuerySnapshot {
  return { docs: items.map((item) => ({ id: item.id, data: () => item.data })), empty: items.length === 0 };
}

function seedRecord(kind: string, items: Data[]): void {
  localStorage.setItem(`airguard_dev_data_${UID}_${kind}`, JSON.stringify(items));
}

function readRecord(kind: string): Data[] {
  return JSON.parse(localStorage.getItem(`airguard_dev_data_${UID}_${kind}`) ?? '[]') as Data[];
}

function seedRaw(key: string, value: Data): void {
  localStorage.setItem(`airguard_dev_data_${UID}_${key}`, JSON.stringify(value));
}

function readRaw(key: string): Data {
  return JSON.parse(localStorage.getItem(`airguard_dev_data_${UID}_${key}`) ?? '{}') as Data;
}

function refRef(...segments: string[]): { parts: Array<{ name: string } | string | null> } {
  return { parts: [firebaseState.db, ...segments] };
}

describe('dataService', () => {
  beforeEach(() => {
    localStorage.clear();
    firebaseState.configured = true;
    firebaseState.db = { name: 'mock-db' };
    vi.resetAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    fsMocks.collection.mockImplementation((...parts) => ({ parts }));
    fsMocks.doc.mockImplementation((...parts) => ({ parts }));
    fsMocks.query.mockImplementation((source, ...constraints) => ({ source, constraints }));
    fsMocks.orderBy.mockImplementation((field, direction) => ({ field, direction }));
    fsMocks.limit.mockImplementation((n) => ({ n }));
    fsMocks.where.mockImplementation((field, op, value) => ({ field, op, value }));
    fsMocks.getDoc.mockResolvedValue(docSnap(null));
    fsMocks.getDocs.mockResolvedValue(querySnap([]));
    fsMocks.addDoc.mockResolvedValue({ id: 'generated-id' });
    fsMocks.setDoc.mockResolvedValue(undefined);
    fsMocks.updateDoc.mockResolvedValue(undefined);
    fsMocks.deleteDoc.mockResolvedValue(undefined);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('configuration and re-exports', () => {
    it('uses local storage when Firebase is not configured', async () => {
      firebaseState.configured = false;
      seedRaw('profile', { name: 'Local Name' });

      await expect(getUser(UID)).resolves.toEqual({ name: 'Local Name' });
      expect(fsMocks.getDoc).not.toHaveBeenCalled();
    });

    it('falls back when Firebase is configured but has no database handle', async () => {
      firebaseState.db = null;
      seedRaw('profile', { name: 'No Db' });

      await expect(getUser(UID)).resolves.toEqual({ name: 'No Db' });
      expect(fsMocks.getDoc).not.toHaveBeenCalled();
    });

    it('re-exports the Firestore helpers it wraps', () => {
      expect(dataService.collection).toBe(fsMocks.collection);
      expect(dataService.doc).toBe(fsMocks.doc);
      expect(dataService.getDoc).toBe(fsMocks.getDoc);
    });
  });

  describe('user profile', () => {
    it('reads an existing Firestore profile and reports a missing document', async () => {
      fsMocks.getDoc.mockResolvedValueOnce(docSnap({ name: 'Firestore Name' }));
      await expect(getUser(UID)).resolves.toEqual({ name: 'Firestore Name' });
      expect(fsMocks.doc).toHaveBeenCalledWith(firebaseState.db, 'users', UID);

      await expect(getUser(UID)).resolves.toBeNull();
    });

    it('falls back to a local profile after a Firestore read failure', async () => {
      fsMocks.getDoc.mockRejectedValue(new Error('offline'));
      seedRaw('profile', { name: 'Cached Name' });

      await expect(getUser(UID)).resolves.toEqual({ name: 'Cached Name' });
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Firestore getUser failed'),
        expect.any(Error),
      );
    });

    it('ignores a corrupt local profile', async () => {
      firebaseState.configured = false;
      localStorage.setItem(`airguard_dev_data_${UID}_profile`, '{not json');

      await expect(getUser(UID)).resolves.toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Corrupt local profile ignored'),
        expect.any(SyntaxError),
      );
    });

    it('merges profile writes into Firestore with an updatedAt stamp', async () => {
      await saveUser(UID, { name: 'New Name', email: 'new@example.com' });

      expect(fsMocks.setDoc).toHaveBeenCalledWith(
        refRef('users', UID),
        expect.objectContaining({
          name: 'New Name',
          email: 'new@example.com',
          updatedAt: expect.any(String),
        }),
        { merge: true },
      );
      expect(localStorage.getItem(`airguard_dev_data_${UID}_profile`)).toBeNull();
    });

    it('falls back to a merged local profile after a Firestore write failure', async () => {
      seedRaw('profile', { name: 'Old Name', email: 'old@example.com' });
      fsMocks.setDoc.mockRejectedValue(new Error('write blocked'));
      fsMocks.getDoc.mockRejectedValue(new Error('read blocked'));

      await saveUser(UID, { name: 'New Name' });
      expect(readRaw('profile')).toEqual(
        expect.objectContaining({
          name: 'New Name',
          email: 'old@example.com',
          updatedAt: expect.any(String),
        }),
      );
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Firestore saveUser failed'),
        expect.any(Error),
      );
    });

    it('merges into the local profile in dev mode and delegates updateUser', async () => {
      firebaseState.configured = false;
      seedRaw('profile', { email: 'kept@example.com' });

      await updateUser(UID, { name: 'Dev Name' });

      expect(readRaw('profile')).toEqual(
        expect.objectContaining({
          email: 'kept@example.com',
          name: 'Dev Name',
          updatedAt: expect.any(String),
        }),
      );
      expect(fsMocks.setDoc).not.toHaveBeenCalled();
    });
  });

  describe('conversations', () => {
    it('maps Firestore conversation documents and orders them by updatedAt', async () => {
      fsMocks.getDocs.mockResolvedValueOnce(
        querySnap([
          { id: 'c1', data: { title: 'First', updatedAt: '2026-01-01' } },
          { id: 'c2', data: { title: 'Second', updatedAt: '2026-02-01' } },
        ]),
      );

      const conversations = await listConversations(UID);
      expect(conversations).toEqual([
        { id: 'c1', title: 'First', updatedAt: '2026-01-01' },
        { id: 'c2', title: 'Second', updatedAt: '2026-02-01' },
      ]);
      expect(fsMocks.orderBy).toHaveBeenCalledWith('updatedAt', 'desc');
      expect(fsMocks.collection).toHaveBeenCalledWith(firebaseState.db, 'users', UID, 'conversations');
    });

    it('sorts local conversations newest first after a Firestore failure', async () => {
      fsMocks.getDocs.mockRejectedValue(new Error('offline'));
      seedRecord('conversations', [
        { id: 'old', title: 'Old', updatedAt: '2026-01-01' },
        { id: 'new', title: 'New', updatedAt: '2026-02-01' },
      ]);

      await expect(listConversations(UID)).resolves.toEqual([
        { id: 'new', title: 'New', updatedAt: '2026-02-01' },
        { id: 'old', title: 'Old', updatedAt: '2026-01-01' },
      ]);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Firestore listConversations failed'),
        expect.any(Error),
      );
    });

    it('returns the Firestore generated id for new conversations', async () => {
      await expect(createConversation(UID, 'Trip planning')).resolves.toBe('generated-id');
      expect(fsMocks.addDoc).toHaveBeenCalledWith(refRef('users', UID, 'conversations'), {
        title: 'Trip planning',
        updatedAt: expect.any(String),
        createdAt: expect.any(String),
      });
    });

    it('creates a timestamped local conversation id when Firestore fails', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
      fsMocks.addDoc.mockRejectedValue(new Error('offline'));

      await expect(createConversation(UID, 'Local chat')).resolves.toBe(`conv-${FIXED_NOW}`);
      expect(readRecord('conversations')[0]).toEqual({
        id: `conv-${FIXED_NOW}`,
        title: 'Local chat',
        updatedAt: expect.any(String),
        createdAt: expect.any(String),
      });
    });

    it('updates conversations in Firestore and locally on failure', async () => {
      await updateConversation(UID, 'c1', 'Renamed', '2026-03-01T00:00:00.000Z');
      expect(fsMocks.doc).toHaveBeenCalledWith(firebaseState.db, 'users', UID, 'conversations', 'c1');
      expect(fsMocks.updateDoc).toHaveBeenCalledWith(refRef('users', UID, 'conversations', 'c1'), {
        title: 'Renamed',
        updatedAt: '2026-03-01T00:00:00.000Z',
      });

      fsMocks.updateDoc.mockRejectedValue(new Error('offline'));
      seedRecord('conversations', [{ id: 'c1', title: 'Old', updatedAt: '2026-01-01' }]);
      await updateConversation(UID, 'c1', 'Renamed locally');
      expect(readRecord('conversations')[0]).toEqual({
        id: 'c1',
        title: 'Renamed locally',
        updatedAt: expect.any(String),
      });
    });

    it('deletes a conversation and its local message cache', async () => {
      await deleteConversation(UID, 'c1');
      expect(fsMocks.deleteDoc).toHaveBeenCalledWith(refRef('users', UID, 'conversations', 'c1'));

      fsMocks.deleteDoc.mockRejectedValue(new Error('offline'));
      seedRecord('conversations', [
        { id: 'c1', title: 'Gone' },
        { id: 'c2', title: 'Kept' },
      ]);
      localStorage.setItem(`airguard_dev_data_${UID}_messages_c1`, '[]');

      await deleteConversation(UID, 'c1');
      expect(readRecord('conversations').map((item) => item.id)).toEqual(['c2']);
      expect(localStorage.getItem(`airguard_dev_data_${UID}_messages_c1`)).toBeNull();
    });
  });

  describe('messages', () => {
    it('maps Firestore messages in document order', async () => {
      fsMocks.getDocs.mockResolvedValueOnce(
        querySnap([
          { id: 'm1', data: { role: 'user', content: 'Hi' } },
          { id: 'm2', data: { role: 'assistant', content: 'Hello' } },
        ]),
      );

      await expect(listMessages(UID, 'c1')).resolves.toEqual([
        { id: 'm1', role: 'user', content: 'Hi' },
        { id: 'm2', role: 'assistant', content: 'Hello' },
      ]);
      expect(fsMocks.orderBy).toHaveBeenCalledWith('timestamp', 'asc');
    });

    it('reads messages locally after a Firestore failure', async () => {
      fsMocks.getDocs.mockRejectedValue(new Error('offline'));
      seedRecord('messages_c1', [{ id: 'm1', content: 'cached' }]);

      await expect(listMessages(UID, 'c1')).resolves.toEqual([{ id: 'm1', content: 'cached' }]);
    });

    it('adds messages to Firestore and falls back with a timestamped id', async () => {
      await addMessage(UID, 'c1', { role: 'user', content: 'Hi' });
      expect(fsMocks.addDoc).toHaveBeenCalledWith(refRef('users', UID, 'conversations', 'c1', 'messages'), {
        role: 'user',
        content: 'Hi',
        timestamp: expect.any(String),
      });

      vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
      fsMocks.addDoc.mockRejectedValue(new Error('offline'));
      await addMessage(UID, 'c1', { role: 'assistant', content: 'Hello' });
      expect(readRecord('messages_c1')[0]).toEqual({
        id: `msg-${FIXED_NOW}`,
        role: 'assistant',
        content: 'Hello',
        timestamp: expect.any(String),
      });
    });
  });

  describe('air quality and predictions', () => {
    it('adds air quality records with an explicit or generated timestamp', async () => {
      await addAirQualityRecord(UID, { aqi: 40, timestamp: '2026-01-01' });
      expect(fsMocks.addDoc).toHaveBeenCalledWith(refRef('users', UID, 'airQuality'), {
        aqi: 40,
        timestamp: '2026-01-01',
      });

      await addAirQualityRecord(UID, { aqi: 41 });
      expect(fsMocks.addDoc).toHaveBeenLastCalledWith(refRef('users', UID, 'airQuality'), {
        aqi: 41,
        timestamp: expect.any(String),
      });
    });

    it('stores air quality records locally with a fixed id after failure', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
      fsMocks.addDoc.mockRejectedValue(new Error('offline'));

      await addAirQualityRecord(UID, { aqi: 55 });
      expect(readRecord('airQuality')[0]).toEqual({
        id: `aq-${FIXED_NOW}`,
        aqi: 55,
        timestamp: expect.any(String),
      });
    });

    it('limits and maps Firestore air quality history', async () => {
      fsMocks.getDocs.mockResolvedValueOnce(querySnap([{ id: 'aq1', data: { aqi: 70 } }]));

      await expect(listAirQualityRecords(UID, 3)).resolves.toEqual([{ id: 'aq1', aqi: 70 }]);
      expect(fsMocks.orderBy).toHaveBeenCalledWith('timestamp', 'desc');
      expect(fsMocks.limit).toHaveBeenCalledWith(3);
    });

    it('sorts and truncates local air quality history after failure', async () => {
      fsMocks.getDocs.mockRejectedValue(new Error('offline'));
      seedRecord('airQuality', [
        { id: 'old', timestamp: '2026-01-01' },
        { id: 'new', timestamp: '2026-02-01' },
        { id: 'mid', timestamp: '2026-01-15' },
      ]);

      await expect(listAirQualityRecords(UID, 2)).resolves.toEqual([
        { id: 'new', timestamp: '2026-02-01' },
        { id: 'mid', timestamp: '2026-01-15' },
      ]);
    });

    it('saves predictions to Firestore and locally with a fixed id', async () => {
      await savePredictions(UID, [{ aqi: 10 }]);
      expect(fsMocks.addDoc).toHaveBeenCalledWith(refRef('users', UID, 'predictions'), {
        predictions: [{ aqi: 10 }],
        createdAt: expect.any(String),
      });

      vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
      fsMocks.addDoc.mockRejectedValue(new Error('offline'));
      await savePredictions(UID, [{ aqi: 20 }]);
      expect(readRecord('predictions')[0]).toEqual({
        id: `pred-${FIXED_NOW}`,
        predictions: [{ aqi: 20 }],
        createdAt: expect.any(String),
      });
    });

    it('returns the newest Firestore prediction array and rejects non-array payloads', async () => {
      fsMocks.getDocs.mockResolvedValueOnce(
        querySnap([{ id: 'p1', data: { predictions: [{ aqi: 1 }], createdAt: '2026-01-01' } }]),
      );
      await expect(getLatestPredictions(UID)).resolves.toEqual([{ aqi: 1 }]);
      expect(fsMocks.limit).toHaveBeenCalledWith(1);

      fsMocks.getDocs.mockResolvedValueOnce(querySnap([{ id: 'p2', data: { predictions: 'bad' } }]));
      await expect(getLatestPredictions(UID)).resolves.toEqual([]);
    });

    it('falls back to the newest local predictions when Firestore is empty or failing', async () => {
      seedRecord('predictions', [
        { id: 'old', createdAt: '2026-01-01', predictions: [{ aqi: 1 }] },
        { id: 'new', createdAt: '2026-02-01', predictions: [{ aqi: 2 }] },
      ]);

      await expect(getLatestPredictions(UID)).resolves.toEqual([{ aqi: 2 }]);

      fsMocks.getDocs.mockRejectedValue(new Error('offline'));
      await expect(getLatestPredictions(UID)).resolves.toEqual([{ aqi: 2 }]);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Firestore getLatestPredictions failed'),
        expect.any(Error),
      );
    });
  });

  describe('carbon trips', () => {
    it('adds trips to Firestore and returns a local fixed id after failure', async () => {
      await expect(addCarbonTrip(UID, { origin: 'A', date: '2026-01-01' })).resolves.toBe('generated-id');
      expect(fsMocks.addDoc).toHaveBeenCalledWith(refRef('users', UID, 'carbonTrips'), {
        origin: 'A',
        date: '2026-01-01',
      });

      vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
      fsMocks.addDoc.mockRejectedValue(new Error('offline'));
      await expect(addCarbonTrip(UID, { origin: 'B' })).resolves.toBe(`trip-${FIXED_NOW}`);
      expect(readRecord('carbonTrips')[0]).toEqual({
        id: `trip-${FIXED_NOW}`,
        origin: 'B',
        date: expect.any(String),
      });
    });

    it('builds limited and unlimited Firestore trip queries', async () => {
      await listCarbonTrips(UID, 5);
      expect(fsMocks.limit).toHaveBeenCalledWith(5);
      expect(fsMocks.orderBy).toHaveBeenCalledWith('date', 'desc');

      fsMocks.limit.mockClear();
      await listCarbonTrips(UID, 0);
      expect(fsMocks.limit).not.toHaveBeenCalled();
    });

    it('sorts and truncates local trips after failure', async () => {
      fsMocks.getDocs.mockRejectedValue(new Error('offline'));
      seedRecord('carbonTrips', [
        { id: 'old', date: '2026-01-01' },
        { id: 'new', date: '2026-02-01' },
      ]);

      await expect(listCarbonTrips(UID, 1)).resolves.toEqual([{ id: 'new', date: '2026-02-01' }]);
      await expect(listCarbonTrips(UID)).resolves.toEqual([
        { id: 'new', date: '2026-02-01' },
        { id: 'old', date: '2026-01-01' },
      ]);
    });

    it('deletes trips in Firestore and locally on failure', async () => {
      await deleteCarbonTrip(UID, 'trip-1');
      expect(fsMocks.deleteDoc).toHaveBeenCalledWith(refRef('users', UID, 'carbonTrips', 'trip-1'));

      fsMocks.deleteDoc.mockRejectedValue(new Error('offline'));
      seedRecord('carbonTrips', [{ id: 'trip-1' }, { id: 'trip-2' }]);
      await deleteCarbonTrip(UID, 'trip-1');
      expect(readRecord('carbonTrips').map((trip) => trip.id)).toEqual(['trip-2']);
    });
  });

  describe('upload metadata', () => {
    it('writes upload metadata keyed by file id in Firestore', async () => {
      await addUpload(UID, { fileId: 'file-1', name: 'notes.pdf', uploadedAt: '2026-01-01' });

      expect(fsMocks.setDoc).toHaveBeenCalledWith(refRef('users', UID, 'uploads', 'file-1'), {
        fileId: 'file-1',
        name: 'notes.pdf',
        uploadedAt: '2026-01-01',
      });
    });

    it('stores upload metadata locally after a Firestore failure', async () => {
      fsMocks.setDoc.mockRejectedValue(new Error('offline'));

      await addUpload(UID, { fileId: 'file-2', name: 'data.csv' });
      expect(readRecord('uploads')[0]).toEqual({
        id: 'file-2',
        fileId: 'file-2',
        name: 'data.csv',
        uploadedAt: expect.any(String),
      });
    });

    it('lists uploads from Firestore and from local storage on failure', async () => {
      fsMocks.getDocs.mockResolvedValueOnce(querySnap([{ id: 'f1', data: { name: 'one.pdf' } }]));
      await expect(listUploads(UID)).resolves.toEqual([{ id: 'f1', name: 'one.pdf' }]);
      expect(fsMocks.orderBy).toHaveBeenCalledWith('uploadedAt', 'desc');

      fsMocks.getDocs.mockRejectedValue(new Error('offline'));
      seedRecord('uploads', [
        { id: 'f1', uploadedAt: '2026-01-01' },
        { id: 'f2', uploadedAt: '2026-02-01' },
      ]);
      await expect(listUploads(UID)).resolves.toEqual([
        { id: 'f2', uploadedAt: '2026-02-01' },
        { id: 'f1', uploadedAt: '2026-01-01' },
      ]);
    });

    it('deletes upload metadata in Firestore and locally on failure', async () => {
      await deleteUpload(UID, 'f1');
      expect(fsMocks.deleteDoc).toHaveBeenCalledWith(refRef('users', UID, 'uploads', 'f1'));

      fsMocks.deleteDoc.mockRejectedValue(new Error('offline'));
      seedRecord('uploads', [{ id: 'f1' }, { id: 'f2' }]);
      await deleteUpload(UID, 'f1');
      expect(readRecord('uploads').map((item) => item.id)).toEqual(['f2']);
    });

    it('checks upload readiness through Firestore, local storage and failures', async () => {
      fsMocks.getDocs.mockResolvedValueOnce(querySnap([{ id: 'f1', data: { fileId: 'f1' } }]));
      await expect(isUploadReady(UID, 'f1')).resolves.toBe(true);
      expect(fsMocks.where).toHaveBeenCalledWith('fileId', '==', 'f1');
      expect(fsMocks.limit).toHaveBeenCalledWith(1);

      await expect(isUploadReady(UID, 'f2')).resolves.toBe(false);

      seedRecord('uploads', [{ id: 'f1' }]);
      fsMocks.getDocs.mockRejectedValue(new Error('offline'));
      await expect(isUploadReady(UID, 'f2')).resolves.toBe(false);
      await expect(isUploadReady(UID, 'f1')).resolves.toBe(true);
    });
  });

  describe('lifestyle settings', () => {
    it('extracts household and community watch fields from the Firestore profile', async () => {
      fsMocks.getDoc.mockResolvedValueOnce(
        docSnap({ household: { members: [] }, communityWatch: { enabled: true }, name: 'Ignored' }),
      );

      await expect(getLifestyleSettings(UID)).resolves.toEqual({
        household: { members: [] },
        communityWatch: { enabled: true },
      });
    });

    it('falls back to local lifestyle settings when Firestore has none', async () => {
      seedRaw('lifestyle', { household: { members: [{ id: '1' }] } });

      await expect(getLifestyleSettings(UID)).resolves.toEqual({
        household: { members: [{ id: '1' }] },
      });
    });

    it('ignores corrupt local lifestyle settings', async () => {
      firebaseState.configured = false;
      localStorage.setItem(`airguard_dev_data_${UID}_lifestyle`, 'not json');

      await expect(getLifestyleSettings(UID)).resolves.toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Corrupt local lifestyle settings ignored'),
        expect.any(SyntaxError),
      );
    });

    it('merges lifestyle settings into Firestore and into local storage on failure', async () => {
      await saveLifestyleSettings(UID, { communityWatch: { enabled: true } });
      expect(fsMocks.setDoc).toHaveBeenCalledWith(
        refRef('users', UID),
        expect.objectContaining({ communityWatch: { enabled: true }, updatedAt: expect.any(String) }),
        { merge: true },
      );

      firebaseState.configured = false;
      seedRaw('lifestyle', { household: { members: [] } });
      await saveLifestyleSettings(UID, { communityWatch: { enabled: false } });
      expect(readRaw('lifestyle')).toEqual({
        household: { members: [] },
        communityWatch: { enabled: false },
        updatedAt: expect.any(String),
      });

      const raw = readRaw('lifestyle');
      expect(raw.household).toEqual({ members: [] });
    });
  });
});
