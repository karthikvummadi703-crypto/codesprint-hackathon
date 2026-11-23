import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WeatherResponse } from '../../services/backendService';
import WeatherReportPage from '../WeatherReportPage';

type ActiveLocation = { name: string; latitude?: number; longitude?: number };

const state = vi.hoisted(() => ({
  location: { name: 'Springfield', latitude: 12.34, longitude: 56.78 } as ActiveLocation | null,
}));

const mocks = vi.hoisted(() => ({
  fetchWeather:
    vi.fn<
      (params: {
        lat?: number;
        lon?: number;
        city?: string;
        hours?: number;
        days?: number;
        force?: boolean;
      }) => Promise<WeatherResponse>
    >(),
}));

vi.mock('../../services/backendService', () => ({
  fetchWeather: mocks.fetchWeather,
}));

vi.mock('../../context/LocationContext', () => ({
  useLocation: () => ({
    location: state.location,
    setLocation: vi.fn(),
    clearLocation: vi.fn(),
  }),
  toLocationParams: (loc: ActiveLocation) =>
    typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
      ? { lat: loc.latitude, lon: loc.longitude }
      : { city: loc.name },
}));

vi.mock('../../components/LocationPicker', () => ({
  default: () => <div data-testid="location-picker">Location picker</div>,
}));

const weatherResponse: WeatherResponse = {
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
  hourly: [
    {
      timestamp: '2026-01-01T12:00:00Z',
      localTime: '12:00',
      temperature: 25.6,
      apparentTemperature: 26.4,
      humidity: 60,
      precipitation: 0,
      precipitationProbability: 30,
      windSpeed: 3.4,
      windDirection: 225,
      cloudCover: 40,
      uvIndex: 8,
      condition: 'Partly cloudy',
      conditionCode: 2,
    },
  ],
  daily: [
    {
      date: '2026-01-01',
      condition: 'Partly cloudy',
      conditionCode: 2,
      temperatureMax: 27.4,
      temperatureMin: 18.6,
      precipitationSum: 2,
      precipitationProbabilityMax: 30,
      windSpeedMax: 12.4,
      windDirectionDominant: 225,
      uvIndexMax: 8,
      sunrise: '2026-01-01T06:30:00Z',
      sunset: '2026-01-01T18:45:00Z',
    },
    {
      date: '2026-01-02',
      condition: 'Sunny',
      conditionCode: 0,
      temperatureMax: 29.2,
      temperatureMin: 19.4,
      precipitationSum: 0,
      precipitationProbabilityMax: 0,
      windSpeedMax: 9.2,
      windDirectionDominant: 180,
      uvIndexMax: 9,
      sunrise: '2026-01-02T06:31:00Z',
      sunset: '2026-01-02T18:44:00Z',
    },
  ],
  units: { temperature: '°C', windSpeed: 'km/h' },
  source: 'Open-Meteo',
  timezone: 'UTC',
  timestamp: '2026-01-01T12:00:00Z',
};

async function expectAxeClean(container: HTMLElement) {
  const results = await axe(container);
  expect(results.violations.map(violation => violation.id)).toEqual([]);
}

function renderPage() {
  return render(<WeatherReportPage />);
}

beforeEach(() => {
  state.location = { name: 'Springfield', latitude: 12.34, longitude: 56.78 };
  mocks.fetchWeather.mockReset().mockResolvedValue(weatherResponse);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WeatherReportPage', () => {
  it('renders current conditions, hourly and daily forecasts with the provider units', async () => {
    const { container } = renderPage();

    expect(await screen.findByText('Current Conditions')).toBeInTheDocument();
    expect(screen.getByText('Weather Report')).toBeInTheDocument();
    expect(screen.getByText('Springfield')).toBeInTheDocument();
    expect(screen.getByText('via Open-Meteo')).toBeInTheDocument();
    expect(screen.getAllByText('Partly cloudy').length).toBeGreaterThan(0);
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('Feels like 26°C')).toBeInTheDocument();
    expect(screen.getAllByText('65%').length).toBeGreaterThan(0);
    expect(screen.getByText('3 km/h SW')).toBeInTheDocument();
    expect(screen.getByText('1012 hPa')).toBeInTheDocument();
    expect(screen.getByText('Direction: SW')).toBeInTheDocument();
    expect(screen.getByText('Precipitation: 1.2 mm')).toBeInTheDocument();
    expect(screen.getAllByText('Very High').length).toBeGreaterThan(0);
    expect(screen.getByText('24-Hour Forecast')).toBeInTheDocument();
    expect(screen.getByText('7-Day Forecast')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
    expect(screen.getByText('UV 8')).toBeInTheDocument();
    expect(screen.getByText('Sunrise')).toBeInTheDocument();
    expect(screen.getByText('Sunset')).toBeInTheDocument();
    expect(mocks.fetchWeather).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 12.34, lon: 56.78, hours: 24, days: 7, force: false }),
    );
    await expectAxeClean(container);
  });

  it('shows a deterministic fetching state while the provider is pending', async () => {
    mocks.fetchWeather.mockReturnValue(new Promise<WeatherResponse>(() => {}));
    const { container } = renderPage();

    expect(screen.getByText(/Fetching weather data/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Processing/ })).toBeDisabled();
    expect(screen.queryByText('Current Conditions')).not.toBeInTheDocument();
    await expectAxeClean(container);
  });

  it('shows the error state and recovers through Refresh', async () => {
    mocks.fetchWeather.mockRejectedValueOnce(new Error('Weather offline'));
    const { container } = renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Weather data unavailable');
    expect(alert).toHaveTextContent('Weather offline');
    expect(screen.queryByText('Current Conditions')).not.toBeInTheDocument();

    mocks.fetchWeather.mockResolvedValueOnce(weatherResponse);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Current Conditions')).toBeInTheDocument();
    expect(mocks.fetchWeather).toHaveBeenLastCalledWith(expect.objectContaining({ force: true }));
    await expectAxeClean(container);
  });

  it('renders only the header when a successful response has no current conditions', async () => {
    const emptyWeather = { ...weatherResponse, current: null } as unknown as WeatherResponse;
    mocks.fetchWeather.mockResolvedValue(emptyWeather);
    const { container } = renderPage();

    expect(await waitFor(() => screen.getByText('Weather Report'))).toBeInTheDocument();
    expect(screen.queryByText('Current Conditions')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await expectAxeClean(container);
  });

  it('shows placeholders instead of fabricated values for null metrics', async () => {
    const nullCurrent: WeatherResponse['current'] = {
      ...weatherResponse.current,
      temperature: null,
      feelsLike: null,
      humidity: null,
      windSpeed: null,
      windDirection: null,
      precipitation: null,
      precipitationProbability: null,
      uvIndex: null,
      pressure: null,
      visibility: null,
      cloudCover: null,
    };
    mocks.fetchWeather.mockResolvedValue({ ...weatherResponse, current: nullCurrent });
    const { container } = renderPage();

    expect(await screen.findByText('Current Conditions')).toBeInTheDocument();
    expect(screen.getAllByText('--').length).toBeGreaterThan(0);
    expect(screen.queryByText('Feels like 26°C')).not.toBeInTheDocument();
    await expectAxeClean(container);
  });

  it('renders the compact location picker when no location is pinned', async () => {
    state.location = null;
    const { container } = renderPage();

    expect(screen.getByTestId('location-picker')).toBeInTheDocument();
    expect(mocks.fetchWeather).not.toHaveBeenCalled();
    await expectAxeClean(container);
  });
});
