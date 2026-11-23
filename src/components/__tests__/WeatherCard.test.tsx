import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WeatherResponse } from '../../services/backendService';
import WeatherCard from '../WeatherCard';

const mocks = vi.hoisted(() => ({ fetchWeather: vi.fn() }));

vi.mock('../../services/backendService', () => ({ fetchWeather: mocks.fetchWeather }));

const weather = {
  location: { name: 'Delhi', latitude: 28.61, longitude: 77.2 },
  current: {
    temperature: 21.6,
    feelsLike: 19.2,
    humidity: 64.4,
    windSpeed: 12.6,
    windDirection: 270,
    precipitation: 0,
    cloudCover: 20,
    pressure: 1012,
    uvIndex: 5.6,
    visibility: 10,
    isDay: true,
    condition: 'Partly cloudy',
    conditionCode: 2,
    observedAt: '2026-11-23T10:00:00Z',
    precipitationProbability: 35.4,
  },
  hourly: [],
  daily: [
    {
      date: '2026-11-23',
      condition: 'Sunny',
      conditionCode: 0,
      temperatureMax: 24.6,
      temperatureMin: 18.2,
      precipitationSum: 0,
      precipitationProbabilityMax: 40.2,
      windSpeedMax: 15,
      windDirectionDominant: 270,
      uvIndexMax: 6,
      sunrise: '06:30',
      sunset: '17:30',
    },
    {
      date: '2026-11-24',
      condition: 'Cloudy',
      conditionCode: 3,
      temperatureMax: 22.4,
      temperatureMin: 16.4,
      precipitationSum: 1,
      precipitationProbabilityMax: 10.4,
      windSpeedMax: 12,
      windDirectionDominant: 180,
      uvIndexMax: 4,
      sunrise: '06:31',
      sunset: '17:29',
    },
  ],
  units: { temperature: '°C', windSpeed: 'km/h' },
  source: 'Open-Meteo',
  timezone: 'Asia/Kolkata',
  timestamp: '2026-11-23T10:00:00Z',
} satisfies WeatherResponse;

function deferred<T>() {
  let resolveValue: (value: T) => void = () => undefined;
  const promise = new Promise<T>(resolve => {
    resolveValue = resolve;
  });
  return { promise, resolve: resolveValue };
}

describe('WeatherCard', () => {
  beforeEach(() => {
    mocks.fetchWeather.mockReset().mockResolvedValue(weather);
  });

  it('shows an explicit loading state and has no axe violations', async () => {
    const pending = deferred<WeatherResponse>();
    mocks.fetchWeather.mockReturnValue(pending.promise);
    const { container } = render(<WeatherCard params={{ city: 'Delhi' }} />);

    expect(screen.getByText('Loading conditions')).toBeInTheDocument();
    expect(screen.queryByText('22')).not.toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('renders rounded current conditions, metrics, precipitation chance and daily ranges', async () => {
    const { container } = render(<WeatherCard params={{ city: 'Delhi' }} />);

    await screen.findByText('Partly cloudy');
    expect(screen.getByText('Current Weather')).toBeInTheDocument();
    expect(screen.getByText('Open-Meteo')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('°C')).toBeInTheDocument();
    expect(screen.getByText('Feels like 19°C')).toBeInTheDocument();
    expect(screen.getByText('64%')).toBeInTheDocument();
    expect(screen.getByText('13 km/h')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText(/35% chance of precipitation in the next hour/)).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
    expect(screen.getByText(/18–25°C · rain 40%/)).toBeInTheDocument();
    expect(screen.getByText(/16–22°C · rain 10%/)).toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('renders placeholders for null values, omits optional lines and falls back to default units', async () => {
    mocks.fetchWeather.mockResolvedValue({
      ...weather,
      units: {},
      current: {
        ...weather.current,
        temperature: null,
        feelsLike: null,
        humidity: null,
        windSpeed: 8.4,
        uvIndex: null,
        precipitationProbability: null,
      },
      daily: [],
    });
    const { container } = render(<WeatherCard params={{ lat: 1, lon: 2 }} />);

    await screen.findByText('Current Weather');
    expect(screen.getAllByText('--')).toHaveLength(3);
    expect(screen.queryByText(/Feels like/)).not.toBeInTheDocument();
    expect(screen.queryByText(/chance of precipitation/)).not.toBeInTheDocument();
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument();
    expect(screen.getByText('°C')).toBeInTheDocument();
    expect(screen.getByText('8 km/h')).toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('shows the unavailable panel when the request rejects with an Error', async () => {
    mocks.fetchWeather.mockRejectedValue(new Error('provider down'));
    const { container } = render(<WeatherCard params={{ city: 'Delhi' }} />);

    expect(await screen.findByText(/Weather is unavailable right now/)).toBeInTheDocument();
    expect(screen.getByText(/Air quality readings below are unaffected/)).toBeInTheDocument();
    expect(screen.queryByText('provider down')).not.toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('handles non-Error rejections with the same unavailable panel', async () => {
    mocks.fetchWeather.mockRejectedValue('boom');
    render(<WeatherCard params={{ city: 'Delhi' }} />);

    expect(await screen.findByText(/Weather is unavailable right now/)).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
    expect(mocks.fetchWeather).toHaveBeenCalledWith({
      lat: undefined,
      lon: undefined,
      city: 'Delhi',
      hours: 8,
      days: 5,
    });
  });

  it('refetches with coordinate params when the pinned location changes', async () => {
    const pending = deferred<WeatherResponse>();
    mocks.fetchWeather.mockResolvedValueOnce(weather).mockReturnValueOnce(pending.promise);
    const { rerender } = render(<WeatherCard params={{ city: 'Delhi' }} />);
    await screen.findByText('Partly cloudy');

    rerender(<WeatherCard params={{ lat: 28.6139, lon: 77.209 }} />);

    await waitFor(() => expect(mocks.fetchWeather).toHaveBeenCalledTimes(2));
    expect(mocks.fetchWeather).toHaveBeenLastCalledWith({
      lat: 28.6139,
      lon: 77.209,
      city: undefined,
      hours: 8,
      days: 5,
    });
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.queryByText('Loading conditions')).not.toBeInTheDocument();
  });

  it('does not expose a manual refresh control', async () => {
    const user = userEvent.setup();
    render(<WeatherCard params={{ city: 'Delhi' }} />);
    await screen.findByText('Partly cloudy');

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await user.click(document.body);
    expect(mocks.fetchWeather).toHaveBeenCalledTimes(1);
  });
});
