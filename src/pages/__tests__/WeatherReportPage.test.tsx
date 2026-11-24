import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WeatherReportPage from '../WeatherReportPage';
import type { ActiveLocation } from '../../context/LocationContext';
import type {
  CurrentWeather,
  DailyWeather,
  HourlyWeather,
  WeatherResponse,
} from '../../services/backendService';

const mocks = vi.hoisted(() => ({
  useWeatherReport: vi.fn(),
  load: vi.fn<(force?: boolean) => Promise<void>>(),
  searchLocations: vi.fn(),
  setLocation: vi.fn(),
}));

vi.mock('../weather/useWeatherReport', () => ({ useWeatherReport: mocks.useWeatherReport }));

vi.mock('../../services/backendService', () => ({
  fetchWeather: vi.fn(),
  searchLocations: mocks.searchLocations,
}));

vi.mock('../../context/LocationContext', () => ({
  useLocation: () => ({ location: null, setLocation: mocks.setLocation, clearLocation: vi.fn() }),
  toLocationParams: vi.fn(),
}));

interface WeatherReportState {
  location: ActiveLocation | null;
  weather: WeatherResponse | null;
  loading: boolean;
  error: string;
  load: (force?: boolean) => Promise<void>;
  locName: string;
  current: CurrentWeather | undefined;
  hourly: HourlyWeather[] | undefined;
  daily: DailyWeather[] | undefined;
  source: string | undefined;
  timestamp: string | undefined;
  tempUnit: string;
  windUnit: string;
}

const current: CurrentWeather = {
  temperature: 29.4,
  feelsLike: 31.2,
  humidity: 64,
  windSpeed: 12.3,
  windDirection: 180,
  precipitation: 0,
  cloudCover: 20,
  pressure: 1010,
  uvIndex: 5,
  visibility: 10,
  isDay: true,
  condition: 'Partly cloudy',
  conditionCode: 2,
  observedAt: '2026-01-15T09:00:00.000Z',
  precipitationProbability: 10,
};

const hourly: HourlyWeather[] = [
  {
    timestamp: '2026-01-15T09:00:00.000Z',
    localTime: '09:00',
    temperature: 29,
    apparentTemperature: 31,
    humidity: 64,
    precipitation: 0,
    precipitationProbability: 10,
    windSpeed: 12,
    windDirection: 180,
    cloudCover: 20,
    uvIndex: 5,
    condition: 'Partly cloudy',
    conditionCode: 2,
  },
];

const daily: DailyWeather[] = [
  {
    date: '2026-01-15',
    condition: 'Sunny',
    conditionCode: 0,
    temperatureMax: 33,
    temperatureMin: 22,
    precipitationSum: 0,
    precipitationProbabilityMax: 10,
    windSpeedMax: 18,
    windDirectionDominant: 180,
    uvIndexMax: 7,
    sunrise: '2026-01-15T00:30:00.000Z',
    sunset: '2026-01-15T12:30:00.000Z',
  },
  {
    date: '2026-01-16',
    condition: 'Cloudy',
    conditionCode: 2,
    temperatureMax: 31,
    temperatureMin: 21,
    precipitationSum: 1,
    precipitationProbabilityMax: 40,
    windSpeedMax: 14,
    windDirectionDominant: 270,
    uvIndexMax: 5,
    sunrise: '2026-01-16T00:31:00.000Z',
    sunset: '2026-01-16T12:29:00.000Z',
  },
];

const weather: WeatherResponse = {
  location: { name: 'Nellore', latitude: 14.44, longitude: 79.99 },
  current,
  hourly,
  daily,
  units: { temperature: '°C', windSpeed: 'km/h' },
  source: 'Open-Meteo',
  timezone: 'Asia/Kolkata',
  timestamp: '2026-01-15T14:30:00.000Z',
};

function makeState(overrides: Partial<WeatherReportState> = {}): WeatherReportState {
  return {
    location: { name: 'Nellore', latitude: 14.44, longitude: 79.99 },
    weather,
    loading: false,
    error: '',
    load: mocks.load,
    locName: 'Nellore',
    current,
    hourly,
    daily,
    source: 'Open-Meteo',
    timestamp: weather.timestamp,
    tempUnit: '°C',
    windUnit: 'km/h',
    ...overrides,
  };
}

function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

describe('WeatherReportPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-15T14:30:00.000Z'));
    vi.clearAllMocks();
    mocks.load.mockResolvedValue(undefined);
    mocks.useWeatherReport.mockReturnValue(makeState());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the compact location picker before a location is chosen', async () => {
    mocks.useWeatherReport.mockReturnValue(makeState({ location: null }));

    const { container } = render(<WeatherReportPage />);

    expect(screen.getByRole('heading', { name: 'Choose a location' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Search for a city or place' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Weather Report' })).not.toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('shows a busy refresh control and the fetching message while loading', async () => {
    mocks.useWeatherReport.mockReturnValue(makeState({ weather: null, loading: true, current: undefined }));

    const { container } = render(<WeatherReportPage />);

    expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
    expect(screen.getByText(/Fetching weather data/)).toBeInTheDocument();
    expect(screen.queryByText('Current Conditions')).not.toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('renders current conditions, hourly/daily forecasts and sun times on success', async () => {
    const { container } = render(<WeatherReportPage />);

    expect(screen.getByRole('heading', { name: 'Weather Report' })).toBeInTheDocument();
    expect(screen.getByText('Nellore')).toBeInTheDocument();
    expect(screen.getByText(/via Open-Meteo/)).toBeInTheDocument();
    expect(screen.getByText(`Updated ${localTime(weather.timestamp!)}`)).toBeInTheDocument();
    expect(screen.getByText('Current Conditions')).toBeInTheDocument();
    expect(screen.getByText('Partly cloudy')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '24-Hour Forecast' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '7-Day Forecast' })).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
    expect(screen.getByText('Sunrise')).toBeInTheDocument();
    expect(screen.getByText(localTime(daily[0]!.sunrise!))).toBeInTheDocument();
    expect(screen.getByText('Sunset')).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('shows the backend error and hides weather content when the fetch fails', async () => {
    mocks.useWeatherReport.mockReturnValue(
      makeState({
        weather: null,
        error: 'Backend offline',
        current: undefined,
        hourly: undefined,
        daily: undefined,
        source: undefined,
        timestamp: undefined,
      }),
    );

    const { container } = render(<WeatherReportPage />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Weather data unavailable');
    expect(alert).toHaveTextContent('Backend offline');
    expect(alert).toHaveTextContent('uvicorn main:app --reload --port 8001');
    expect(screen.queryByText('Current Conditions')).not.toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('renders only current conditions when the hourly and daily lists are empty', async () => {
    mocks.useWeatherReport.mockReturnValue(makeState({ hourly: [], daily: [] }));

    const { container } = render(<WeatherReportPage />);

    expect(screen.getByText('Current Conditions')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '24-Hour Forecast' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '7-Day Forecast' })).not.toBeInTheDocument();
    expect(screen.queryByText('Sunrise')).not.toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('forces a refresh when the Refresh button is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<WeatherReportPage />);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledWith(true);
    expect((await axe(container)).violations).toEqual([]);
  });
});
