import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActiveLocation } from '../../context/LocationContext';
import type { AQIStatus, LocationInfo, PredictionForecast } from '../../types';
import PollutionOutlook from '../aqi/PollutionOutlook';

const mocks = vi.hoisted(() => ({ fetchPredictions: vi.fn() }));

vi.mock('../../services/backendService', () => ({ fetchPredictions: mocks.fetchPredictions }));

const location: LocationInfo = {
  name: 'Delhi',
  latitude: 28.6139,
  longitude: 77.209,
  region: 'Delhi',
  country: 'India',
};

const activeLocation: ActiveLocation = {
  name: 'Delhi',
  latitude: 28.6139,
  longitude: 77.209,
};

function forecast(offset: number, aqi: number, status: AQIStatus = 'Moderate'): PredictionForecast {
  return {
    timeOffsetHours: offset,
    label: offset === 0 ? 'Now' : `+${offset}h`,
    aqi,
    confidence: 80,
    pm25: 20,
    pm10: 30,
    no2: 10,
    so2: 5,
    co: 1,
    o3: 12,
    dominantPollutant: 'PM2.5',
    status,
  };
}

function deferred<T>() {
  let resolveValue: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolveValue = resolve;
  });
  return { promise, resolve: resolveValue };
}

function renderOutlook(overrides: Partial<ActiveLocation> = {}) {
  return render(
    <PollutionOutlook
      location={location}
      aqi={112}
      status="Unhealthy for Sensitive Groups"
      activeLocation={{ ...activeLocation, ...overrides }}
    />
  );
}

