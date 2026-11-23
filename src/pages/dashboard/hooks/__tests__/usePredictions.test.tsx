import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeatherResponse } from '../../../../services/backendService';
import type { PredictionForecast } from '../../../../types';
import { usePredictions } from '../usePredictions';

type ActiveLocation = { name: string; latitude?: number; longitude?: number };
type PredictionResponse = { predictions: PredictionForecast[]; method?: string; note?: string };

const state = vi.hoisted(() => ({
  user: { uid: 'user-1' } as { uid: string } | null,
  location: { name: 'Springfield', latitude: 12.34, longitude: 56.78 } as ActiveLocation | null,
}));

const mocks = vi.hoisted(() => ({
  fetchPredictions: vi.fn<(p: Record<string, unknown>) => Promise<PredictionResponse>>(),
  fetchWeather: vi.fn<(p: Record<string, unknown>) => Promise<WeatherResponse>>(),
  listAirQualityRecords:
    vi.fn<(uid: string, max?: number) => Promise<{ lat?: number; lon?: number }[]>>(),
  savePredictions: vi.fn<(uid: string, predictions: PredictionForecast[]) => Promise<void>>(),
}));

vi.mock('../../../../services/backendService', () => ({
  fetchPredictions: mocks.fetchPredictions,
  fetchWeather: mocks.fetchWeather,
  PREDICTION_METHOD: { MODEL: 'provider-forecast', HEURISTIC: 'heuristic-prototype' },
}));

vi.mock('../../../../services/dataService', () => ({
  listAirQualityRecords: mocks.listAirQualityRecords,
  savePredictions: mocks.savePredictions,
}));

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: state.user }),
}));

vi.mock('../../../../context/LocationContext', () => ({
  useLocation: () => ({ location: state.location, setLocation: vi.fn(), clearLocation: vi.fn() }),
  toLocationParams: (loc: ActiveLocation) =>
    typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
      ? { lat: loc.latitude, lon: loc.longitude }
      : { city: loc.name },
}));

const now: PredictionForecast = {
  timeOffsetHours: 0,
  label: 'Now',
  aqi: 80,
  confidence: 0,
  pm25: 20,
  pm10: 30,
  no2: 10,
  so2: 5,
  co: 1,
  o3: 12,
  dominantPollutant: 'PM2.5',
  status: 'Moderate',
};
const later: PredictionForecast = {
  timeOffsetHours: 1,
  label: '13:00',
  aqi: 130,
  confidence: 90,
  pm25: 45,
  pm10: 60,
  no2: 25,
  so2: 8,
  co: 2,
  o3: 28,
  dominantPollutant: 'PM2.5',
  status: 'Unhealthy for Sensitive Groups',
};

const weather: WeatherResponse = {
  location: { name: 'Springfield', latitude: 12.34, longitude: 56.78 },
  current: {
    temperature: 24.4,
    feelsLike: 26.4,
    humidity: 65,
    windSpeed: 2.4,
    windDirection: 0,
    precipitation: 0,
    cloudCover: 40,
    pressure: 1012,
    uvIndex: 7,
    visibility: 9,
    isDay: true,
    condition: 'Clear sky',
    conditionCode: 0,
    observedAt: '2026-01-01T12:00:00Z',
    precipitationProbability: 10,
  },
  hourly: [],
  daily: [],
  units: { temperature: '°C', windSpeed: 'km/h' },
  source: 'Open-Meteo',
  timezone: 'UTC',
  timestamp: '2026-01-01T12:00:00Z',
};

beforeEach(() => {
  state.user = { uid: 'user-1' };
  state.location = { name: 'Springfield', latitude: 12.34, longitude: 56.78 };
  mocks.fetchPredictions.mockReset().mockResolvedValue({
    predictions: [now, later],
    method: 'provider-forecast',
    note: 'Open-Meteo',
  });
  mocks.fetchWeather.mockReset().mockResolvedValue(weather);
  mocks.listAirQualityRecords.mockReset().mockResolvedValue([]);
  mocks.savePredictions.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePredictions', () => {
  it('loads forecasts and weather, derives summary, and saves predictions', async () => {
    const { result } = renderHook(() => usePredictions());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.forecasts).toEqual([now, later]);
    expect(result.current.weather).toEqual(weather);
    expect(result.current.method).toBe('provider-forecast');
    expect(result.current.provenanceNote).toBe('Open-Meteo');
    expect(result.current.locationLabel).toBe('Springfield');
    expect(result.current.firstForecast?.aqi).toBe(80);
    expect(result.current.latestForecast?.aqi).toBe(130);
    expect(result.current.aqiDiff).toBe(50);
    expect(result.current.peak).toBe(130);
    expect(result.current.worst?.label).toBe('13:00');
    expect(result.current.avgConfidence).toBe(90);
    expect(result.current.guidance.title).toBe('Sensitive groups should limit exertion');
    expect(mocks.fetchPredictions).toHaveBeenCalledWith({
      lat: 12.34,
      lon: 56.78,
      days: 5,
      force: false,
    });
    expect(mocks.fetchWeather).toHaveBeenCalledWith({
      lat: 12.34,
      lon: 56.78,
      hours: 24,
      days: 3,
      force: false,
    });
    expect(mocks.savePredictions).toHaveBeenCalledWith('user-1', [now, later]);
  });

  it('clears stale forecasts on prediction error and keeps weather error separate', async () => {
    mocks.fetchPredictions.mockRejectedValueOnce(new Error('Forecast offline'));
    mocks.fetchWeather.mockRejectedValueOnce(new Error('Weather offline'));
    const { result } = renderHook(() => usePredictions());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Forecast offline');
    expect(result.current.weatherError).toBe('Weather offline');
    expect(result.current.forecasts).toEqual([]);
    expect(result.current.weather).toBeNull();
  });

  it('falls back to last stored coordinates for name-only location', async () => {
    state.location = { name: 'Nowhere' };
    mocks.listAirQualityRecords.mockResolvedValue([{ lat: 5, lon: 6 }]);
    const { result } = renderHook(() => usePredictions());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.listAirQualityRecords).toHaveBeenCalledWith('user-1', 1);
    expect(mocks.fetchPredictions).toHaveBeenCalledWith({
      city: 'Nowhere',
      lat: 5,
      lon: 6,
      days: 5,
      force: false,
    });
  });

  it('refreshes with force and does not load when location missing', async () => {
    state.location = null;
    const { result } = renderHook(() => usePredictions());
    await act(async () => {
      await result.current.load(true);
    });
    expect(mocks.fetchPredictions).not.toHaveBeenCalled();
  });
});
