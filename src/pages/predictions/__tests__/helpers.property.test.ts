import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { activityGuidance, hourLabel, windDeg } from '../helpers';

fc.configureGlobal({ numRuns: 100, seed: 20261124 });

const TITLES = [
  'Good conditions for outdoor activity',
  'Generally acceptable for most people',
  'Sensitive groups should limit exertion',
  'Unhealthy — reduce outdoor activity',
  'Very unhealthy — avoid outdoor exertion',
] as const;

const TONES = [
  'text-' + 'emerald-700',
  'text-' + 'amber-700',
  'text-' + 'orange-700',
  'text-' + 'red-700',
  'text-' + 'purple-700',
] as const;

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

function expectedBand(peak: number): number {
  if (peak <= 50) return 0;
  if (peak <= 100) return 1;
  if (peak <= 150) return 2;
  if (peak <= 200) return 3;
  return 4;
}

function titleAt(index: number): string {
  return TITLES[index] ?? TITLES[TITLES.length - 1] ?? '';
}

function toneAt(index: number): string {
  return TONES[index] ?? TONES[TONES.length - 1] ?? '';
}

function directionAt(index: number): string {
  return DIRECTIONS[index] ?? DIRECTIONS[DIRECTIONS.length - 1] ?? '';
}

function titleRank(title: string): number {
  return TITLES.findIndex((candidate) => candidate === title);
}

describe('activityGuidance properties', () => {
  it('selects the exact title and tone for any peak', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 400 }), (peak) => {
        const guidance = activityGuidance(peak);
        expect(guidance.title).toBe(titleAt(expectedBand(peak)));
        expect(guidance.tone).toBe(toneAt(expectedBand(peak)));
      }),
    );
  });

  it('treats the documented thresholds as inclusive upper bounds', () => {
    fc.assert(
      fc.property(fc.constantFrom(-1, 0, 50, 51, 100, 101, 150, 151, 200, 201, 500), (peak) => {
        expect(activityGuidance(peak).title).toBe(titleAt(expectedBand(peak)));
      }),
    );
  });

  it('never reduces severity when the peak increases', () => {
    fc.assert(
      fc.property(fc.integer({ min: -50, max: 300 }), fc.nat({ max: 200 }), (peak, delta) => {
        const before = activityGuidance(peak);
        const after = activityGuidance(peak + delta);
        expect(titleRank(before.title)).toBeLessThanOrEqual(titleRank(after.title));
      }),
    );
  });
});

describe('windDeg properties', () => {
  it('is periodic over full turns', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3600 }), fc.integer({ min: 0, max: 10 }), (deg, turns) => {
        expect(windDeg(deg + turns * 360)).toBe(windDeg(deg));
      }),
    );
  });

  it('keeps each 45-degree bucket until the next boundary', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 7 }), fc.constantFrom(0, 22, 23), (bucket, offset) => {
        const expectedIndex = offset === 23 ? (bucket + 1) % 8 : bucket;
        expect(windDeg(bucket * 45 + offset)).toBe(directionAt(expectedIndex));
      }),
    );
  });

  it('currently returns undefined for negative degrees outside the rounding dead zone', () => {
    fc.assert(
      fc.property(fc.integer({ min: 23, max: 337 }), (degrees) => {
        expect(windDeg(-degrees)).toBeUndefined();
      }),
    );
  });
});

describe('hourLabel properties', () => {
  it('formats parseable ISO timestamps with hour and minute', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4102444800000 }), (ms) => {
        const iso = new Date(ms).toISOString();
        const expected = new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        expect(hourLabel(iso)).toBe(expected);
      }),
    );
  });

  it('returns Invalid Date instead of the slice fallback for unparseable input', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{1,12}$/), (suffix) => {
        expect(hourLabel('not-a-timestamp-' + suffix)).toBe('Invalid Date');
      }),
    );
  });
});
