import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HistoricalDataPoint } from '../../types';
import PollutantTrendChart from '../charts/PollutantTrendChart';

type MockProps = {
  children?: ReactNode;
  data?: readonly unknown[];
  dataKey?: string;
  contentStyle?: unknown;
};

const mocks = vi.hoisted(() => ({
  lineChart: vi.fn<(props: MockProps) => void>(),
  line: vi.fn<(props: MockProps) => void>(),
  xAxis: vi.fn<(props: MockProps) => void>(),
  yAxis: vi.fn<(props: MockProps) => void>(),
  tooltip: vi.fn<(props: MockProps) => void>(),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children, data }: MockProps) => {
    mocks.lineChart({ data });
    return (
      <div data-testid="line-chart" data-point-count={data?.length ?? 0}>
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
  Tooltip: (props: MockProps) => {
    mocks.tooltip(props);
    return <div data-testid="chart-tooltip" />;
  },
  Line: (props: MockProps) => {
    mocks.line(props);
    return <div data-testid="line" data-key={props.dataKey} />;
  },
}));

const data: HistoricalDataPoint[] = [
  { time: '10:00', aqi: 110, pm25: 30, pm10: 45, no2: 12, so2: 4, co: 1, o3: 18 },
  { time: '11:00', aqi: 128, pm25: 34, pm10: 50, no2: 14, so2: 5, co: 1, o3: 20 },
];

function lineKeys() {
  return screen.getAllByTestId('line').map(node => node.getAttribute('data-key'));
}

describe('PollutantTrendChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the card, default active lines and tooltip config with no axe violations', async () => {
    const { container } = render(<PollutantTrendChart data={data} />);

    expect(screen.getByRole('heading', { name: 'Pollutant Trend' })).toBeInTheDocument();
    expect(screen.getByText('24-hour individual pollutant levels')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PM2.5' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'NO₂' })).toBeEnabled();
    expect(lineKeys()).toEqual(['pm25', 'pm10']);
    expect(screen.getAllByTestId('line')).toHaveLength(2);
    expect(screen.getByTestId('line-chart')).toHaveAttribute('data-point-count', '2');
    expect(mocks.lineChart).toHaveBeenCalledWith({ data });
    expect(mocks.xAxis).toHaveBeenCalledWith(expect.objectContaining({ dataKey: 'time' }));
    expect(mocks.tooltip).toHaveBeenCalledWith(
      expect.objectContaining({ contentStyle: expect.any(Object) }),
    );

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('toggles a pollutant line off and back on with the mouse', async () => {
    const user = userEvent.setup();
    const { container } = render(<PollutantTrendChart data={data} />);

    await user.click(screen.getByRole('button', { name: 'PM2.5' }));
    expect(lineKeys()).toEqual(['pm10']);
    expect(screen.getByRole('button', { name: 'PM2.5' })).not.toHaveStyle({
      backgroundColor: 'rgb(249, 115, 22)',
    });

    await user.click(screen.getByRole('button', { name: 'PM2.5' }));
    expect(lineKeys()).toEqual(['pm25', 'pm10']);
    expect(screen.getByRole('button', { name: 'PM2.5' })).toHaveStyle({
      backgroundColor: 'rgb(249, 115, 22)',
    });

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('supports Space and Enter on the toggle pills', async () => {
    const user = userEvent.setup();
    render(<PollutantTrendChart data={data} />);

    await user.tab();
    const pm25Button = screen.getByRole('button', { name: 'PM2.5' });
    expect(pm25Button).toHaveFocus();
    await user.keyboard(' ');
    expect(lineKeys()).toEqual(['pm10']);
    await user.keyboard('{Enter}');
    expect(lineKeys()).toEqual(['pm25', 'pm10']);
  });

  it('can toggle lines off and select other pollutants', async () => {
    const user = userEvent.setup();
    const { container } = render(<PollutantTrendChart data={data} />);

    await user.click(screen.getByRole('button', { name: 'PM2.5' }));
    await user.click(screen.getByRole('button', { name: 'PM10' }));
    await user.click(screen.getByRole('button', { name: 'NO₂' }));
    await user.click(screen.getByRole('button', { name: 'O₃' }));

    expect(lineKeys()).toEqual(['no2', 'o3']);

    await user.click(screen.getByRole('button', { name: 'PM10' }));
    expect(lineKeys()).toEqual(['pm10', 'no2', 'o3']);

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('keeps the controls usable with empty data and does not expose aria-pressed state', async () => {
    const { container } = render(<PollutantTrendChart data={[]} />);

    expect(screen.getByTestId('line-chart')).toHaveAttribute('data-point-count', '0');
    for (const name of ['PM2.5', 'PM10', 'NO₂', 'O₃']) {
      expect(screen.getByRole('button', { name })).not.toHaveAttribute('aria-pressed');
    }

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
