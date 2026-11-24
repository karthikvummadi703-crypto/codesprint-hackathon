import type { ComponentProps, ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PredictionsPage from '../PredictionsPage';
import type { ActiveLocation } from '../../context/LocationContext';
import type { CurrentWeather, HourlyWeather, WeatherResponse } from '../../services/backendService';
import type { PredictionForecast } from '../../types';

const mocks = vi.hoisted(() => ({
  usePredictions: vi.fn(),
  load: vi.fn<(force?: boolean) => Promise<void>>(),
  searchLocations: vi.fn(),
  setLocation: vi.fn(),
}));

vi.mock('../predictions/usePredictions', () => ({ usePredictions: mocks.usePredictions }));

vi.mock('../../services/backendService', () => ({
  PREDICTION_METHOD: { MODEL: 'provider-forecast', HEURISTIC: 'heuristic-prototype' },
  fetchPredictions: vi.fn(),
  fetchWeather: vi.fn(),
  searchLocations: mocks.searchLocations,
}));

vi.mock('../../context/LocationContext', () => ({
  useLocation: () => ({ location: null, setLocation: mocks.setLocation, clearLocation: vi.fn() }),
  toLocationParams: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

vi.mock('../predictions/ForecastSummary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../predictions/ForecastSummary')>();
  const { createElement: element } = await import('react');
  return {
    default: (props: ComponentProps<typeof actual.default>) =>
      element(
        'section',
        null,
        element('h2', { className: 'text-xs' }, 'Forecast overview'),
        element(actual.default, props),
      ),
  };
});

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  const { createElement: element } = await import('react');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      element('div', { 'data-testid': 'responsive-chart' }, children),
  };
});

interface PredictionsState {
  location: ActiveLocation | null;
  forecasts: PredictionForecast[];
  loading: boolean;
  weatherError: string;
  error: string;
  method: string;
  provenanceNote: string;
  locationLabel: string;
  load: (force?: boolean) => Promise<void>;
  firstForecast: PredictionForecast | null;
  latestForecast: PredictionForecast | null;
  aqiDiff: number;
  peak: number;
  worst: PredictionForecast | null;
  avgConfidence: number;
  guidance: { title: string; body: string; tone: string };
  current: CurrentWeather | undefined;
  tempUnit: string;
  windUnit: string;
  hourly: HourlyWeather[];
  weather: WeatherResponse | null;
}

const forecasts: PredictionForecast[] = [
  {
    timeOffsetHours: 0,
    label: 'Now',
    aqi: 72,
    confidence: 90,
    pm25: 18,
    pm10: 30,
    no2: 20,
    so2: 5,
    co: 0.4,
    o3: 40,
    dominantPollutant: 'PM2.5',
    status: 'Moderate',
  },
  {
    timeOffsetHours: 1,
    label: '1h',
    aqi: 65,
    confidence: 85,
    pm25: 15,
    pm10: 26,
    no2: 18,
    so2: 4,
    co: 0.3,
    o3: 38,
    dominantPollutant: 'PM2.5',
    status: 'Moderate',
  },
];

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

const weather: WeatherResponse = {
  location: { name: 'Nellore', latitude: 14.44, longitude: 79.99 },
  current,
  hourly,
  daily: [],
  units: { temperature: '°C', windSpeed: 'km/h' },
  source: 'Open-Meteo',
  timezone: 'Asia/Kolkata',
  timestamp: '2026-01-15T09:00:00.000Z',
};

function makeState(overrides: Partial<PredictionsState> = {}): PredictionsState {
  return {
    location: { name: 'Nellore', latitude: 14.44, longitude: 79.99 },
    forecasts,
    loading: false,
    weatherError: '',
    error: '',
    method: 'provider-forecast',
    provenanceNote: 'Open-Meteo ensemble',
    locationLabel: 'Nellore',
    load: mocks.load,
    firstForecast: forecasts[0] ?? null,
    latestForecast: forecasts[1] ?? null,
    aqiDiff: -7,
    peak: 72,
    worst: forecasts[0] ?? null,
    avgConfidence: 85,
    guidance: {
      title: 'Generally acceptable for most people',
      body: 'Sensitive individuals may notice symptoms during the worst part of the window.',
      tone: 'text-amber-700',
    },
    current,
    tempUnit: '°C',
    windUnit: 'km/h',
    hourly,
    weather,
    ...overrides,
  };
}

describe('PredictionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue(undefined);
    mocks.usePredictions.mockReturnValue(makeState());
  });

  it('shows the compact location picker before a location is chosen', async () => {
    mocks.usePredictions.mockReturnValue(
      makeState({ location: null, forecasts: [], weather: null, hourly: [] }),
    );

    const { container } = render(<PredictionsPage />);

    expect(screen.getByRole('heading', { name: 'Choose a location' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Search for a city or place' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Future Pollution Predictions' })).not.toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('keeps the refresh control busy and withholds the empty message while loading', async () => {
    mocks.usePredictions.mockReturnValue(
      makeState({ loading: true, forecasts: [], weather: null, hourly: [] }),
    );

    const { container } = render(<PredictionsPage />);

    expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
    expect(screen.queryByText('No forecast available')).not.toBeInTheDocument();
    expect(screen.getByText('No forecast points to plot.')).toBeInTheDocument();
    expect(screen.getByText('Detailed Forecast Matrix')).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('renders the forecast summary, drivers, chart and matrix on success', async () => {
    const { container } = render(<PredictionsPage />);

    expect(screen.getByRole('heading', { name: 'Future Pollution Predictions' })).toBeInTheDocument();
    expect(screen.getByText('Model forecast')).toBeInTheDocument();
    expect(screen.getByText('72 → 65')).toBeInTheDocument();
    expect(screen.getByText(/-7 \(improving\)/)).toBeInTheDocument();
    expect(screen.getByText('Generally acceptable for most people')).toBeInTheDocument();
    expect(
      screen.getByText('Live observations and forecast from Open-Meteo, timezone Asia/Kolkata.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Meteorological conditions')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-chart')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Detailed AQI forecast matrix' })).toBeInTheDocument();
    expect(screen.getByText('Now')).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('shows both the failure alert and the unavailable state when forecasts fail', async () => {
    mocks.usePredictions.mockReturnValue(
      makeState({ error: 'Backend offline', forecasts: [], weather: null, hourly: [] }),
    );

    const { container } = render(<PredictionsPage />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not load forecasts');
    expect(alert).toHaveTextContent('Backend offline');
    expect(screen.getByText(/No forecast available/)).toBeInTheDocument();
    expect(screen.getByText(/for Nellore/)).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('explains a weather-only failure without hiding the pollution forecast', async () => {
    mocks.usePredictions.mockReturnValue(
      makeState({ weatherError: 'Weather service offline', weather: null, hourly: [], current: undefined }),
    );

    const { container } = render(<PredictionsPage />);

    expect(screen.getByText('Unavailable: Weather service offline')).toBeInTheDocument();
    expect(screen.queryByText('Meteorological conditions')).not.toBeInTheDocument();
    expect(screen.getByText('72 → 65')).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('forces a reload when Refresh is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<PredictionsPage />);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledWith(true);
    expect((await axe(container)).violations).toEqual([]);
  });
});
