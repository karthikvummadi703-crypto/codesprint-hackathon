import { render, screen, within } from '@testing-library/react';
import { cloneElement, isValidElement, type ReactNode } from 'react';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HistoricalDataPoint } from '../../types';
import AQITrendChart from '../charts/AQITrendChart';

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
  areaChart: vi.fn(),
  xAxis: vi.fn(),
  yAxis: vi.fn(),
  referenceLine: vi.fn(),
  area: vi.fn(),
}));

const tooltipState = vi.hoisted(() => ({
  active: false,
  payload: [] as unknown[],
  label: '',
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children, data }: MockProps) => {
    mocks.areaChart({ data });
    return (
      <div data-testid="area-chart" data-point-count={data?.length ?? 0}>
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
          label: tooltipState.label,
        })}
      </div>
    );
  },
  ReferenceLine: (props: MockProps) => {
    mocks.referenceLine(props);
    return <div data-testid="reference-line" data-y={props.y} />;
  },
  Area: (props: MockProps) => {
    mocks.area(props);
    return <div data-testid="area" />;
  },
}));

const data: HistoricalDataPoint[] = [
  { time: '10:00', aqi: 112, pm25: 30, pm10: 45, no2: 12, so2: 4, co: 1, o3: 18 },
  { time: '11:00', aqi: 128, pm25: 34, pm10: 50, no2: 14, so2: 5, co: 1, o3: 20 },
];

describe('AQITrendChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tooltipState.active = false;
    tooltipState.payload = [];
    tooltipState.label = '';
  });

  it('renders the card, chart config, band lines and legend with no axe violations', async () => {
    const { container } = render(<AQITrendChart data={data} />);

    expect(screen.getByRole('heading', { name: '24-Hour AQI Trend' })).toBeInTheDocument();
    expect(screen.getByText('Hourly air quality index readings')).toBeInTheDocument();
    expect(screen.getByText('AQI Level')).toBeInTheDocument();
    expect(screen.getByTestId('area-chart')).toHaveAttribute('data-point-count', '2');
    expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
    expect(mocks.xAxis).toHaveBeenCalledWith(expect.objectContaining({ dataKey: 'time' }));
    expect(mocks.yAxis).toHaveBeenCalledWith(expect.objectContaining({ domain: [80, 180] }));
    expect(mocks.area).toHaveBeenCalledWith(
      expect.objectContaining({ dataKey: 'aqi', dot: false }),
    );
    expect(mocks.referenceLine).toHaveBeenCalledTimes(2);
    expect(mocks.referenceLine).toHaveBeenCalledWith(
      expect.objectContaining({ y: 150, stroke: '#EF4444' }),
    );
    expect(mocks.referenceLine).toHaveBeenCalledWith(
      expect.objectContaining({ y: 100, stroke: '#F59E0B' }),
    );
    expect(container.querySelector('#aqiGradient')).toBeInTheDocument();
    expect(screen.getAllByTestId('reference-line')).toHaveLength(2);

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('renders the empty data state without throwing and with no axe violations', async () => {
    const { container } = render(<AQITrendChart data={[]} />);

    expect(screen.getByTestId('area-chart')).toHaveAttribute('data-point-count', '0');
    expect(screen.getByRole('heading', { name: '24-Hour AQI Trend' })).toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('keeps the fixed 80-180 domain even when a data point is outside it', () => {
    render(<AQITrendChart data={[{ ...data[0]!, aqi: 260 }]} />);

    expect(mocks.yAxis).toHaveBeenCalledWith(expect.objectContaining({ domain: [80, 180] }));
    expect(screen.queryByText(/260 AQI/)).not.toBeInTheDocument();
  });

  it('renders no tooltip body when the tooltip is inactive', () => {
    render(<AQITrendChart data={data} />);

    const tooltip = screen.getByTestId('chart-tooltip');
    expect(within(tooltip).queryByText(/AQI/)).not.toBeInTheDocument();
  });

  it('renders the custom tooltip payload and label when active', async () => {
    tooltipState.active = true;
    tooltipState.payload = [{ value: 142 }];
    tooltipState.label = '13:00';
    const { container } = render(<AQITrendChart data={data} />);

    expect(screen.getByText('13:00')).toBeInTheDocument();
    expect(screen.getByText('142 AQI')).toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
