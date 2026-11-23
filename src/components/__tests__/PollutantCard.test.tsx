import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';

import PollutantCard from '../aqi/PollutantCard';
import type { AQIStatus, PollutantDetail } from '../../types';

function makePollutant(overrides: Partial<PollutantDetail> = {}): PollutantDetail {
  return {
    id: 'pm25',
    name: 'PM2.5',
    value: 20,
    unit: 'µg/m³',
    status: 'Good',
    description: 'Fine particulate matter',
    safeLimit: 50,
    ...overrides,
  };
}

function bar(container: HTMLElement): HTMLElement {
  const element = container.querySelector<HTMLElement>('[style]');
  if (!element) throw new Error('Expected a progress bar with inline width');
  return element;
}

async function expectNoViolations(container: HTMLElement) {
  const results = await axe(container);
  expect(results.violations).toEqual([]);
}

describe('PollutantCard', () => {
  it('renders pollutant details, a safe-limit label and a proportional bar', async () => {
    const { container } = render(<PollutantCard pollutant={makePollutant()} />);

    expect(screen.getByText('PM2.5')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('µg/m³')).toBeInTheDocument();
    expect(screen.getByText('Fine particulate matter')).toBeInTheDocument();
    expect(screen.getByText('Safe limit: 50 µg/m³')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(bar(container)).toHaveStyle({ width: '40%' });
    expect(bar(container)).toHaveClass('bg-orange-400');
    await expectNoViolations(container);
  });

  it('caps the bar at 100% and marks any over-limit reading as High', async () => {
    const { container } = render(
      <PollutantCard pollutant={makePollutant({ value: 180, safeLimit: 50, status: 'Unhealthy' })} />
    );

    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.queryByText('Good')).not.toBeInTheDocument();
    expect(bar(container)).toHaveStyle({ width: '100%' });
    expect(bar(container)).toHaveClass('bg-orange-400');
    await expectNoViolations(container);
  });

  it('uses the orange override as soon as the reading exceeds the safe limit', async () => {
    const { container } = render(
      <PollutantCard pollutant={makePollutant({ id: 'o3', value: 51, safeLimit: 50 })} />
    );

    expect(bar(container)).toHaveClass('bg-orange-400');
    expect(bar(container)).not.toHaveClass('bg-teal-400');
    await expectNoViolations(container);
  });

  it.each([
    ['pm25', 'bg-orange-400'],
    ['pm10', 'bg-amber-400'],
    ['no2', 'bg-blue-400'],
    ['so2', 'bg-yellow-400'],
    ['co', 'bg-red-400'],
    ['o3', 'bg-teal-400'],
    ['unknown', 'bg-slate-400'],
  ])('colors the %s bar with %s', async (id, color) => {
    const { container } = render(<PollutantCard pollutant={makePollutant({ id })} />);

    expect(bar(container)).toHaveClass(color);
    expect(bar(container)).toHaveStyle({ width: '40%' });
    await expectNoViolations(container);
  });

  it.each<[AQIStatus, string, string]>([
    ['Good', 'Good', 'bg-emerald-100'],
    ['Moderate', 'High', 'bg-amber-100'],
    ['Unhealthy for Sensitive Groups', 'High', 'bg-amber-100'],
    ['Unhealthy', 'High', 'bg-red-100'],
    ['Very Unhealthy', 'High', 'bg-purple-100'],
    ['Hazardous', 'High', 'bg-red-100'],
  ])('maps %s status to the %s badge with %s styling', async (status, label, color) => {
    const { container } = render(<PollutantCard pollutant={makePollutant({ status })} />);

    expect(screen.getByText(label)).toHaveClass(color);
    expect(screen.getByText(label)).toHaveClass('text-[10px]');
    await expectNoViolations(container);
  });

  it('renders a full bar for a zero safe limit', async () => {
    const { container } = render(<PollutantCard pollutant={makePollutant({ value: 10, safeLimit: 0 })} />);

    expect(bar(container)).toHaveStyle({ width: '100%' });
    expect(bar(container)).toHaveClass('bg-orange-400');
    await expectNoViolations(container);
  });

  it('drops the invalid negative width for a negative reading', async () => {
    const { container } = render(<PollutantCard pollutant={makePollutant({ value: -10, safeLimit: 50 })} />);
    const negativeBar = container.querySelector<HTMLElement>('div.h-full.rounded-full');

    expect(negativeBar).not.toBeNull();
    expect(negativeBar).not.toHaveAttribute('style');
    expect(negativeBar).toHaveClass('bg-orange-400');
    await expectNoViolations(container);
  });
});
