import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WeatherResponse } from '../../services/backendService';
import type { PredictionForecast } from '../../types';
import PredictionsPage from '../PredictionsPage';

type ActiveLocation = { name: string; latitude?: number; longitude?: number };
type PredictionResponse = {
  predictions: PredictionForecast[];
  method?: string;
  note?: string;
};

const state = vi.hoisted(() => ({
  user: { uid: 'user-1' } as { uid: string } | null,
  location: { name: 'Springfield', latitude: 12.34, longitude: 56.78 } as ActiveLocation | null,
}));

const mocks = vi.hoisted(() => ({
  fetchPredictions: vi.fn<
    (params: {
      lat?: number;
      lon?: number;
      city?: string;
      days?: number;
      force?: boolean;
    }) => Promise<PredictionResponse>
  >(),
  fetchWeather: vi.fn<
    (params: {
      lat?: number;
      lon?: number;
      city?: string;
      hours?: number;
      days?: number;
      force?: boolean;
    }) => Promise<WeatherResponse>
  >(),
  listAirQualityRecords: vi.fn<(uid: string, max?: number) => Promise<{ lat?: number; lon?: number }[]>>(),
  savePredictions: vi.fn<(uid: string, predictions: PredictionForecast[]) => Promise<void>>(),
  setLocation: vi.fn<(loc: ActiveLocation) => void>(),
}));

vi.mock('../../services/backendService', () => ({
  fetchPredictions: mocks.fetchPredictions,
  fetchWeather: mocks.fetchWeather,
  PREDICTION_METHOD: {
    MODEL: 'provider-forecast',
    HEURISTIC: 'heuristic-prototype',
  },
}));

vi.mock('../../services/dataService', () => ({
  listAirQualityRecords: mocks.listAirQualityRecords,
  savePredictions: mocks.savePredictions,
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: state.user }),
}));

