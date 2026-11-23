import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';

import type { AQIStatus } from '../../types';
import { Badge, getAQIBadgeVariant, getAQIColor, getAQITextColor } from '../ui/Badge';

const variants = [
  ['default', 'bg-slate-100', 'text-slate-700'],
  ['success', 'bg-emerald-100', 'text-emerald-800'],
  ['warning', 'bg-amber-100', 'text-amber-800'],
  ['danger', 'bg-red-100', 'text-red-800'],
  ['purple', 'bg-purple-100', 'text-purple-800'],
  ['blue', 'bg-blue-100', 'text-blue-800'],
] as const;

describe('Badge', () => {
  it.each(variants)('renders the %s variant with no axe violations', async (variant, bg, text) => {
    const { container } = render(<Badge variant={variant}>{variant}</Badge>);

    const badge = screen.getByText(variant);
    expect(badge.tagName).toBe('SPAN');
    expect(badge).toHaveClass(bg, text, 'rounded-full');

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('uses the default variant and forwards HTML attributes and merged class names', async () => {
    const { container } = render(
      <Badge className="text-[10px]" title="Forecast note" data-testid="aqi-badge">
        Estimated
      </Badge>
    );

    const badge = screen.getByTestId('aqi-badge');
    expect(badge).toHaveTextContent('Estimated');
    expect(badge).toHaveClass('bg-slate-100', 'text-slate-700', 'text-[10px]');
    expect(badge).toHaveAttribute('title', 'Forecast note');

    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it('maps every AQI status to its badge variant', () => {
    const expected: ReadonlyArray<readonly [AQIStatus, string]> = [
      ['Good', 'success'],
      ['Moderate', 'warning'],
      ['Unhealthy for Sensitive Groups', 'warning'],
      ['Unhealthy', 'danger'],
      ['Very Unhealthy', 'purple'],
      ['Hazardous', 'danger'],
    ];

    for (const [status, variant] of expected) {
      expect(getAQIBadgeVariant(status)).toBe(variant);
    }
  });

  it('returns the expected colours at every AQI band boundary', () => {
    const expected: ReadonlyArray<readonly [number, string]> = [
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
    ];

    for (const [aqi, color] of expected) {
      expect(getAQIColor(aqi)).toBe(color);
    }
  });

  it('returns the expected text-colour classes at every AQI band boundary', () => {
    const expected: ReadonlyArray<readonly [number, string]> = [
      [50, 'text-emerald-600'],
      [51, 'text-amber-600'],
      [100, 'text-amber-600'],
      [101, 'text-orange-600'],
      [150, 'text-orange-600'],
      [151, 'text-red-600'],
      [200, 'text-red-600'],
      [201, 'text-purple-600'],
      [300, 'text-purple-600'],
      [301, 'text-red-900'],
    ];

    for (const [aqi, className] of expected) {
      expect(getAQITextColor(aqi)).toBe(className);
    }
  });
});
