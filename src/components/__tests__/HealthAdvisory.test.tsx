import { render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';

import type { AQIStatus } from '../../types';
import HealthAdvisory from '../aqi/HealthAdvisory';

const statusTitles: ReadonlyArray<readonly [AQIStatus, string]> = [
  ['Good', 'Air Quality is Good'],
  ['Moderate', 'Moderate Air Quality'],
  ['Unhealthy for Sensitive Groups', 'Caution for Sensitive Groups'],
  ['Unhealthy', 'Unhealthy Air Quality'],
  ['Very Unhealthy', 'Very Unhealthy — Avoid Outdoors'],
  ['Hazardous', 'Hazardous — Stay Indoors'],
];

function renderedTips() {
  return within(screen.getByRole('list')).getAllByRole('listitem').map((item) => item.textContent);
}

describe('HealthAdvisory', () => {
  it.each(statusTitles)('renders the %s title, AQI line, advisory text and no axe violations', async (status, title) => {
    const { container } = render(
      <HealthAdvisory status={status} advisory="Limit prolonged outdoor exertion." aqi={75} />
    );

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(`AQI 75 • ${status}`)).toBeInTheDocument();
    expect(screen.getByText('Limit prolonged outdoor exertion.')).toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('shows two safe-activity tips when AQI is at or below 100', async () => {
    const { container } = render(
      <HealthAdvisory status="Moderate" advisory="Sensitive people should take care." aqi={100} />
    );

    expect(renderedTips()).toEqual([
      'Air quality is safe for outdoor activities',
      'Good time for outdoor exercise',
    ]);
    expect(screen.queryByText('Wear an N95 mask outdoors')).not.toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('shows three mask/purifier tips when AQI is just above 100', async () => {
    render(<HealthAdvisory status="Unhealthy for Sensitive Groups" advisory="Take care." aqi={101} />);

    expect(renderedTips()).toEqual([
      'Wear an N95 mask outdoors',
      'Good time for outdoor exercise',
      'Use air purifiers indoors',
    ]);
    expect(screen.queryByText('Keep windows closed')).not.toBeInTheDocument();
  });

  it('adds the keep-windows tip when AQI exceeds 150', async () => {
    const { container } = render(
      <HealthAdvisory status="Unhealthy" advisory="Avoid outdoor exertion." aqi={151} />
    );

    expect(renderedTips()).toEqual([
      'Wear an N95 mask outdoors',
      'Keep windows closed',
      'Use air purifiers indoors',
    ]);

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('keeps the three-tip list even above AQI 200, so the postpone-events tip is unreachable', async () => {
    render(<HealthAdvisory status="Hazardous" advisory="Stay indoors." aqi={201} />);

    expect(renderedTips()).toEqual([
      'Wear an N95 mask outdoors',
      'Keep windows closed',
      'Use air purifiers indoors',
    ]);
    expect(screen.queryByText('Postpone outdoor events')).not.toBeInTheDocument();
  });
});
