import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { windDeg as predictionWindDeg } from '../../predictions/helpers';
import { dayName, hourLabel, uvColor, uvLabel, windDeg } from '../helpers';

fc.configureGlobal({ numRuns: 100, seed: 20261125 });

const LABELS = ['Low', 'Moderate', 'High', 'Very High', 'Extreme'] as const;

const COLORS = [
  'bg-' + 'emerald-100' + ' text-' + 'emerald-800',
  'bg-' + 'yellow-100' + ' text-' + 'yellow-800',
  'bg-' + 'orange-100' + ' text-' + 'orange-800',
  'bg-' + 'red-100' + ' text-' + 'red-800',
  'bg-' + 'purple-100' + ' text-' + 'purple-800',
] as const;

function expectedUvBand(uv: number): number {
  if (uv <= 2) return 0;
  if (uv <= 5) return 1;
  if (uv <= 7) return 2;
  if (uv <= 10) return 3;
  return 4;
}

function labelAt(index: number): string {
  return LABELS[index] ?? LABELS[LABELS.length - 1] ?? '';
}

function colorAt(index: number): string {
  return COLORS[index] ?? COLORS[COLORS.length - 1] ?? '';
}

function labelRank(label: string): number {
  return LABELS.findIndex((candidate) => candidate === label);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

describe('uvLabel and uvColor properties', () => {
  it('use the same band for the label and the color at any index value', () => {
    fc.assert(
      fc.property(fc.integer({ min: -20, max: 40 }), (uv) => {
        const band = expectedUvBand(uv);
        expect(uvLabel(uv)).toBe(labelAt(band));
        expect(uvColor(uv)).toBe(colorAt(band));
      }),
    );
  });

  it('treats the documented thresholds as inclusive upper bounds', () => {
    fc.assert(
      fc.property(fc.constantFrom(-1, 0, 2, 3, 5, 6, 7, 8, 10, 11, 20), (uv) => {
        expect(uvLabel(uv)).toBe(labelAt(expectedUvBand(uv)));
      }),
    );
  });

  it('never reduces severity when the index increases', () => {
    fc.assert(
      fc.property(fc.integer({ min: -10, max: 20 }), fc.nat({ max: 20 }), (uv, delta) => {
        expect(labelRank(uvLabel(uv))).toBeLessThanOrEqual(labelRank(uvLabel(uv + delta)));
      }),
    );
  });
});

describe('weather windDeg properties', () => {
  it('matches the predictions helper for non-negative degrees', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3600 }), (deg) => {
        expect(windDeg(deg)).toBe(predictionWindDeg(deg));
      }),
    );
  });

  it('is periodic over full turns', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3600 }), fc.integer({ min: 0, max: 10 }), (deg, turns) => {
        expect(windDeg(deg + turns * 360)).toBe(windDeg(deg));
      }),
    );
  });
});

describe('dayName properties', () => {
  it('returns Today and Tomorrow for the first two indices regardless of the date string', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), fc.constantFrom(0, 1), (dateStr, index) => {
        expect(dayName(dateStr, index)).toBe(index === 0 ? 'Today' : 'Tomorrow');
      }),
    );
  });

  it('formats later indices with the midday local date for valid calendar dates', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 2, max: 10 }),
        (month, day, index) => {
          const dateStr = `2026-${pad(month)}-${pad(day)}`;
          const expected = new Date(`${dateStr}T12:00:00`).toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });
          expect(dayName(dateStr, index)).toBe(expected);
        },
      ),
    );
  });

  it('returns Invalid Date instead of the raw-string fallback for unparseable dates', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{1,12}$/), fc.integer({ min: 2, max: 10 }), (suffix, index) => {
        expect(dayName('not-a-date-' + suffix, index)).toBe('Invalid Date');
      }),
    );
  });
});

describe('weather hourLabel properties', () => {
  it('returns Invalid Date for unparseable timestamps', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{1,12}$/), (suffix) => {
        expect(hourLabel('not-a-timestamp-' + suffix)).toBe('Invalid Date');
      }),
    );
  });
});
