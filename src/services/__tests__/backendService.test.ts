import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RequestOptions = {
  method?: string;
  body?: Record<string, unknown>;
  token?: string | null;
  force?: boolean;
  headers?: Record<string, string>;
};

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn<(path: string, options?: RequestOptions) => Promise<unknown>>(),
  getAppToken: vi.fn<() => Promise<string | null>>(),
}));

vi.mock('../apiClient', () => ({ apiRequest: mocks.apiRequest }));
vi.mock('../authService', () => ({ getAppToken: mocks.getAppToken }));
vi.mock('../firebase', () => ({ API_BASE_URL: 'https://backend.test' }));

import {
  PREDICTION_METHOD,
  backendHealth,
  calculateCarbon,
  deleteRagFile,
  estimateDistance,
  fetchAQI,
  fetchPredictions,
  fetchWeather,
  fetchWeatherSummary,
  reverseGeocode,
  searchLocations,
  sendChatMessage,
  uploadDocumentForRag,
} from '../backendService';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function optionsFor(call = 0): RequestOptions {
  return mocks.apiRequest.mock.calls[call]![1] ?? {};
}

describe('backendService', () => {
  beforeEach(() => {
    mocks.apiRequest.mockReset();
    mocks.apiRequest.mockResolvedValue({});
    mocks.getAppToken.mockReset();
    mocks.getAppToken.mockResolvedValue('app-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes the backend prediction method names', () => {
    expect(PREDICTION_METHOD).toEqual({
      MODEL: 'provider-forecast',
      HEURISTIC: 'heuristic-prototype',
    });
  });

  it('builds AQI location queries and forwards the refresh flag', async () => {
    await fetchAQI({ lat: 12.5, lon: -3, city: 'New York', force: true });

    const query = new URLSearchParams({ lat: '12.5', lon: '-3', city: 'New York' }).toString();
    expect(mocks.apiRequest).toHaveBeenCalledWith(`/api/aqi?${query}`, {
      token: 'app-token',
      force: true,
    });
  });

  it('uses an empty AQI query when no location is supplied', async () => {
    await fetchAQI({});

    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/aqi?', { token: 'app-token', force: undefined });
  });

  it('appends the day count to prediction queries', async () => {
    await fetchPredictions({ city: 'Delhi', days: 3, force: false });

    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/predictions?city=Delhi&days=3', {
      token: 'app-token',
      force: false,
    });
    expect(optionsFor().body).toBeUndefined();
  });

  it('propagates token failures without issuing a request', async () => {
    mocks.getAppToken.mockRejectedValueOnce(new Error('token unavailable'));

    await expect(fetchAQI({})).rejects.toThrow('token unavailable');
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });

  it('returns places from search and falls back to an empty list', async () => {
    const places = [{ name: 'Pune', latitude: 18.5, longitude: 73.8 }];
    mocks.apiRequest.mockResolvedValueOnce({ places });
    await expect(searchLocations('Pune')).resolves.toEqual(places);
    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/geocode/search?q=Pune&limit=5', {
      token: 'app-token',
    });

    mocks.apiRequest.mockResolvedValueOnce(undefined);
    await expect(searchLocations('nowhere', 12)).resolves.toEqual([]);
    expect(mocks.apiRequest).toHaveBeenLastCalledWith('/api/geocode/search?q=nowhere&limit=12', {
      token: 'app-token',
    });
  });

  it('reads the first reverse-geocoded place and reports an empty response', async () => {
    const place = { name: 'Chennai', latitude: 13.1, longitude: 80.3, label: 'Chennai, India' };
    mocks.apiRequest.mockResolvedValueOnce({ places: [place, { name: 'other' }] });
    await expect(reverseGeocode(13.1, 80.3)).resolves.toEqual(place);
    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/geocode/reverse?lat=13.1&lon=80.3', {
      token: 'app-token',
    });

    mocks.apiRequest.mockResolvedValueOnce({ places: [] });
    await expect(reverseGeocode(0, 0)).rejects.toThrow('Could not resolve this location.');

    mocks.apiRequest.mockResolvedValueOnce(undefined);
    await expect(reverseGeocode(0, 0)).rejects.toThrow('Could not resolve this location.');
  });

  it('posts chat messages with absent context represented as null', async () => {
    mocks.apiRequest.mockResolvedValueOnce({ response: 'hello', contextUsed: false });
    const result = await sendChatMessage('hello');

    expect(result).toEqual({ response: 'hello', contextUsed: false });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/ai/chat', {
      method: 'POST',
      body: {
        message: 'hello',
        location: null,
        aqHistory: null,
        carbonTrips: null,
        predictions: null,
        weather: null,
        documentIds: null,
        history: null,
        household: null,
        routines: null,
        routineContext: null,
      },
      token: 'app-token',
    });
  });

  it('keeps supplied chat context and only sends non-empty document ids', async () => {
    const history = [{ role: 'user' as const, content: 'previous' }];
    await sendChatMessage('follow up', {
      location: { name: 'Pune', latitude: 18.5 },
      aqHistory: [{ aqi: 42 }],
      carbonTrips: [{ id: 'trip-1' }],
      predictions: [{ aqi: 50 }],
      weather: { temperature: 22 },
      documentIds: ['doc-1', 'doc-2'],
      history,
      household: { members: 2 },
      routines: [{ title: 'Walk' }],
      routineContext: 'winter',
    });

    expect(optionsFor().body).toEqual({
      message: 'follow up',
      location: { name: 'Pune', latitude: 18.5 },
      aqHistory: [{ aqi: 42 }],
      carbonTrips: [{ id: 'trip-1' }],
      predictions: [{ aqi: 50 }],
      weather: { temperature: 22 },
      documentIds: ['doc-1', 'doc-2'],
      history,
      household: { members: 2 },
      routines: [{ title: 'Walk' }],
      routineContext: 'winter',
    });

    await sendChatMessage('no ids', { documentIds: [] });
    expect((optionsFor(1).body ?? {}).documentIds).toBeNull();
  });

  it('uploads documents with a bearer token and returns the payload', async () => {
    const payload = {
      fileId: 'f-1',
      fileName: 'notes.pdf',
      chunkCount: 4,
      textPreview: 'preview',
    };
    const fetchMock = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(jsonResponse(payload));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['pdf'], 'notes.pdf', { type: 'application/pdf' });

    await expect(uploadDocumentForRag(file)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith('https://backend.test/api/rag/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer app-token' },
      body: expect.any(FormData),
    });
    const form = fetchMock.mock.calls[0]![1]?.body as FormData;
    expect(form.get('file')).toBe(file);
  });

  it('omits the authorization header when there is no app token', async () => {
    mocks.getAppToken.mockResolvedValueOnce(null);
    const fetchMock = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue(jsonResponse({ fileId: 'f-2', fileName: 'a.txt', chunkCount: 1, textPreview: '' }));
    vi.stubGlobal('fetch', fetchMock);

    await uploadDocumentForRag(new File(['a'], 'a.txt', { type: 'text/plain' }));
    expect(fetchMock.mock.calls[0]![1]?.headers).toEqual({});
  });

  it('uses backend error details and a status fallback for failed uploads', async () => {
    const fetchMock = vi
      .fn<(input: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ detail: 'Unsupported file type' }, 415))
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['x'], 'x.txt', { type: 'text/plain' });

    await expect(uploadDocumentForRag(file)).rejects.toThrow('Unsupported file type');
    await expect(uploadDocumentForRag(file)).rejects.toThrow('Upload failed (503)');
    await expect(uploadDocumentForRag(file)).rejects.toThrow('Upload failed (500)');
  });

  it('deletes rag files with an encoded id', async () => {
    await deleteRagFile('folder/file name.pdf');

    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/rag/files/folder%2Ffile%20name.pdf', {
      method: 'DELETE',
      token: 'app-token',
    });
  });

  it('sends carbon calculations with a positive distance only', async () => {
    await calculateCarbon({ origin: 'A', destination: 'B', mode: 'Car', distanceKm: 12 });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/carbon/calculate', {
      method: 'POST',
      body: { origin: 'A', destination: 'B', mode: 'Car', distanceKm: 12 },
      token: 'app-token',
    });

    await calculateCarbon({ origin: 'A', destination: 'B', mode: 'Car', distanceKm: 0 });
    expect(optionsFor(1).body).toEqual({ origin: 'A', destination: 'B', mode: 'Car' });

    await calculateCarbon({ origin: 'A', destination: 'B', mode: 'Car', distanceKm: -2 });
    expect(optionsFor(2).body).toEqual({ origin: 'A', destination: 'B', mode: 'Car' });
  });

  it('posts distance estimates', async () => {
    mocks.apiRequest.mockResolvedValueOnce({ distanceKm: 8.4 });

    await expect(estimateDistance({ origin: 'A', destination: 'B' })).resolves.toEqual({ distanceKm: 8.4 });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/carbon/estimate-distance', {
      method: 'POST',
      body: { origin: 'A', destination: 'B' },
      token: 'app-token',
    });
  });

  it('builds weather and summary queries including hours and days', async () => {
    await fetchWeather({ city: 'Pune', hours: 12, days: 2, force: true });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/weather?city=Pune&hours=12&days=2', {
      token: 'app-token',
      force: true,
    });

    await fetchWeatherSummary({ lat: 1, lon: 2, days: 4 });
    expect(mocks.apiRequest).toHaveBeenLastCalledWith('/api/weather/summary?lat=1&lon=2&days=4', {
      token: 'app-token',
      force: undefined,
    });
  });

  it('reports backend health from a successful probe', async () => {
    mocks.apiRequest.mockResolvedValueOnce({ status: 'ok' });
    await expect(backendHealth()).resolves.toBe(true);
    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/health');
  });

  it('reports backend health as false when the probe fails', async () => {
    mocks.apiRequest.mockRejectedValueOnce(new Error('offline'));
    await expect(backendHealth()).resolves.toBe(false);
  });
});
