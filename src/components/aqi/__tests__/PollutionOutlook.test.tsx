import { act, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveLocation } from '../../../context/LocationContext';
import type { LocationInfo, PredictionForecast, PredictionsApiResponse } from '../../../types';
import PollutionOutlook from '../PollutionOutlook';

type PredictionParams = { lat?: number; lon?: number; city?: string; days?: number; force?: boolean };

const mocks = vi.hoisted(() => ({
  fetchPredictions: vi.fn<(params: PredictionParams) => Promise<PredictionsApiResponse>>(),
}));

vi.mock('../../../services/backendService', () => ({
  fetchPredictions: mocks.fetchPredictions,
}));

const location: LocationInfo = {
  name: 'Hyderabad',
  latitude: 17.385,
  longitude: 78.4867,
};

const activeLocation: ActiveLocation = {
  name: 'Pinned Hyderabad',
  latitude: 17.385,
  longitude: 78.4867,
};

function point(overrides: Partial<PredictionForecast> = {}): PredictionForecast {
  return {
    timeOffsetHours: 0,
    label: 'Now',
    aqi: 112,
    confidence: 0.9,
    pm25: 40,
    pm10: 60,
    no2: 25,
    so2: 8,
    co: 0.5,
    o3: 42,
    dominantPollutant: 'PM2.5',
    status: 'Moderate',
    ...overrides,
  };
}

function response(overrides: Partial<PredictionsApiResponse> = {}): PredictionsApiResponse {
  return {
    predictions: [],
    method: 'heuristic-prototype',
    note: 'offline note',
    ...overrides,
  };
}

function renderOutlook(overrides: Partial<ActiveLocation> = {}): ReturnType<typeof render> {
  return render(
    <PollutionOutlook
      location={location}
      aqi={142}
      status="Unhealthy for Sensitive Groups"
      activeLocation={{ ...activeLocation, ...overrides }}
    />,
  );
}

async function expectAccessible(container: HTMLElement): Promise<void> {
  expect((await axe(container)).violations).toEqual([]);
}

