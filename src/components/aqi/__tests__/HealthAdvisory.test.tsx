import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import type { AQIStatus } from '../../../types';
import HealthAdvisory from '../HealthAdvisory';

const statusCases: ReadonlyArray<readonly [AQIStatus, string]> = [
  ['Good', 'Air Quality is Good'],
  ['Moderate', 'Moderate Air Quality'],
  ['Unhealthy for Sensitive Groups', 'Caution for Sensitive Groups'],
  ['Unhealthy', 'Unhealthy Air Quality'],
  ['Very Unhealthy', 'Very Unhealthy — Avoid Outdoors'],
  ['Hazardous', 'Hazardous — Stay Indoors'],
];

async function expectAccessible(container: HTMLElement): Promise<void> {
  expect((await axe(container)).violations).toEqual([]);
}

describe('HealthAdvisory', () => {
  it.each(statusCases)('renders the %s status advisory', async (status, title) => {
    const { container } = render(
      <HealthAdvisory status={status} advisory={`Advisory text for ${status}.`} aqi={120} />,
    );

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(`Advisory text for ${status}.`)).toBeInTheDocument();
    expect(screen.getByText(`AQI 120 • ${status}`)).toBeInTheDocument();

    await expectAccessible(container);
  });

  it('shows two reassuring tips for good air quality', async () => {
    const { container } = render(<HealthAdvisory status="Good" advisory="Enjoy the clean air." aqi={42} />);

    expect(screen.getByText('Air quality is safe for outdoor activities')).toBeInTheDocument();
    expect(screen.getByText('Good time for outdoor exercise')).toBeInTheDocument();
    expect(screen.queryByText('Wear an N95 mask outdoors')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);

    await expectAccessible(container);
  });

  it('shows the protective three-tip set above AQI 100', async () => {
    const { container } = render(
      <HealthAdvisory
        status="Unhealthy for Sensitive Groups"
        advisory="Sensitive groups should limit exertion."
        aqi={120}
      />,
    );

    expect(screen.getByText('Wear an N95 mask outdoors')).toBeInTheDocument();
    expect(screen.getByText('Use air purifiers indoors')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);

    await expectAccessible(container);
  });

  it('switches from outdoor exercise to closed windows above AQI 150', async () => {
    const { container } = render(
      <HealthAdvisory status="Unhealthy" advisory="Limit time outdoors." aqi={165} />,
    );

    expect(screen.getByText('Keep windows closed')).toBeInTheDocument();
    expect(screen.getByText('Wear an N95 mask outdoors')).toBeInTheDocument();
    expect(screen.getByText('Use air purifiers indoors')).toBeInTheDocument();
    expect(screen.queryByText('Good time for outdoor exercise')).not.toBeInTheDocument();

    await expectAccessible(container);
  });

  it('never shows the fourth tip, even for hazardous air', async () => {
    const { container } = render(<HealthAdvisory status="Hazardous" advisory="Stay indoors." aqi={320} />);

    expect(screen.getByText('Hazardous — Stay Indoors')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByText('Postpone outdoor events')).not.toBeInTheDocument();

    await expectAccessible(container);
  });

  it('treats AQI 100 as safe and AQI 101 as protective', async () => {
    const { container } = render(
      <div>
        <HealthAdvisory status="Moderate" advisory="At the boundary." aqi={100} />
        <HealthAdvisory status="Moderate" advisory="Just over the boundary." aqi={101} />
      </div>,
    );

    expect(screen.getByText('Air quality is safe for outdoor activities')).toBeInTheDocument();
    expect(screen.getByText('Wear an N95 mask outdoors')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);

    await expectAccessible(container);
  });
});