vi.mock('../../context/LocationContext', () => ({
  useLocation: () => ({
    location: state.location,
    setLocation: mocks.setLocation,
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

vi.mock('../../components/charts/PredictionForecastChart', () => ({
  default: ({ forecasts }: { forecasts: PredictionForecast[] }) => (
    <div data-testid="prediction-chart">Prediction chart {forecasts.length} points</div>
  ),
}));

const forecastNow: PredictionForecast = {
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

const forecastLater: PredictionForecast = {
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

const predictionResponse: PredictionResponse = {
  predictions: [forecastNow, forecastLater],
  method: 'provider-forecast',
  note: 'Open-Meteo',
};

const weatherResponse: WeatherResponse = {
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
  hourly: [
    {
      timestamp: '2026-01-01T12:00:00Z',
      localTime: '12:00',
      temperature: 25.2,
      apparentTemperature: 26,
      humidity: 60,
      precipitation: null,
      precipitationProbability: 10,
      windSpeed: 2.4,
      windDirection: 0,
      cloudCover: 40,
      uvIndex: 7,
      condition: 'Clear sky',
      conditionCode: 0,
    },
  ],
  daily: [],
  units: { temperature: '°C', windSpeed: 'km/h' },
  source: 'Open-Meteo',
  timezone: 'UTC',
  timestamp: '2026-01-01T12:00:00Z',
};

async function expectAxeClean(container: HTMLElement, expectedViolationIds: string[] = []) {
  const results = await axe(container);
  expect(results.violations.map((violation) => violation.id)).toEqual(expectedViolationIds);
}

function renderPage() {
  return render(<PredictionsPage />);
}

beforeEach(() => {
  state.user = { uid: 'user-1' };
  state.location = { name: 'Springfield', latitude: 12.34, longitude: 56.78 };
  mocks.fetchPredictions.mockReset().mockResolvedValue(predictionResponse);
  mocks.fetchWeather.mockReset().mockResolvedValue(weatherResponse);
  mocks.listAirQualityRecords.mockReset().mockResolvedValue([]);
  mocks.savePredictions.mockReset().mockResolvedValue(undefined);
  mocks.setLocation.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PredictionsPage', () => {
  it('renders model forecasts, confidence, guidance, weather drivers and the matrix', async () => {
    const { container } = renderPage();

    expect(await screen.findByText('80 → 130')).toBeInTheDocument();
    expect(screen.getByText('+50 (worsening)')).toBeInTheDocument();
    expect(screen.getByText('130', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/This is a dispersion-model forecast, not an observation/)).toBeInTheDocument();
    expect(screen.getByText(/90%/)).toBeInTheDocument();
    expect(screen.getByText('Avg Score')).toBeInTheDocument();
    expect(screen.getByText('Model forecast')).toBeInTheDocument();
    expect(screen.getByText('Sensitive groups should limit exertion')).toBeInTheDocument();
    expect(screen.getByText(/Worst point 13:00 at AQI 130/)).toBeInTheDocument();
    expect(screen.getByText(/Atmospheric dispersion model via Open-Meteo/)).toBeInTheDocument();
    expect(screen.getByText(/Live observations and forecast from Open-Meteo, timezone UTC/)).toBeInTheDocument();
    expect(screen.getByText('Meteorological conditions')).toBeInTheDocument();
    expect(screen.getByText(/From N/)).toBeInTheDocument();
    expect(screen.getByText(/weak winds trap pollution/)).toBeInTheDocument();
    expect(screen.getByText('High UV — drives ozone formation')).toBeInTheDocument();
    expect(screen.getByText('Detailed Forecast Matrix')).toBeInTheDocument();
    expect(screen.getByText('80 — Moderate')).toBeInTheDocument();
    expect(screen.getByText('130 — Unhealthy for Sensitive Groups')).toBeInTheDocument();
    expect(screen.getByTestId('prediction-chart')).toHaveTextContent('2 points');
    expect(mocks.savePredictions).toHaveBeenCalledWith('user-1', [forecastNow, forecastLater]);
    expect(mocks.fetchPredictions).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 12.34, lon: 56.78, days: 5, force: false })
    );
    expect(mocks.fetchWeather).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 12.34, lon: 56.78, hours: 24, days: 3, force: false })
    );
    await expectAxeClean(container, ['heading-order']);
  });

  it('keeps the refresh control disabled while forecasts are loading', async () => {
    mocks.fetchPredictions.mockReturnValue(
      new Promise<PredictionResponse>(() => {})
    );
    const { container } = renderPage();

    expect(screen.getByRole('button', { name: /Processing/ })).toBeDisabled();
    expect(screen.queryByText('No forecast available')).not.toBeInTheDocument();
    expect(screen.getByText('-- → --')).toBeInTheDocument();
    await expectAxeClean(container, ['heading-order']);
  });

  it('clears stale forecasts on error and recovers through Refresh', async () => {
    mocks.fetchPredictions.mockRejectedValueOnce(new Error('Forecast offline'));
    const { container } = renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load forecasts');
    expect(alert).toHaveTextContent('Forecast offline');
    expect(screen.getByText('No forecast available')).toBeInTheDocument();
    expect(screen.queryByText('Detailed Forecast Matrix')).not.toBeInTheDocument();

    mocks.fetchPredictions.mockResolvedValueOnce(predictionResponse);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('80 → 130')).toBeInTheDocument();
    expect(mocks.fetchPredictions).toHaveBeenLastCalledWith(
      expect.objectContaining({ force: true })
    );
    await expectAxeClean(container, ['heading-order']);
  });

  it('reports a weather failure without discarding a successful forecast', async () => {
    mocks.fetchWeather.mockRejectedValue(new Error('Weather offline'));
    const { container } = renderPage();

    expect(await screen.findByText('80 → 130')).toBeInTheDocument();
    expect(screen.getByText('Unavailable: Weather offline')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await expectAxeClean(container, ['heading-order']);
  });

  it('shows the unavailable state when the provider returns no predictions', async () => {
    mocks.fetchPredictions.mockResolvedValue({
      predictions: [],
      method: 'provider-forecast',
      note: 'Open-Meteo',
    });
    const { container } = renderPage();

    expect(await screen.findByText('No forecast available')).toBeInTheDocument();
    expect(screen.queryByText('Detailed Forecast Matrix')).not.toBeInTheDocument();
    expect(mocks.savePredictions).not.toHaveBeenCalled();
    await expectAxeClean(container);
  });

  it('labels heuristic output as an offline estimate', async () => {
    mocks.fetchPredictions.mockResolvedValue({
      predictions: [forecastNow, forecastLater],
      method: 'heuristic-prototype',
      note: 'stored reading',
    });
    const { container } = renderPage();

    expect((await screen.findAllByText('Estimated')).length).toBeGreaterThan(0);
    expect(screen.getByText(/This is an offline estimate, not a validated forecast/)).toBeInTheDocument();
    expect(screen.getByText(/Offline estimate derived from the current reading/)).toBeInTheDocument();
    expect(screen.queryByText('Model forecast')).not.toBeInTheDocument();
    await expectAxeClean(container, ['heading-order']);
  });

  it('falls back to the last stored coordinates for a name-only location', async () => {
    state.user = { uid: 'user-1' };
    state.location = { name: 'Nowhere' };
    mocks.listAirQualityRecords.mockResolvedValue([{ lat: 5, lon: 6 }]);
    const { container } = renderPage();

    expect(await screen.findByText('80 → 130')).toBeInTheDocument();
    expect(mocks.listAirQualityRecords).toHaveBeenCalledWith('user-1', 1);
    expect(mocks.fetchPredictions).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'Nowhere', lat: 5, lon: 6 })
    );
    await expectAxeClean(container, ['heading-order']);
  });

  it('renders the compact location picker when no location is pinned', async () => {
    state.location = null;
    state.user = null;
    const { container } = renderPage();

    expect(screen.getByTestId('location-picker')).toBeInTheDocument();
    expect(mocks.fetchPredictions).not.toHaveBeenCalled();
    expect(mocks.fetchWeather).not.toHaveBeenCalled();
    await expectAxeClean(container);
  });
});
