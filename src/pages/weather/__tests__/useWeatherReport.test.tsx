import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ActiveLocation } from '../../../context/LocationContext';
import type { CurrentWeather, WeatherResponse } from '../../../services/backendService';
import { useWeatherReport } from '../useWeatherReport';

const mocks = vi.hoisted(() => ({
  location: null as ActiveLocation | null,
  fetchWeather: vi.fn<(params: Record<string, unknown>) => Promise<WeatherResponse>>(),
}));

vi.mock('../../../context/LocationContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../context/LocationContext')>();
  return { ...actual, useLocation: () => ({ location: mocks.location }) };
});

vi.mock('../../../services/backendService', () => ({
  fetchWeather: mocks.fetchWeather,
}));

const current: CurrentWeather = {
  temperature: 31,
  feelsLike: 33,
  humidity: 62,
  windSpeed: 12,
  windDirection: 180,
  precipitation: 0,
  cloudCover: 20,
  pressure: 1012,
  uvIndex: 6,
  visibility: 9000,
  isDay: true,
  condition: 'Partly cloudy',
  conditionCode: 2,
  observedAt: '2026-01-01T09:00:00Z',
  precipitationProbability: 10,
};

function makeWeather(overrides: Partial<WeatherResponse> = {}): WeatherResponse {
  return {
    location: { name: 'New Delhi', latitude: 28.6, longitude: 77.2 },
    current,
    hourly: [],
    daily: [],
    units: { temperature: '°C', windSpeed: 'km/h' },
    source: 'Open-Meteo',
    timezone: 'Asia/Kolkata',
    timestamp: '2026-01-01T09:00:00Z',
    ...overrides,
  };
}

describe('useWeatherReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.location = { name: 'Delhi', latitude: 28.6, longitude: 77.2 };
    mocks.fetchWeather.mockResolvedValue(makeWeather());
  });

  it('does not fetch anything until a location is pinned', async () => {
    mocks.location = null;
    const { result } = renderHook(() => useWeatherReport());
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.fetchWeather).not.toHaveBeenCalled();
    expect(result.current.weather).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('');
    expect(result.current.locName).toBeUndefined();
    expect(result.current.tempUnit).toBe('°C');
    expect(result.current.windUnit).toBe('km/h');
  });

  it('loads weather for pinned coordinates and exposes derived fields', async () => {
    const hourly = [{ timestamp: '2026-01-01T10:00:00Z' }] as WeatherResponse['hourly'];
    const daily = [{ date: '2026-01-01' }] as WeatherResponse['daily'];
    mocks.fetchWeather.mockResolvedValue(
      makeWeather({ hourly, daily, units: { temperature: '°F', windSpeed: 'mph' } }),
    );

    const { result } = renderHook(() => useWeatherReport());
    await waitFor(() => expect(result.current.weather).not.toBeNull());

    expect(mocks.fetchWeather).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 28.6, lon: 77.2, hours: 24, days: 7, force: false }),
    );
    expect(result.current.location).toBe(mocks.location);
    expect(result.current.locName).toBe('New Delhi');
    expect(result.current.current).toBe(current);
    expect(result.current.hourly).toBe(hourly);
    expect(result.current.daily).toBe(daily);
    expect(result.current.source).toBe('Open-Meteo');
    expect(result.current.timestamp).toBe('2026-01-01T09:00:00Z');
    expect(result.current.tempUnit).toBe('°F');
    expect(result.current.windUnit).toBe('mph');
    expect(result.current.loading).toBe(false);
  });

  it('uses a city-only location when coordinates are unavailable', async () => {
    mocks.location = { name: 'Delhi' };
    renderHook(() => useWeatherReport());
    await waitFor(() => expect(mocks.fetchWeather).toHaveBeenCalledTimes(1));

    expect(mocks.fetchWeather).toHaveBeenCalledWith({
      city: 'Delhi',
      hours: 24,
      days: 7,
      force: false,
    });
  });

  it('clears stale weather and surfaces an Error message on failure', async () => {
    mocks.fetchWeather.mockRejectedValueOnce(new Error('backend offline'));
    const { result } = renderHook(() => useWeatherReport());
    await waitFor(() => expect(result.current.error).toBe('backend offline'));

    expect(result.current.weather).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.locName).toBe('Delhi');
    expect(result.current.current).toBeUndefined();
  });

  it('stringifies non-Error rejections', async () => {
    mocks.fetchWeather.mockImplementationOnce(() => Promise.reject('service unavailable'));
    const { result } = renderHook(() => useWeatherReport());
    await waitFor(() => expect(result.current.error).toBe('service unavailable'));

    expect(result.current.loading).toBe(false);
  });

  it('reloads with force and replaces the previous weather payload', async () => {
    const refreshed = makeWeather({ source: 'Refreshed source' });
    mocks.fetchWeather.mockResolvedValueOnce(makeWeather()).mockResolvedValueOnce(refreshed);
    const { result } = renderHook(() => useWeatherReport());
    await waitFor(() => expect(result.current.weather).not.toBeNull());

    await act(async () => {
      await result.current.load(true);
    });

    expect(mocks.fetchWeather).toHaveBeenCalledTimes(2);
    expect(mocks.fetchWeather).toHaveBeenLastCalledWith(
      expect.objectContaining({ lat: 28.6, lon: 77.2, force: true }),
    );
    expect(result.current.weather).toBe(refreshed);
    expect(result.current.source).toBe('Refreshed source');
    expect(result.current.loading).toBe(false);
  });

  it('reloads automatically when the pinned location changes', async () => {
    const { result, rerender } = renderHook(() => useWeatherReport());
    await waitFor(() => expect(mocks.fetchWeather).toHaveBeenCalledTimes(1));

    mocks.location = { name: 'Mumbai', latitude: 19.07, longitude: 72.87 };
    rerender();
    await waitFor(() => expect(mocks.fetchWeather).toHaveBeenCalledTimes(2));

    expect(mocks.fetchWeather).toHaveBeenLastCalledWith(expect.objectContaining({ lat: 19.07, lon: 72.87 }));
    expect(result.current.location).toBe(mocks.location);
  });
});
