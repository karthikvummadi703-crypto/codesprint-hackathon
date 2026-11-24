import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { cloneElement, createElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { HistoricalDataPoint, PredictionForecast } from '../../../types';
import AQITrendChart from '../AQITrendChart';
import PredictionForecastChart from '../PredictionForecastChart';
import PollutantTrendChart from '../PollutantTrendChart';

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children?: ReactElement<{ width?: number; height?: number }> }) =>
      createElement(
        'div',
        { 'data-testid': 'responsive-container', style: { width: 600, height: 240 } },
        children ? cloneElement(children, { width: 600, height: 240 }) : null,
      ),
  };
});

function history(): HistoricalDataPoint[] {
  return [
    { time: '00:00', aqi: 92, pm25: 32, pm10: 54, no2: 18, so2: 4, co: 0.3, o3: 30 },
    { time: '01:00', aqi: 126, pm25: 44, pm10: 71, no2: 24, so2: 6, co: 0.4, o3: 38 },
    { time: '02:00', aqi: 158, pm25: 58, pm10: 88, no2: 31, so2: 7, co: 0.5, o3: 45 },
  ];
}

function forecasts(): PredictionForecast[] {
  return [
    {
      timeOffsetHours: 0,
      label: 'Now',
      aqi: 42,
      confidence: 1,
      pm25: 12,
      pm10: 22,
      no2: 10,
      so2: 3,
      co: 0.2,
      o3: 25,
      dominantPollutant: 'PM2.5',
      status: 'Good',
    },
    {
      timeOffsetHours: 1,
      label: '+1h',
      aqi: 118,
      confidence: 0.85,
      pm25: 40,
      pm10: 62,
      no2: 22,
      so2: 5,
      co: 0.4,
      o3: 36,
      dominantPollutant: 'PM2.5',
      status: 'Unhealthy for Sensitive Groups',
    },
    {
      timeOffsetHours: 2,
      label: '+2h',
      aqi: 320,
      confidence: 0.6,
      pm25: 150,
      pm10: 210,
      no2: 70,
      so2: 20,
      co: 1.2,
      o3: 90,
      dominantPollutant: 'PM2.5',
      status: 'Hazardous',
    },
  ];
}

async function expectAccessible(container: HTMLElement): Promise<void> {
  expect((await axe(container)).violations).toEqual([]);
}

describe('AQITrendChart', () => {
  it('renders the area chart, health reference lines and legend', async () => {
    const { container } = render(<AQITrendChart data={history()} />);

    expect(screen.getByRole('heading', { name: '24-Hour AQI Trend' })).toBeInTheDocument();
    expect(screen.getByText('Hourly air quality index readings')).toBeInTheDocument();
    expect(screen.getByText('AQI Level')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelectorAll('.recharts-area')).toHaveLength(1));
    expect(container.textContent).toContain('Moderate');
    expect(container.textContent).toContain('Unhealthy');

    await expectAccessible(container);
  });

  it('renders an empty chart shell when there are no readings', async () => {
    const { container } = render(<AQITrendChart data={[]} />);

    expect(screen.getByRole('heading', { name: '24-Hour AQI Trend' })).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelectorAll('.recharts-cartesian-axis')).toHaveLength(2));
    expect(container.querySelectorAll('.recharts-area')).toHaveLength(0);

    await expectAccessible(container);
  });
});

describe('PollutantTrendChart', () => {
  it('starts with PM2.5 and PM10 enabled', async () => {
    const { container } = render(<PollutantTrendChart data={history()} />);

    expect(screen.getByRole('heading', { name: 'Pollutant Trend' })).toBeInTheDocument();
    expect(screen.getByText('24-hour individual pollutant levels')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PM2.5' })).toHaveClass('text-white');
    expect(screen.getByRole('button', { name: 'PM10' })).toHaveClass('text-white');
    expect(screen.getByRole('button', { name: 'NO₂' })).toHaveClass('bg-slate-100');
    expect(screen.getByRole('button', { name: 'O₃' })).toHaveClass('bg-slate-100');
    await waitFor(() => expect(container.querySelectorAll('.recharts-line')).toHaveLength(2));

    await expectAccessible(container);
  });

  it('toggles pollutant series on and off', async () => {
    const user = userEvent.setup();
    const { container } = render(<PollutantTrendChart data={history()} />);

    await waitFor(() => expect(container.querySelectorAll('.recharts-line')).toHaveLength(2));

    await user.click(screen.getByRole('button', { name: 'PM2.5' }));
    await waitFor(() => expect(container.querySelectorAll('.recharts-line')).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'PM2.5' })).toHaveClass('bg-slate-100');

    await user.click(screen.getByRole('button', { name: 'NO₂' }));
    await user.click(screen.getByRole('button', { name: 'O₃' }));
    await waitFor(() => expect(container.querySelectorAll('.recharts-line')).toHaveLength(3));
    expect(screen.getByRole('button', { name: 'NO₂' })).toHaveClass('text-white');
    expect(screen.getByRole('button', { name: 'O₃' })).toHaveClass('text-white');

    await user.click(screen.getByRole('button', { name: 'PM10' }));
    await waitFor(() => expect(container.querySelectorAll('.recharts-line')).toHaveLength(2));

    await expectAccessible(container);
  });

  it('renders no series when every pollutant is toggled off', async () => {
    const user = userEvent.setup();
    const { container } = render(<PollutantTrendChart data={history()} />);

    await waitFor(() => expect(container.querySelectorAll('.recharts-line')).toHaveLength(2));
    for (const label of ['PM2.5', 'PM10']) {
      await user.click(screen.getByRole('button', { name: label }));
    }

    await waitFor(() => expect(container.querySelectorAll('.recharts-line')).toHaveLength(0));
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();

    await expectAccessible(container);
  });

  it('renders an empty chart shell when there are no readings', async () => {
    const { container } = render(<PollutantTrendChart data={[]} />);

    expect(screen.getByRole('heading', { name: 'Pollutant Trend' })).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelectorAll('.recharts-cartesian-axis')).toHaveLength(2));
    expect(container.querySelectorAll('.recharts-line')).toHaveLength(0);

    await expectAccessible(container);
  });
});

describe('PredictionForecastChart', () => {
  it('renders bars, trend line, legend and band lines for high AQI values', async () => {
    const { container } = render(<PredictionForecastChart forecasts={forecasts()} />);

    expect(screen.getByRole('heading', { name: 'AQI Forecast' })).toBeInTheDocument();
    expect(screen.getByText('Predicted air quality over the next 24 hours')).toBeInTheDocument();
    expect(screen.getByText('Predicted')).toBeInTheDocument();
    expect(screen.getByText('Trend')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(3));
    expect(container.querySelectorAll('.recharts-line')).toHaveLength(1);
    expect(container.textContent).toContain('Sensitive groups');

    await expectAccessible(container);
  });

  it('shows an explicit empty state when there are no forecast points', async () => {
    const { container } = render(<PredictionForecastChart forecasts={[]} />);

    expect(screen.getByText('No forecast points to plot.')).toBeInTheDocument();
    expect(screen.queryByTestId('responsive-container')).not.toBeInTheDocument();

    await expectAccessible(container);
  });
});
