import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeatherResponse } from '../../../../services/backendService';
import { useWeatherReport } from '../useWeatherReport';

type ActiveLocation = { name: string; latitude?: number; longitude?: number };

const state = vi.hoisted(() => ({
  location: { name: 'Springfield', latitude: 12.34, longitude: 56.78 } as ActiveLocation | null,
}));

const mocks = vi.hoisted(() => ({
  fetchWeather: vi.fn<(p: Record<string, unknown>) => Promise<WeatherResponse>>(),
}));

vi.mock('../../../../services/backendService', () => ({
  fetchWeather: mocks.fetchWeather,
}));

vi.mock('../../../../context/LocationContext', () => ({
  useLocation: () => ({ location: state.location, setLocation: vi.fn(), clearLocation: vi.fn() }),
  toLocationParams: (loc: ActiveLocation) =>
    typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
      ? { lat: loc.latitude, lon: loc.longitude }
      : { city: loc.name },
}));

const weather: WeatherResponse = {
  location: { name: 'Springfield', latitude: 12.34, longitude: 56.78 },
  current: {
    temperature: 24.4,
    feelsLike: 26.4,
    humidity: 65,
    windSpeed: 2.6,
    windDirection: 225,
    precipitation: 1.2,
    cloudCover: 40,
    pressure: 1012,
    uvIndex: 8,
    visibility: 9,
    isDay: true,
    condition: 'Partly cloudy',
    conditionCode: 2,
    observedAt: '2026-01-01T12:00:00Z',
    precipitationProbability: 20,
  },
  hourly: [],
  daily: [],
  units: { temperature: '°C', windSpeed: 'km/h' },
  source: 'Open-Meteo',
  timezone: 'UTC',
  timestamp: '2026-01-01T12:00:00Z',
};

beforeEach(() => {
  state.location = { name: 'Springfield', latitude: 12.34, longitude: 56.78 };
  mocks.fetchWeather.mockReset().mockResolvedValue(weather);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useWeatherReport', () => {
  it('loads weather for the active location on mount', async () => {
    const { result } = renderHook(() => useWeatherReport());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.weather).toEqual(weather);
    expect(result.current.error).toBe('');
    expect(result.current.location).toEqual(state.location);
    expect(mocks.fetchWeather).toHaveBeenCalledWith({
      lat: 12.34,
      lon: 56.78,
      hours: 24,
      days: 7,
      force: false,
    });
  });

  it('clears stale weather and exposes error on failure', async () => {
    mocks.fetchWeather.mockRejectedValueOnce(new Error('Weather offline'));
    const { result } = renderHook(() => useWeatherReport());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.weather).toBeNull();
    expect(result.current.error).toBe('Weather offline');
  });

  it('supports force refresh and no-op without location', async () => {
    const { result } = renderHook(() => useWeatherReport());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.load(true);
    });
    expect(mocks.fetchWeather).toHaveBeenLastCalledWith({
      lat: 12.34,
      lon: 56.78,
      hours: 24,
      days: 7,
      force: true,
    });

    state.location = null;
    const { result: noLoc } = renderHook(() => useWeatherReport());
    await act(async () => {
      await noLoc.current.load(true);
    });
    expect(mocks.fetchWeather).toHaveBeenCalledTimes(2);
  });
});