describe('PollutionOutlook', () => {
  beforeEach(() => {
    mocks.fetchPredictions.mockReset().mockResolvedValue({
      predictions: [],
      method: 'heuristic-prototype',
      note: '',
    });
  });

  it('shows an explicit loading state and no axe violations while the forecast is pending', async () => {
    const pending = deferred<{ predictions: PredictionForecast[]; method: string; note: string }>();
    mocks.fetchPredictions.mockReturnValue(pending.promise);
    const { container } = renderOutlook();

    expect(screen.getByText('Loading outlook')).toBeInTheDocument();
    expect(screen.queryByText('No outlook available')).not.toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('renders up to eight finite model points with confidence note, labels and legend', async () => {
    mocks.fetchPredictions.mockResolvedValue({
      predictions: [
        ...Array.from({ length: 9 }, (_, index) => forecast(index, 60 + index * 10)),
        forecast(9, Number.NaN),
      ],
      method: 'provider-forecast',
      note: 'Dispersion model from provider',
    });
    const { container } = renderOutlook();

    expect(await screen.findByText('Model forecast')).toBeInTheDocument();
    expect(screen.getByText('Model forecast')).toHaveAttribute('title', 'Dispersion model from provider');
    expect(screen.getByText('Next hours')).toBeInTheDocument();
    expect(screen.queryByText('Next 8 hours')).not.toBeInTheDocument();
    expect(screen.getByText(/Dispersion-model values, not measurements/)).toBeInTheDocument();
    expect(screen.getByText('now')).toBeInTheDocument();
    expect(screen.getByText('+1h')).toBeInTheDocument();
    expect(screen.queryByText('+8h')).not.toBeInTheDocument();
    expect(screen.queryByText('+9h')).not.toBeInTheDocument();
    expect(screen.getByText('28.614, 77.209')).toBeInTheDocument();
    expect(screen.getByText('Single-point reading')).toBeInTheDocument();
    for (const label of ['Good', 'Moderate', 'Unhealthy (SG)', 'Unhealthy', 'Very Unhealthy', 'Hazardous']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('marks heuristic points as estimated and uses singular hour wording', async () => {
    mocks.fetchPredictions.mockResolvedValue({
      predictions: [forecast(0, 78, 'Moderate')],
      method: 'heuristic-prototype',
      note: 'Offline heuristic',
    });
    const { container } = renderOutlook();

    expect(await screen.findByText('Estimated')).toBeInTheDocument();
    expect(screen.getByText('Estimated')).toHaveAttribute('title', 'Offline heuristic');
    expect(screen.getByText('Next hour')).toBeInTheDocument();
    expect(screen.getByText(/Offline estimate, not a validated forecast/)).toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('keeps the current reading visible when no predictions are returned', async () => {
    const { container } = renderOutlook();

    expect(await screen.findByText('No outlook available')).toBeInTheDocument();
    expect(screen.getByText(/No forecast could be retrieved for Delhi/)).toBeInTheDocument();
    expect(screen.getByText('112')).toBeInTheDocument();
    expect(screen.queryByText('Next hour')).not.toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('surfaces fetch failures in the no-outlook message', async () => {
    mocks.fetchPredictions.mockRejectedValue(new Error('service unreachable'));
    const { container } = renderOutlook();

    expect(await screen.findByText('No outlook available')).toBeInTheDocument();
    expect(screen.getByText(/service unreachable/)).toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('treats a non-array predictions field as an empty forecast', async () => {
    mocks.fetchPredictions.mockResolvedValue({ predictions: 'unexpected', method: 42, note: 7 });
    renderOutlook();

    expect(await screen.findByText('No outlook available')).toBeInTheDocument();
    expect(screen.queryByText('Estimated')).not.toBeInTheDocument();
    expect(screen.queryByText('Model forecast')).not.toBeInTheDocument();
  });

  it('refetches for a new pinned point and sends city-only params when coordinates are absent', async () => {
    mocks.fetchPredictions.mockResolvedValueOnce({
      predictions: [],
      method: 'heuristic-prototype',
      note: '',
    });
    const { rerender } = renderOutlook();
    await waitFor(() => expect(mocks.fetchPredictions).toHaveBeenCalledWith({
      lat: 28.6139,
      lon: 77.209,
      city: undefined,
      days: 1,
    }));

    rerender(
      <PollutionOutlook
        location={{ ...location, name: 'Pune', latitude: 18.52, longitude: 73.86 }}
        aqi={40}
        status="Good"
        activeLocation={{ name: 'Pune' }}
      />
    );

    await waitFor(() => expect(mocks.fetchPredictions).toHaveBeenLastCalledWith({
      lat: undefined,
      lon: undefined,
      city: 'Pune',
      days: 1,
    }));
    expect(mocks.fetchPredictions).toHaveBeenCalledTimes(2);
    expect(screen.getByText('18.520, 73.860')).toBeInTheDocument();
    expect(screen.getByText('Pune')).toBeInTheDocument();
  });

  const bands: ReadonlyArray<readonly [number, AQIStatus, string]> = [
    [50, 'Good', 'rgb(16, 185, 129)'],
    [100, 'Moderate', 'rgb(245, 158, 11)'],
    [150, 'Unhealthy for Sensitive Groups', 'rgb(249, 115, 22)'],
    [200, 'Unhealthy', 'rgb(239, 68, 68)'],
    [300, 'Very Unhealthy', 'rgb(139, 92, 246)'],
    [301, 'Hazardous', 'rgb(127, 29, 29)'],
  ];

  it.each(bands)('colours the now value for AQI %i', async (aqi, status, color) => {
    render(
      <PollutionOutlook
        location={location}
        aqi={aqi}
        status={status}
        activeLocation={activeLocation}
      />
    );

    expect(await screen.findByText('No outlook available')).toBeInTheDocument();
    expect(screen.getByText(String(aqi))).toHaveStyle({ color });
    expect(screen.getAllByText(status).length).toBeGreaterThan(0);
  });

  it('does not offer a refresh or location action inside the panel', async () => {
    const user = userEvent.setup();
    renderOutlook();
    await screen.findByText('No outlook available');

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await user.click(document.body);
    expect(mocks.fetchPredictions).toHaveBeenCalledTimes(1);
  });
});
