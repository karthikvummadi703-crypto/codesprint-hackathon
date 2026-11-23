import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  type PlaceSuggestion,
} from '../backendService';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  getAppToken: vi.fn(),
}));

vi.mock('../apiClient', () => ({ apiRequest: mocks.apiRequest }));
vi.mock('../authService', () => ({ getAppToken: mocks.getAppToken }));
vi.mock('../firebase', () => ({ API_BASE_URL: 'https://api.example.test' }));

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const place: PlaceSuggestion = {
  name: 'Delhi',
  latitude: 28.6,
  longitude: 77.2,
  region: 'Delhi',
  country: 'India',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAppToken.mockResolvedValue('token-1');
  mocks.apiRequest.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prediction metadata and auth headers', () => {
  it('exposes the backend prediction method identifiers', () => {
    expect(PREDICTION_METHOD).toEqual({
      MODEL: 'provider-forecast',
      HEURISTIC: 'heuristic-prototype',
    });
  });

  it('passes the app token into each apiRequest call', async () => {
    await fetchAQI({ city: 'Delhi' });

    expect(mocks.getAppToken).toHaveBeenCalledTimes(1);
    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/aqi?city=Delhi', {
      token: 'token-1',
      force: undefined,
    });
  });

  it('works with a null token instead of inventing one', async () => {
    mocks.getAppToken.mockResolvedValue(null);

    await fetchAQI({});

    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/aqi?', { token: null, force: undefined });
  });
});

describe('location-based requests', () => {
  it('builds the AQI query from coordinates, city, and force', async () => {
    await fetchAQI({ lat: 28.6139, lon: 77.209, city: 'New Delhi', force: true });

    expect(mocks.apiRequest).toHaveBeenCalledWith(
      '/api/aqi?lat=28.6139&lon=77.209&city=New+Delhi',
      { token: 'token-1', force: true },
    );
  });

  it('appends days to the prediction query', async () => {
    await fetchPredictions({ lat: 1, lon: 2, days: 7, force: false });

    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/predictions?lat=1&lon=2&days=7', {
      token: 'token-1',
      force: false,
    });
  });

  it('uses a default limit of five for location search', async () => {
    mocks.apiRequest.mockResolvedValue({ places: [place] });

    await expect(searchLocations('Delhi')).resolves.toEqual([place]);
    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/geocode/search?q=Delhi&limit=5', {
      token: 'token-1',
    });
  });

  it('honours a custom search limit and falls back to an empty list', async () => {
    mocks.apiRequest.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ places: null });

    await expect(searchLocations('Pune', 3)).resolves.toEqual([]);
    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/geocode/search?q=Pune&limit=3', {
      token: 'token-1',
    });
    await expect(searchLocations('Pune', 3)).resolves.toEqual([]);
  });

  it('returns the first reverse-geocoded place', async () => {
    mocks.apiRequest.mockResolvedValue({ places: [place, { ...place, name: 'Noida' }] });

    await expect(reverseGeocode(28.6, 77.2)).resolves.toEqual(place);
    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/geocode/reverse?lat=28.6&lon=77.2', {
      token: 'token-1',
    });
  });

  it('fails explicitly when reverse geocoding finds no place', async () => {
    mocks.apiRequest.mockResolvedValueOnce({ places: [] }).mockResolvedValueOnce(undefined);

    await expect(reverseGeocode(0, 0)).rejects.toThrow('Could not resolve this location.');
    await expect(reverseGeocode(0, 0)).rejects.toThrow('Could not resolve this location.');
  });
});

describe('chat transport', () => {
  it('sends nulls for every absent context field', async () => {
    mocks.apiRequest.mockResolvedValue({ response: 'Hello' });

    await expect(sendChatMessage('Hello?')).resolves.toEqual({ response: 'Hello' });
    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/ai/chat', {
      method: 'POST',
      body: {
        message: 'Hello?',
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
      token: 'token-1',
    });
  });

  it('forwards all supplied context and document ids', async () => {
    const context = {
      location: { name: 'Delhi', latitude: 28.6, longitude: 77.2 },
      aqHistory: [{ aqi: 42 }],
      carbonTrips: [{ mode: 'Bike' }],
      predictions: [{ aqi: 50 }],
      weather: { temperature: 30 },
      documentIds: ['rag-1', 'rag-2'],
      history: [
        { role: 'user' as const, content: 'previous' },
        { role: 'assistant' as const, content: 'answer' },
      ],
      household: { members: [] },
      routines: [{ title: 'Walk' }],
      routineContext: 'user-provided plan',
    };

    await sendChatMessage('Analyze', context);

    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/ai/chat', {
      method: 'POST',
      body: {
        message: 'Analyze',
        location: context.location,
        aqHistory: context.aqHistory,
        carbonTrips: context.carbonTrips,
        predictions: context.predictions,
        weather: context.weather,
        documentIds: ['rag-1', 'rag-2'],
        history: context.history,
        household: context.household,
        routines: context.routines,
        routineContext: 'user-provided plan',
      },
      token: 'token-1',
    });
  });

  it('treats an empty document id list as no attachment', async () => {
    await sendChatMessage('Hi', { documentIds: [] });

    expect(mocks.apiRequest.mock.calls[0]![1].body.documentIds).toBeNull();
  });

  it('propagates a chat failure for the caller to explain', async () => {
    mocks.apiRequest.mockRejectedValue(new Error('Request failed (401)'));

    await expect(sendChatMessage('Hi')).rejects.toThrow('Request failed (401)');
  });
});

