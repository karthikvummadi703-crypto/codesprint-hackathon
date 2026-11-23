import { afterEach, beforeEach, expect, vi } from 'vitest';
import { useAuth } from '../../../../context/AuthContext';
import { useLocation } from '../../../../context/LocationContext';
import { clearResponseCache } from '../../../../services/apiClient';

const hoisted = vi.hoisted(() => ({
  firebaseState: {
    isFirebaseConfigured: false,
    db: null as unknown,
    storage: null as unknown,
  },
  firestore: {
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    addDoc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
  },
  network: {
    chatStatus: 200,
    chatResponse: 'Mock assistant answer',
  },
  fetchMock: vi.fn(),
}));

const { firebaseState, firestore, network, fetchMock } = hoisted;
export { firebaseState, firestore, network, fetchMock };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  doc: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  query: vi.fn((...args: unknown[]) => args),
  orderBy: vi.fn((field: string) => field),
  where: vi.fn((field: string) => field),
  limit: vi.fn((count: number) => count),
  ...firestore,
}));

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage: unknown, path: string) => ({ path })),
  uploadBytesResumable: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock('../../../../services/firebase', () => ({
  get isFirebaseConfigured() {
    return firebaseState.isFirebaseConfigured;
  },
  get db() {
    return firebaseState.db;
  },
  get storage() {
    return firebaseState.storage;
  },
  app: null,
  auth: null,
  API_BASE_URL: 'http://test.local',
}));

vi.mock('../../../../services/authService', () => ({
  getAppToken: vi.fn(async () => 'token'),
}));

vi.mock('../../../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../../../context/LocationContext', () => ({ useLocation: vi.fn() }));

export const UID = 'user-1';
export const PREFIX = 'airguard_dev_data_';
export const CREATED_AT = '2026-01-01T00:00:00.000Z';
export const UPDATED_AT = '2026-01-02T00:00:00.000Z';
const user = { uid: UID };
const location = {
  name: 'Test City',
  latitude: 12.3,
  longitude: 80.4,
  region: 'Test Region',
  country: 'Test Country',
};

export const store = new Map<string, string>();
export const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  get length() {
    return store.size;
  },
};

function resetLocalStorageMock() {
  localStorageMock.getItem.mockReset();
  localStorageMock.setItem.mockReset();
  localStorageMock.removeItem.mockReset();
  localStorageMock.clear.mockReset();
  localStorageMock.key.mockReset();
  localStorageMock.getItem.mockImplementation((key: string) => store.get(key) ?? null);
  localStorageMock.setItem.mockImplementation((key: string, value: string) => {
    store.set(key, value);
  });
  localStorageMock.removeItem.mockImplementation((key: string) => {
    store.delete(key);
  });
  localStorageMock.clear.mockImplementation(() => store.clear());
  localStorageMock.key.mockImplementation(
    (index: number) => Array.from(store.keys())[index] ?? null,
  );
}

function jsonResponse(data: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

export function readStored<T>(kind: string): T {
  return JSON.parse(store.get(`${PREFIX}${UID}_${kind}`) ?? '[]') as T;
}

export function seedConversation() {
  store.set(
    `${PREFIX}${UID}_conversations`,
    JSON.stringify([
      { id: 'conv-1', title: 'Existing chat', createdAt: CREATED_AT, updatedAt: UPDATED_AT },
    ]),
  );
  store.set(
    `${PREFIX}${UID}_messages_conv-1`,
    JSON.stringify([
      { id: 'msg-1', role: 'assistant', content: 'Prior answer', timestamp: CREATED_AT },
    ]),
  );
}

export function seedChatFixture() {
  seedConversation();
  store.set(
    `${PREFIX}${UID}_airQuality`,
    JSON.stringify([{ id: 'aq-1', location: 'Fallback City', timestamp: UPDATED_AT }]),
  );
  store.set(
    `${PREFIX}${UID}_lifestyle`,
    JSON.stringify({
      household: { members: [] },
      routines: [],
      routinePromptContext: 'Saved context',
    }),
  );
  store.set(
    `${PREFIX}${UID}_uploads`,
    JSON.stringify([
      {
        fileId: 'rag-9',
        name: 'report.pdf',
        type: 'pdf',
        size: 2048,
        uploadedAt: CREATED_AT,
        status: 'ready',
        ragFileId: 'rag-9',
      },
    ]),
  );
}

export function expectChatRequest() {
  const chatCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/ai/chat'));
  expect(chatCall).toBeDefined();
  const body = JSON.parse(String(chatCall?.[1]?.body)) as Record<string, unknown>;
  expect(body.message).toBe('Tell me more');
  expect(body.history).toEqual([
    { role: 'assistant', content: 'Prior answer' },
    { role: 'user', content: 'Tell me more' },
  ]);
  expect(body.documentIds).toEqual(['rag-9']);
  expect(body.location).toMatchObject({ name: 'Test City', latitude: 12.3 });
  expect(body.aqHistory).toHaveLength(1);
  expect(body.routineContext).toBe('Saved context');
  expect(body.household).toEqual({ members: [] });
}

export function installAssistantHarness() {
  beforeEach(() => {
    store.clear();
    clearResponseCache();
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('fetch', fetchMock);
    firebaseState.isFirebaseConfigured = false;
    firebaseState.db = null;
    firebaseState.storage = null;
    network.chatStatus = 200;
    network.chatResponse = 'Mock assistant answer';
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: string, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/ai/chat')) {
        if (network.chatStatus !== 200)
          return jsonResponse({ detail: 'Unauthorized' }, network.chatStatus);
        return jsonResponse({ response: network.chatResponse });
      }
      if (url.includes('/api/rag/upload')) {
        return jsonResponse({
          fileId: 'rag-1',
          fileName: 'report.pdf',
          chunkCount: 1,
          textPreview: 'report',
        });
      }
      if (url.includes('/api/rag/files/')) {
        return { ok: true, status: 204, json: async () => undefined } as Response;
      }
      return jsonResponse({ aqi: 42, status: 'Good' });
    });
    Object.values(firestore).forEach(mock => {
      mock.mockReset();
      mock.mockResolvedValue({ docs: [], empty: true, exists: () => false });
    });
    resetLocalStorageMock();
    vi.mocked(useAuth).mockReturnValue({ user } as unknown as ReturnType<typeof useAuth>);
    vi.mocked(useLocation).mockReturnValue({
      location,
      setLocation: vi.fn(),
      clearLocation: vi.fn(),
    });
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
}
