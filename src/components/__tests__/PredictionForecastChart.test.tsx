import { render, screen } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactNode } from 'react';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PredictionForecast } from '../../types';
import PredictionForecastChart from '../charts/PredictionForecastChart';

type MockProps = {
  children?: ReactNode;
  content?: ReactNode;
  data?: readonly unknown[];
  dataKey?: string;
  domain?: unknown;
  label?: unknown;
  y?: number;
};

const mocks = vi.hoisted(() => ({
  composedChart: vi.fn<(props: MockProps) => void>(),
  bar: vi.fn<(props: MockProps) => void>(),
  line: vi.fn<(props: MockProps) => void>(),
  xAxis: vi.fn<(props: MockProps) => void>(),
  yAxis: vi.fn<(props: MockProps) => void>(),
  referenceLine: vi.fn<(props: MockProps) => void>(),
}));

const tooltipState = vi.hoisted(() => ({
  active: false,
  payload: [] as unknown[],
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  ComposedChart: ({ children, data }: MockProps) => {
    mocks.composedChart({ data });
    return (
      <div data-testid="composed-chart" data-point-count={data?.length ?? 0}>
        {children}
      </div>
    );
  },
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  XAxis: (props: MockProps) => {
    mocks.xAxis(props);
    return null;
  },
  YAxis: (props: MockProps) => {
    mocks.yAxis(props);
    return null;
  },
  Tooltip: ({ content }: { content: ReactNode }) => {
    if (!isValidElement<Record<string, unknown>>(content)) return null;
    return (
      <div data-testid="chart-tooltip">
        {cloneElement(content, {
          active: tooltipState.active,
          payload: tooltipState.payload,
        })}
      </div>
    );
  },
  ReferenceLine: (props: MockProps) => {
    mocks.referenceLine(props);
    return <div data-testid="reference-line" data-y={props.y} />;
  },
  Bar: (props: MockProps) => {
    mocks.bar(props);
    return <div data-testid="bar" />;
  },
  Line: (props: MockProps) => {
    mocks.line(props);
    return <div data-testid="line" />;
  },
}));

function forecast(
  offset: number,
  aqi: number,
  status: PredictionForecast['status'] = 'Moderate',
): PredictionForecast {
  return {
    timeOffsetHours: offset,
    label: offset === 0 ? 'Now' : `+${offset}h`,
    aqi,
    confidence: 75,
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

describe('PredictionForecastChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tooltipState.active = false;
    tooltipState.payload = [];
  });

  it('renders an explicit empty state with no chart and no axe violations', async () => {
    const { container } = render(<PredictionForecastChart forecasts={[]} />);

    expect(screen.getByRole('heading', { name: 'AQI Forecast' })).toBeInTheDocument();
    expect(screen.getByText('No forecast points to plot.')).toBeInTheDocument();
    expect(screen.queryByTestId('composed-chart')).not.toBeInTheDocument();
    expect(screen.getByText('Predicted')).toBeInTheDocument();
    expect(screen.getByText('Trend')).toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('renders chart data, band lines, computed domain and band-coloured bars with no axe violations', async () => {
    const forecasts = [forecast(0, 78, 'Moderate'), forecast(1, 260, 'Very Unhealthy')];
    const { container } = render(<PredictionForecastChart forecasts={forecasts} />);

    expect(screen.getByText('Predicted air quality over the next 24 hours')).toBeInTheDocument();
    expect(screen.getByTestId('composed-chart')).toHaveAttribute('data-point-count', '2');
    expect(mocks.composedChart).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ aqi: 78, fill: '#F59E0B' }),
          expect.objectContaining({ aqi: 260, fill: '#8B5CF6' }),
        ]),
      }),
    );
    expect(mocks.xAxis).toHaveBeenCalledWith(expect.objectContaining({ dataKey: 'label' }));
    expect(mocks.yAxis).toHaveBeenCalledWith(expect.objectContaining({ domain: [50, 280] }));
    expect(mocks.bar).toHaveBeenCalledWith(expect.objectContaining({ dataKey: 'aqi' }));
    expect(mocks.line).toHaveBeenCalledWith(expect.objectContaining({ dataKey: 'aqi' }));
    expect(screen.getAllByTestId('reference-line')).toHaveLength(4);

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('renders the current-reading tooltip without a confidence value', async () => {
    tooltipState.active = true;
    tooltipState.payload = [{ payload: forecast(0, 42, 'Good') }];
    const { container } = render(<PredictionForecastChart forecasts={[forecast(0, 42, 'Good')]} />);

    expect(screen.getByText('Now')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText('Current reading')).toBeInTheDocument();
    expect(screen.queryByText(/confidence/)).not.toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('renders the future tooltip with the confidence value and band colour', async () => {
    tooltipState.active = true;
    tooltipState.payload = [{ payload: forecast(3, 260, 'Very Unhealthy') }];
    const { container } = render(
      <PredictionForecastChart forecasts={[forecast(3, 260, 'Very Unhealthy')]} />,
    );

    expect(screen.getByText('+3h')).toBeInTheDocument();
    expect(screen.getByText('260')).toHaveStyle({ color: 'rgb(139, 92, 246)' });
    expect(screen.getByText('Very Unhealthy')).toBeInTheDocument();
    expect(screen.getByText('75% confidence')).toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('expands the domain beyond the standard bands for very high forecasts', async () => {
    const { container } = render(
      <PredictionForecastChart forecasts={[forecast(1, 500, 'Hazardous')]} />,
    );

    expect(mocks.yAxis).toHaveBeenCalledWith(expect.objectContaining({ domain: [490, 520] }));
    expect(screen.queryAllByTestId('reference-line')).toHaveLength(0);

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
