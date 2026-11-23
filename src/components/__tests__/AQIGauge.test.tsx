import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';

import AQIGauge from '../aqi/AQIGauge';

function renderGauge(aqi: number, size?: number) {
  return render(<AQIGauge aqi={aqi} size={size} />);
}

function svg(container: HTMLElement): SVGSVGElement {
  const element = container.querySelector('svg');
  if (!element) throw new Error('Expected an SVG element');
  return element;
}

function paths(container: HTMLElement): SVGPathElement[] {
  return Array.from(container.querySelectorAll('path'));
}

function needle(container: HTMLElement): SVGLineElement {
  const line = container.querySelector('line');
  if (!line) throw new Error('Expected a needle line');
  return line;
}

async function expectNoViolations(container: HTMLElement) {
  const results = await axe(container);
  expect(results.violations).toEqual([]);
}

describe('AQIGauge', () => {
  it('renders the default 200px gauge with the AQI value and category color', async () => {
    const { container } = renderGauge(42);

    expect(svg(container)).toHaveAttribute('width', '200');
    expect(svg(container)).toHaveAttribute('height', '150');
    expect(svg(container)).toHaveAttribute('viewBox', '0 0 200 200');
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('AQI')).toBeInTheDocument();
    expect(needle(container)).toHaveAttribute('stroke', '#10B981');
    await expectNoViolations(container);
  });

  it('scales the arc, stroke and labels to a custom size', async () => {
    const { container } = renderGauge(150, 120);

    expect(svg(container)).toHaveAttribute('width', '120');
    expect(svg(container)).toHaveAttribute('height', '90');
    expect(svg(container)).toHaveAttribute('viewBox', '0 0 120 120');
    expect(Number(paths(container)[0]!.getAttribute('stroke-width'))).toBeCloseTo(7.2);
    expect(Number(screen.getByText('150').getAttribute('font-size'))).toBeCloseTo(21.6);
    expect(needle(container)).toHaveAttribute('stroke', '#F97316');
    await expectNoViolations(container);
  });

  it('omits the active arc at zero and draws it for a positive AQI', async () => {
    const { container, rerender } = renderGauge(0);

    expect(paths(container)).toHaveLength(1);
    expect(needle(container)).toHaveAttribute(
      'x2',
      String(100 + 52.5 * Math.cos((60 * Math.PI) / 180)),
    );

    rerender(<AQIGauge aqi={250} />);

    expect(paths(container)).toHaveLength(2);
    expect(paths(container)[1]).toHaveAttribute('stroke', 'url(#aqiGrad)');
    expect(needle(container)).toHaveAttribute('stroke', '#8B5CF6');
    await expectNoViolations(container);
  });

  it('clamps the geometry above 500 while still showing the supplied number', async () => {
    const { container, rerender } = renderGauge(500);
    const fullArc = paths(container)[1]?.getAttribute('d');
    const fullNeedleX = needle(container).getAttribute('x2');

    rerender(<AQIGauge aqi={900} />);

    expect(paths(container)[1]).toHaveAttribute('d', fullArc ?? '');
    expect(needle(container)).toHaveAttribute('x2', fullNeedleX ?? '');
    expect(screen.getByText('900')).toBeInTheDocument();
    await expectNoViolations(container);
  });

  it('clamps negative values to the start of the arc', async () => {
    const { container, rerender } = renderGauge(0);
    const startNeedleX = needle(container).getAttribute('x2');

    rerender(<AQIGauge aqi={-40} />);

    expect(paths(container)).toHaveLength(1);
    expect(needle(container)).toHaveAttribute('x2', startNeedleX ?? '');
    expect(screen.getByText('-40')).toBeInTheDocument();
    await expectNoViolations(container);
  });

  it.each([
    [0, '#10B981'],
    [50, '#10B981'],
    [51, '#F59E0B'],
    [100, '#F59E0B'],
    [101, '#F97316'],
    [150, '#F97316'],
    [151, '#EF4444'],
    [200, '#EF4444'],
    [201, '#8B5CF6'],
    [300, '#8B5CF6'],
    [301, '#991B1B'],
    [500, '#991B1B'],
  ])('uses %s AQI category color', async (aqi, color) => {
    const { container } = renderGauge(aqi);

    expect(needle(container)).toHaveAttribute('stroke', color);
    expect(screen.getByText(String(aqi))).toHaveAttribute('fill', color);
    await expectNoViolations(container);
  });

  it('exposes the six gradient stops used by the active arc', async () => {
    const { container } = renderGauge(120);

    const stops = Array.from(container.querySelectorAll('stop'));
    expect(stops.map(stop => stop.getAttribute('stop-color'))).toEqual([
      '#10B981',
      '#F59E0B',
      '#F97316',
      '#EF4444',
      '#8B5CF6',
      '#991B1B',
    ]);
    await expectNoViolations(container);
  });

  it('renders two gauges side by side with a repeated gradient id and no axe violations', async () => {
    const { container } = render(
      <div>
        <AQIGauge aqi={30} />
        <AQIGauge aqi={170} />
      </div>,
    );

    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('170')).toBeInTheDocument();
    expect(container.querySelectorAll('#aqiGrad')).toHaveLength(2);

    await expectNoViolations(container);
  });
});