beforeEach(() => {
  mocks.fetchPredictions.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PollutionOutlook', () => {
  it('shows the pinned location, current band and a loading outlook', async () => {
    let resolvePredictions: (value: PredictionsApiResponse) => void = () => {};
    const pending = new Promise<PredictionsApiResponse>((resolve) => {
      resolvePredictions = resolve;
    });
    mocks.fetchPredictions.mockReturnValue(pending);
    const { container } = renderOutlook();

    expect(screen.getByText('Hyderabad')).toBeInTheDocument();
    expect(screen.getByText('Single-point reading')).toBeInTheDocument();
    expect(screen.getByText('Now')).toBeInTheDocument();
    expect(screen.getByText('142')).toBeInTheDocument();
    expect(screen.getByText('Unhealthy for Sensitive Groups')).toBeInTheDocument();
    expect(screen.getByText('17.385, 78.487')).toBeInTheDocument();
    expect(screen.getByText('Loading outlook')).toBeInTheDocument();
    expect(screen.queryByText('Model forecast')).not.toBeInTheDocument();
    expect(screen.queryByText('Estimated')).not.toBeInTheDocument();
    expect(mocks.fetchPredictions).toHaveBeenCalledWith({ lat: 17.385, lon: 78.4867, days: 1 });
    await expectAccessible(container);

    await act(async () => {
      resolvePredictions(response({ predictions: [point()] }));
    });
    expect(screen.queryByText('Loading outlook')).not.toBeInTheDocument();
    await expectAccessible(container);
  });

  it('renders up to eight provider-forecast points with the model badge', async () => {
    mocks.fetchPredictions.mockResolvedValue(
      response({
        method: 'provider-forecast',
        note: 'dispersion model note',
        predictions: Array.from({ length: 10 }, (_, index) =>
          point({
            timeOffsetHours: index,
            label: index === 0 ? 'Now' : `${index}h`,
            aqi: 100 + index,
            status: index > 3 ? 'Unhealthy' : 'Moderate',
          }),
        ),
      }),
    );
    const { container } = renderOutlook();

    expect(await screen.findByTitle('Now: AQI 100 (Moderate)')).toBeInTheDocument();
    expect(container.textContent).toContain('Next hours');
    expect(screen.getByText('Model forecast')).toHaveAttribute('title', 'dispersion model note');
    expect(screen.getByText('Dispersion-model values, not measurements.')).toBeInTheDocument();
    expect(screen.getByTitle('7h: AQI 107 (Unhealthy)')).toBeInTheDocument();
    expect(screen.queryByTitle('8h: AQI 108 (Moderate)')).not.toBeInTheDocument();
    expect(screen.getAllByText(/^\+\d+h$/)).toHaveLength(7);
    expect(screen.getByText('now')).toBeInTheDocument();
    expect(screen.getAllByText('Good')).toHaveLength(1);
    expect(screen.getAllByText('Hazardous')).toHaveLength(1);

    await expectAccessible(container);
  });

  it('uses the estimated badge and ignores non-finite forecast values', async () => {
    mocks.fetchPredictions.mockResolvedValue(
      response({
        method: 'heuristic-prototype',
        predictions: [
          point({ timeOffsetHours: 0, label: '09:00', aqi: 78 }),
          point({ timeOffsetHours: 1, label: 'invalid', aqi: Number.NaN }),
        ],
      }),
    );
    const { container } = renderOutlook();

    expect(await screen.findByTitle('09:00: AQI 78 (Moderate)')).toBeInTheDocument();
    expect(container.textContent).toContain('Next hour');
    expect(screen.getByText('Estimated')).toHaveAttribute('title', 'offline note');
    expect(screen.getByText('Offline estimate, not a validated forecast.')).toBeInTheDocument();
    expect(screen.getByTitle('09:00: AQI 78 (Moderate)')).toBeInTheDocument();
    expect(screen.queryByTitle('invalid: AQI NaN (Moderate)')).not.toBeInTheDocument();

    await expectAccessible(container);
  });

  it('shows a service error message without inventing forecast points', async () => {
    mocks.fetchPredictions.mockRejectedValue(new Error('prediction service down'));
    const { container } = renderOutlook();

    expect(await screen.findByText('No outlook available')).toBeInTheDocument();
    expect(
      screen.getByText(/The forecast service could not be reached \(prediction service down\)\./),
    ).toBeInTheDocument();
    expect(screen.queryByText('Model forecast')).not.toBeInTheDocument();
    expect(screen.queryByText('Estimated')).not.toBeInTheDocument();

    await expectAccessible(container);
  });

  it('shows the empty state when the service returns no predictions', async () => {
    mocks.fetchPredictions.mockResolvedValue(response());
    const { container } = renderOutlook();

    expect(await screen.findByText('No outlook available')).toBeInTheDocument();
    expect(
      screen.getByText(/No forecast could be retrieved for Hyderabad\. The reading above is still current\./),
    ).toBeInTheDocument();

    await expectAccessible(container);
  });

  it('treats all non-finite predictions as an empty outlook', async () => {
    mocks.fetchPredictions.mockResolvedValue(
      response({ predictions: [point({ label: 'bad', aqi: Number.NaN })] }),
    );
    const { container } = renderOutlook();

    expect(await screen.findByText('No outlook available')).toBeInTheDocument();
    expect(screen.queryByTitle('bad: AQI NaN (Moderate)')).not.toBeInTheDocument();

    await expectAccessible(container);
  });

  it('refetches when the pinned location changes and supports name-only pins', async () => {
    mocks.fetchPredictions.mockResolvedValue(response({ predictions: [point()] }));
    const { container, rerender } = renderOutlook({ latitude: 1, longitude: 2 });

    expect(await screen.findByText('Next hour')).toBeInTheDocument();
    expect(mocks.fetchPredictions).toHaveBeenCalledTimes(1);
    expect(mocks.fetchPredictions).toHaveBeenLastCalledWith({ lat: 1, lon: 2, days: 1 });

    rerender(
      <PollutionOutlook
        location={location}
        aqi={142}
        status="Unhealthy for Sensitive Groups"
        activeLocation={{ name: 'Another pin', latitude: 3, longitude: 4 }}
      />,
    );
    await waitFor(() => expect(mocks.fetchPredictions).toHaveBeenCalledTimes(2));
    expect(mocks.fetchPredictions).toHaveBeenLastCalledWith({ lat: 3, lon: 4, days: 1 });

    rerender(
      <PollutionOutlook
        location={location}
        aqi={142}
        status="Unhealthy for Sensitive Groups"
        activeLocation={{ name: 'Name only' }}
      />,
    );
    await waitFor(() => expect(mocks.fetchPredictions).toHaveBeenCalledTimes(3));
    expect(mocks.fetchPredictions).toHaveBeenLastCalledWith({ city: 'Name only', days: 1 });

    await expectAccessible(container);
  });
});
