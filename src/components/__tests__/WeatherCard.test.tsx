import { act, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentWeather, DailyWeather, WeatherResponse } from '../../services/backendService';
import WeatherCard from '../WeatherCard';

type WeatherParams = { lat?: number; lon?: number; city?: string; hours?: number; days?: number };

const mocks = vi.hoisted(() => ({
  fetchWeather: vi.fn<(params: WeatherParams) => Promise<WeatherResponse>>(),
}));

vi.mock('../../services/backendService', () => ({
  fetchWeather: mocks.fetchWeather,
}));

function current(overrides: Partial<CurrentWeather> = {}): CurrentWeather {
  return {
    temperature: 23.6,
    feelsLike: 25.4,
    humidity: 62,
    windSpeed: 14.2,
    windDirection: 180,
    precipitation: 0,
    cloudCover: 20,
    pressure: 1012,
    uvIndex: 7,
    visibility: 10,
    isDay: true,
    condition: 'Partly cloudy',
    conditionCode: 2,
    observedAt: '2026-11-24T09:00:00Z',
    precipitationProbability: 35,
    ...overrides,
  };
}

function day(overrides: Partial<DailyWeather> = {}): DailyWeather {
  return {
    date: '2026-11-24',
    condition: 'Sunny',
    conditionCode: 0,
    temperatureMax: 31,
    temperatureMin: 22,
    precipitationSum: 0,
    precipitationProbabilityMax: 10,
    windSpeedMax: 18,
    windDirectionDominant: 180,
    uvIndexMax: 8,
    sunrise: '2026-11-24T05:30:00Z',
    sunset: '2026-11-24T17:30:00Z',
    ...overrides,
  };
}

function weather(overrides: Partial<WeatherResponse> = {}): WeatherResponse {
  return {
    location: { name: 'Hyderabad', latitude: 17.385, longitude: 78.4867 },
    current: current(),
    hourly: [],
    daily: [day(), day({ date: '2026-11-25', condition: 'Rain showers', precipitationProbabilityMax: 70 })],
    units: { temperature: '°C', windSpeed: 'km/h' },
    source: 'Open-Meteo',
    timezone: 'Asia/Kolkata',
    timestamp: '2026-11-24T09:00:00Z',
    ...overrides,
  };
}

async function expectAccessible(container: HTMLElement): Promise<void> {
  expect((await axe(container)).violations).toEqual([]);
}

beforeEach(() => {
  mocks.fetchWeather.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WeatherCard', () => {
  it('shows a loading state while the provider request is pending', async () => {
    let resolveWeather: (value: WeatherResponse) => void = () => {};
    const pending = new Promise<WeatherResponse>((resolve) => {
      resolveWeather = resolve;
    });
    mocks.fetchWeather.mockReturnValue(pending);
    const { container } = render(<WeatherCard params={{ lat: 17.385, lon: 78.4867 }} />);

    expect(screen.getByText('Current Weather')).toBeInTheDocument();
    expect(screen.getByText('Loading conditions')).toBeInTheDocument();
    expect(screen.queryByText(/Weather is unavailable/)).not.toBeInTheDocument();
    await expectAccessible(container);

    await act(async () => {
      resolveWeather(weather());
      await pending;
    });

    expect(screen.queryByText('Loading conditions')).not.toBeInTheDocument();
    expect(screen.getByText('Partly cloudy')).toBeInTheDocument();
    await expectAccessible(container);
  });

  it('renders current conditions, units and the daily summary on success', async () => {
    mocks.fetchWeather.mockResolvedValue(weather());
    const { container } = render(<WeatherCard params={{ city: 'Hyderabad' }} />);

    expect(await screen.findByText('Partly cloudy')).toBeInTheDocument();
    expect(mocks.fetchWeather).toHaveBeenCalledWith({
      lat: undefined,
      lon: undefined,
      city: 'Hyderabad',
      hours: 8,
      days: 5,
    });
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('°C')).toBeInTheDocument();
    expect(screen.getByText('Feels like 25°C')).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
    expect(screen.getByText('14 km/h')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('35% chance of precipitation in the next hour.')).toBeInTheDocument();
    expect(screen.getByText('Open-Meteo')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Sunny')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
    expect(screen.getByText('Rain showers')).toBeInTheDocument();
    expect(screen.getByText(/22–31°C · rain 10%/)).toBeInTheDocument();

    await expectAccessible(container);
  });

  it('renders placeholders instead of invented values for null measurements', async () => {
    mocks.fetchWeather.mockResolvedValue(
      weather({
        current: current({
          temperature: null,
          feelsLike: null,
          humidity: null,
          windSpeed: null,
          uvIndex: null,
          precipitationProbability: 0,
        }),
        daily: [],
      }),
    );
    const { container } = render(<WeatherCard params={{ city: 'Hyderabad' }} />);

    expect(await screen.findByText('Partly cloudy')).toBeInTheDocument();
    expect(screen.getAllByText('--')).toHaveLength(4);
    expect(screen.queryByText(/Feels like/)).not.toBeInTheDocument();
    expect(screen.queryByText(/chance of precipitation/)).not.toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument();

    await expectAccessible(container);
  });

  it('shows an explicit unavailable state when the request fails', async () => {
    mocks.fetchWeather.mockRejectedValue(new Error('provider exploded'));
    const { container } = render(<WeatherCard params={{ lat: 1, lon: 2 }} />);

    expect(await screen.findByText(/Weather is unavailable right now/)).toBeInTheDocument();
    expect(screen.getByText(/Air quality readings below are unaffected/)).toBeInTheDocument();
    expect(screen.queryByText('provider exploded')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading conditions')).not.toBeInTheDocument();

    await expectAccessible(container);
  });

  it('refetches only when the pinned location changes', async () => {
    mocks.fetchWeather.mockResolvedValue(weather());
    const { container, rerender } = render(<WeatherCard params={{ city: 'Delhi' }} />);

    expect(await screen.findByText('Partly cloudy')).toBeInTheDocument();
    expect(mocks.fetchWeather).toHaveBeenCalledTimes(1);

    rerender(<WeatherCard params={{ city: 'Delhi' }} />);
    expect(mocks.fetchWeather).toHaveBeenCalledTimes(1);

    rerender(<WeatherCard params={{ lat: 17.385, lon: 78.4867 }} />);
    await waitFor(() => expect(mocks.fetchWeather).toHaveBeenCalledTimes(2));
    expect(mocks.fetchWeather).toHaveBeenLastCalledWith({
      lat: 17.385,
      lon: 78.4867,
      city: undefined,
      hours: 8,
      days: 5,
    });

    await expectAccessible(container);
  });
});
