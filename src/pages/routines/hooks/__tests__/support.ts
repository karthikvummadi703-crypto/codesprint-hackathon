import { act } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
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
    localAqi: 88,
    localStatus: 'Moderate',
    placeAqi: 130,
    suggestions: [] as {
      name: string;
      latitude: number;
      longitude: number;
      label: string;
    }[],
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
vi.mock('../../../../context/LocationContext', () => ({
  useLocation: vi.fn(),
  toLocationParams: vi.fn((place: { name: string; latitude?: number; longitude?: number }) =>
    typeof place.latitude === 'number' && typeof place.longitude === 'number'
      ? { lat: place.latitude, lon: place.longitude }
      : { city: place.name },
  ),
}));

export const UID = 'user-1';
export const PREFIX = 'airguard_dev_data_';
const user = { uid: UID };
export const location = { name: 'Test City' };
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

export async function flushAct() {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

export function readStored<T>(key: string): T {
  return JSON.parse(store.get(`${PREFIX}${UID}_${key}`) ?? 'null') as T;
}

export function installRoutinesHarness() {
  beforeEach(() => {
    store.clear();
    clearResponseCache();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-03-10T10:00:00.000Z'));
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('fetch', fetchMock);
    firebaseState.isFirebaseConfigured = false;
    firebaseState.db = null;
    firebaseState.storage = null;
    network.localAqi = 88;
    network.localStatus = 'Moderate';
    network.placeAqi = 130;
    network.suggestions = [];
    resetLocalStorageMock();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: string) => {
      const url = String(input);
      if (url.includes('/api/geocode/search')) {
        return jsonResponse({ places: network.suggestions });
      }
      if (url.includes('/api/aqi?')) {
        if (url.includes('lat=11.1') || url.includes('lat=10.1')) {
          return jsonResponse({ aqi: network.placeAqi, status: 'Unhealthy for Sensitive Groups' });
        }
        return jsonResponse({ aqi: network.localAqi, status: network.localStatus });
      }
      return jsonResponse({});
    });
    Object.values(firestore).forEach(mock => {
      mock.mockReset();
      mock.mockResolvedValue({ docs: [], empty: true, exists: () => false });
    });
    vi.mocked(useAuth).mockReturnValue({ user } as unknown as ReturnType<typeof useAuth>);
    vi.mocked(useLocation).mockReturnValue({
      location,
      setLocation: vi.fn(),
      clearLocation: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
}
