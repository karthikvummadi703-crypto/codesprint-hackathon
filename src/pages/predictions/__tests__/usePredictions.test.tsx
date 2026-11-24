import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ActiveLocation } from '../../../context/LocationContext';
import type { AppUser } from '../../../services/authService';
import type {
  AirQualityRecord,
  AQIStatus,
  Json,
  PredictionsApiResponse,
  PredictionForecast,
} from '../../../types';
import type { WeatherResponse } from '../../../services/backendService';

import { usePredictions } from '../usePredictions';

type Guidance = { title: string; body: string; tone: string };

const mocks = vi.hoisted(() => ({
  user: null as AppUser | null,
  location: null as ActiveLocation | null,
  fetchPredictions: vi.fn<(params: Record<string, unknown>) => Promise<PredictionsApiResponse>>(),
  fetchWeather: vi.fn<(params: Record<string, unknown>) => Promise<WeatherResponse>>(),
  listAirQualityRecords: vi.fn<(uid: string, max: number) => Promise<AirQualityRecord[]>>(),
  savePredictions: vi.fn<(uid: string, list: Json[]) => Promise<void>>(),
  activityGuidance: vi.fn<(peak: number) => Guidance>(),
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock('../../../context/LocationContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../context/LocationContext')>();
  return { ...actual, useLocation: () => ({ location: mocks.location }) };
});

vi.mock('../../../services/backendService', () => ({
  fetchPredictions: mocks.fetchPredictions,
  fetchWeather: mocks.fetchWeather,
}));

vi.mock('../../../services/dataService', () => ({
  listAirQualityRecords: mocks.listAirQualityRecords,
  savePredictions: mocks.savePredictions,
}));

vi.mock('../helpers', () => ({
  activityGuidance: mocks.activityGuidance,
}));

const user: AppUser = {
  uid: 'user-1',
  email: 'user@example.com',
  name: 'User',
  photoURL: null,
  isDev: false,
};

function makeForecast(offset: number, aqi: number, confidence = 80): PredictionForecast {
  return {
    timeOffsetHours: offset,
    label: `+${offset}h`,
    aqi,
    confidence,
    pm25: 10,
    pm10: 20,
    no2: 5,
    so2: 2,
    co: 1,
    o3: 3,
    dominantPollutant: 'PM2.5',
    status: 'Moderate' as AQIStatus,
  };
}

function makeWeather(overrides: Partial<WeatherResponse> = {}): WeatherResponse {
  return {
    location: { name: 'Delhi', latitude: 28.6, longitude: 77.2 },
    current: {
      temperature: 30,
      feelsLike: 32,
      humidity: 55,
      windSpeed: 9,
      windDirection: 180,
      precipitation: 0,
      cloudCover: 10,
      pressure: 1010,
      uvIndex: 5,
      visibility: 8000,
      isDay: true,
      condition: 'Clear',
      conditionCode: 0,
      observedAt: '2026-01-01T09:00:00Z',
      precipitationProbability: 0,
    },
    hourly: [],
    daily: [],
    units: { temperature: '°C', windSpeed: 'km/h' },
    source: 'Open-Meteo',
    timezone: 'Asia/Kolkata',
    timestamp: '2026-01-01T09:00:00Z',
    ...overrides,
  };
}

function makeRecord(overrides: Partial<AirQualityRecord> = {}): AirQualityRecord {
  return { id: 'aq-1', timestamp: '2026-01-01T00:00:00Z', ...overrides };
}

function makePredictions(overrides: Partial<PredictionsApiResponse> = {}): PredictionsApiResponse {
  return {
    predictions: [makeForecast(0, 60, 90), makeForecast(3, 120, 70)],
    method: 'provider-forecast',
    note: 'model note',
    ...overrides,
  };
}

describe('usePredictions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = user;
    mocks.location = { name: 'Delhi', latitude: 28.6, longitude: 77.2 };
    mocks.listAirQualityRecords.mockResolvedValue([]);
    mocks.savePredictions.mockResolvedValue(undefined);
    mocks.fetchPredictions.mockResolvedValue(makePredictions());
    mocks.fetchWeather.mockResolvedValue(makeWeather());
    mocks.activityGuidance.mockReturnValue({ title: 'Guidance', body: 'Body', tone: 'tone' });
  });

  it('does not fetch or derive anything without a pinned location', async () => {
    mocks.location = null;
    const { result } = renderHook(() => usePredictions());
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.fetchPredictions).not.toHaveBeenCalled();
    expect(mocks.fetchWeather).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.forecasts).toEqual([]);
    expect(result.current.locationLabel).toBe('');
    expect(result.current.firstForecast).toBeNull();
    expect(result.current.latestForecast).toBeNull();
    expect(result.current.worst).toBeNull();
    expect(result.current.aqiDiff).toBe(0);
    expect(result.current.peak).toBe(0);
    expect(result.current.avgConfidence).toBe(0);
    expect(result.current.tempUnit).toBe('°C');
    expect(result.current.windUnit).toBe('km/h');
  });

  it('loads forecasts and weather together and caches the predictions for a signed-in user', async () => {
    const { result } = renderHook(() => usePredictions());
    await waitFor(() => expect(result.current.forecasts).toHaveLength(2));

    expect(mocks.fetchPredictions).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 28.6, lon: 77.2, days: 5, force: false }),
    );
    expect(mocks.fetchWeather).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 28.6, lon: 77.2, hours: 24, days: 3, force: false }),
    );
    expect(result.current.method).toBe('provider-forecast');
    expect(result.current.provenanceNote).toBe('model note');
    expect(result.current.locationLabel).toBe('Delhi');
    expect(result.current.weather).not.toBeNull();
    expect(result.current.loading).toBe(false);
    expect(mocks.savePredictions).toHaveBeenCalledWith('user-1', expect.any(Array));
  });

  it('uses a previously stored coordinate when only a city name is pinned', async () => {
    mocks.location = { name: 'Delhi' };
    mocks.listAirQualityRecords.mockResolvedValue([makeRecord({ lat: 17.4, lon: 78.4 })]);

    renderHook(() => usePredictions());
    await waitFor(() => expect(mocks.fetchPredictions).toHaveBeenCalledTimes(1));

    expect(mocks.listAirQualityRecords).toHaveBeenCalledWith('user-1', 1);
    expect(mocks.fetchPredictions).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 17.4, lon: 78.4, city: 'Delhi' }),
    );
    expect(mocks.fetchWeather).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 17.4, lon: 78.4, city: 'Delhi' }),
    );
  });

  it('does not consult stored readings when signed out', async () => {
    mocks.user = null;
    mocks.location = { name: 'Delhi' };
    renderHook(() => usePredictions());
    await waitFor(() => expect(mocks.fetchPredictions).toHaveBeenCalledTimes(1));

    expect(mocks.listAirQualityRecords).not.toHaveBeenCalled();
    const params = mocks.fetchPredictions.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.city).toBe('Delhi');
    expect(params.lat).toBeUndefined();
    expect(mocks.savePredictions).not.toHaveBeenCalled();
  });

  it('clears the chart and reports a forecast failure', async () => {
    mocks.fetchPredictions.mockRejectedValueOnce(new Error('forecast unavailable'));
    const { result } = renderHook(() => usePredictions());
    await waitFor(() => expect(result.current.error).toBe('forecast unavailable'));

    expect(result.current.forecasts).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.weather).toBeNull();
    expect(result.current.weatherError).toBe('');
  });

  it('keeps the forecast when only the weather request fails', async () => {
    mocks.fetchWeather.mockRejectedValueOnce(new Error('weather offline'));
    const { result } = renderHook(() => usePredictions());
    await waitFor(() => expect(result.current.weatherError).toBe('weather offline'));

    expect(result.current.forecasts).toHaveLength(2);
    expect(result.current.weather).toBeNull();
    expect(result.current.error).toBe('');
    expect(result.current.loading).toBe(false);
  });

  it('treats stored context failures as best-effort', async () => {
    mocks.location = { name: 'Delhi' };
    mocks.listAirQualityRecords.mockRejectedValue(new Error('history unavailable'));
    const { result } = renderHook(() => usePredictions());
    await waitFor(() => expect(result.current.forecasts).toHaveLength(2));

    expect(result.current.error).toBe('');
    expect(mocks.fetchPredictions).toHaveBeenCalledTimes(1);
    expect(mocks.fetchWeather).toHaveBeenCalledTimes(1);
  });

  it('keeps a valid empty state when the backend returns no predictions', async () => {
    mocks.fetchPredictions.mockResolvedValue(makePredictions({ predictions: [], method: '', note: '' }));
    const { result } = renderHook(() => usePredictions());
    await waitFor(() => expect(mocks.fetchPredictions).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.forecasts).toEqual([]);
    expect(result.current.method).toBe('');
    expect(result.current.provenanceNote).toBe('');
    expect(result.current.firstForecast).toBeNull();
    expect(result.current.latestForecast).toBeNull();
    expect(result.current.aqiDiff).toBe(0);
    expect(result.current.peak).toBe(0);
    expect(result.current.worst).toBeNull();
    expect(result.current.avgConfidence).toBe(0);
    expect(mocks.savePredictions).not.toHaveBeenCalled();
    expect(mocks.activityGuidance).toHaveBeenCalledWith(0);
  });

  it('derives the peak, worst point, delta and forward-looking confidence', async () => {
    mocks.fetchPredictions.mockResolvedValue(
      makePredictions({
        predictions: [
          makeForecast(0, 50, 99),
          makeForecast(-2, 80, 100),
          makeForecast(2, 120, 60),
          makeForecast(5, 90, 80),
        ],
      }),
    );
    mocks.fetchWeather.mockResolvedValue(makeWeather({ units: { temperature: '°F', windSpeed: 'mph' } }));
    const { result } = renderHook(() => usePredictions());
    await waitFor(() => expect(result.current.forecasts).toHaveLength(4));

    expect(result.current.firstForecast?.aqi).toBe(50);
    expect(result.current.latestForecast?.aqi).toBe(90);
    expect(result.current.aqiDiff).toBe(40);
    expect(result.current.peak).toBe(120);
    expect(result.current.worst?.aqi).toBe(120);
    expect(result.current.avgConfidence).toBe(70);
    expect(mocks.activityGuidance).toHaveBeenCalledWith(120);
    expect(result.current.guidance).toEqual({ title: 'Guidance', body: 'Body', tone: 'tone' });
    expect(result.current.tempUnit).toBe('°F');
    expect(result.current.windUnit).toBe('mph');
    expect(result.current.hourly).toEqual([]);
  });

  it('reloads with force and clears the previous error', async () => {
    const { result } = renderHook(() => usePredictions());
    await waitFor(() => expect(result.current.forecasts).toHaveLength(2));

    await act(async () => {
      await result.current.load(true);
    });

    expect(mocks.fetchPredictions).toHaveBeenLastCalledWith(
      expect.objectContaining({ days: 5, force: true }),
    );
    expect(mocks.fetchWeather).toHaveBeenLastCalledWith(
      expect.objectContaining({ hours: 24, days: 3, force: true }),
    );
    expect(mocks.savePredictions).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBe('');
    expect(result.current.loading).toBe(false);
  });
});
