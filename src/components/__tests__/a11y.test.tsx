import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';

import AQIGauge from '../aqi/AQIGauge';
import PollutantCard from '../aqi/PollutantCard';
import { MobileMenuButton } from '../layout/Sidebar';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Input';
import ForecastTable from '../../pages/predictions/ForecastTable';
import type { PollutantDetail, PredictionForecast } from '../../types';

describe('core UI accessibility', () => {
  it('exposes labelled controls and has no axe violations', async () => {
    const { container } = render(
      <form aria-label="Location search">
        <Label htmlFor="city">City</Label>
        <Input id="city" placeholder="Search for a city" />
        <Button type="submit">Search</Button>
        <Button type="button" aria-label="Use my current location">
          <span aria-hidden="true">◎</span>
        </Button>
      </form>,
    );

    expect(screen.getByRole('textbox', { name: 'City' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use my current location' })).toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('detects an unlabelled icon-only button', async () => {
    const { container } = render(
      <button type="button">
        <span aria-hidden="true">×</span>
      </button>,
    );

    const results = await axe(container);
    expect(results.violations.map((v) => v.id)).toContain('button-name');
  });
});

describe('application component accessibility', () => {
  it('labels the AQI gauge', async () => {
    const { container } = render(<AQIGauge aqi={142} />);

    expect(screen.getByRole('img', { name: 'Air Quality Index: 142' })).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });

  it('exposes pollutant progress state', async () => {
    const pollutant: PollutantDetail = {
      id: 'pm25',
      name: 'PM2.5',
      value: 48,
      unit: 'µg/m³',
      status: 'Moderate',
      description: 'Fine particulate matter',
      safeLimit: 35,
    };
    const { container } = render(<PollutantCard pollutant={pollutant} />);

    expect(screen.getByRole('progressbar', { name: 'PM2.5 level' })).toHaveAttribute(
      'aria-valuetext',
      '48 µg/m³, safe limit 35 µg/m³',
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it('exposes mobile menu expansion state', async () => {
    const { container } = render(<MobileMenuButton expanded={false} onClick={() => {}} />);

    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect((await axe(container)).violations).toEqual([]);
  });

  it('names the forecast table', async () => {
    const forecast: PredictionForecast = {
      timeOffsetHours: 0,
      label: 'Now',
      aqi: 72,
      confidence: 0.8,
      pm25: 18,
      pm10: 30,
      no2: 20,
      so2: 5,
      co: 0.4,
      o3: 40,
      dominantPollutant: 'PM2.5',
      status: 'Moderate',
    };
    const { container } = render(<ForecastTable forecasts={[forecast]} />);

    expect(screen.getByRole('table', { name: 'Detailed AQI forecast matrix' })).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);
  });
});