describe('document upload and deletion', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ fileId: 'rag-1' })));
  });

  it('posts multipart form data with the bearer token', async () => {
    const file = new File(['report'], 'report.pdf', { type: 'application/pdf' });

    await expect(uploadDocumentForRag(file)).resolves.toEqual({ fileId: 'rag-1' });

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/api/rag/upload');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ Authorization: 'Bearer token-1' });
    const form = init?.body as FormData;
    expect(form.get('file')).toBe(file);
  });

  it('omits the authorization header without a token', async () => {
    mocks.getAppToken.mockResolvedValue(null);
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });

    await uploadDocumentForRag(file);

    expect(vi.mocked(fetch).mock.calls[0]![1]?.headers).toEqual({});
  });

  it('uses the backend detail when an upload fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ detail: 'Only PDF, CSV and TXT are supported.' }, 415))
        .mockResolvedValueOnce(response({ detail: 42 }, 500)),
    );
    const file = new File(['x'], 'bad.bin');

    await expect(uploadDocumentForRag(file)).rejects.toThrow(
      'Only PDF, CSV and TXT are supported.',
    );
    await expect(uploadDocumentForRag(file)).rejects.toThrow('42');
  });

  it('falls back to the status when the error body cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => {
          throw new Error('not json');
        },
      } as unknown as Response),
    );

    await expect(uploadDocumentForRag(new File(['x'], 'a.txt'))).rejects.toThrow(
      'Upload failed (503)',
    );
  });

  it('propagates a network failure so the caller can show the upload error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')));

    await expect(uploadDocumentForRag(new File(['x'], 'a.txt'))).rejects.toThrow('Failed to fetch');
  });

  it('encodes a rag file id when deleting it', async () => {
    mocks.apiRequest.mockResolvedValue(undefined);

    await expect(deleteRagFile('folder/file id')).resolves.toBeUndefined();
    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/rag/files/folder%2Ffile%20id', {
      method: 'DELETE',
      token: 'token-1',
    });
  });
});

describe('carbon and weather requests', () => {
  it('includes a positive distance but omits zero and missing distances', async () => {
    await calculateCarbon({ origin: 'A', destination: 'B', mode: 'Car', distanceKm: 12.5 });
    await calculateCarbon({ origin: 'A', destination: 'B', mode: 'Car', distanceKm: 0 });
    await calculateCarbon({ origin: 'A', destination: 'B', mode: 'Car' });
    await calculateCarbon({ origin: 'A', destination: 'B', mode: 'Car', distanceKm: -3 });

    expect(mocks.apiRequest).toHaveBeenNthCalledWith(1, '/api/carbon/calculate', {
      method: 'POST',
      body: { origin: 'A', destination: 'B', mode: 'Car', distanceKm: 12.5 },
      token: 'token-1',
    });
    for (const call of mocks.apiRequest.mock.calls.slice(1)) {
      expect(call[1].body).toEqual({ origin: 'A', destination: 'B', mode: 'Car' });
    }
  });

  it('requests a distance estimate without a mode', async () => {
    await estimateDistance({ origin: 'A', destination: 'B' });

    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/carbon/estimate-distance', {
      method: 'POST',
      body: { origin: 'A', destination: 'B' },
      token: 'token-1',
    });
  });

  it('builds the weather query with hours, days and force', async () => {
    await fetchWeather({ city: 'Delhi', hours: 12, days: 3, force: true });

    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/weather?city=Delhi&hours=12&days=3', {
      token: 'token-1',
      force: true,
    });
  });

  it('builds the weather summary query with days', async () => {
    await fetchWeatherSummary({ lat: 1.5, lon: -2.5, days: 2 });

    expect(mocks.apiRequest).toHaveBeenCalledWith('/api/weather/summary?lat=1.5&lon=-2.5&days=2', {
      token: 'token-1',
      force: undefined,
    });
  });

  it('reports backend health as a boolean instead of leaking request errors', async () => {
    mocks.apiRequest
      .mockResolvedValueOnce({ status: 'ok' })
      .mockRejectedValueOnce(new Error('down'));

    await expect(backendHealth()).resolves.toBe(true);
    await expect(backendHealth()).resolves.toBe(false);
    expect(mocks.apiRequest).toHaveBeenNthCalledWith(1, '/api/health');
    expect(mocks.apiRequest).toHaveBeenCalledTimes(2);
  });
});
