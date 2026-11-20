import { describe, expect, it } from 'vitest';

import { activityGuidance, windDeg } from '../helpers';

describe('activityGuidance', () => {
  it.each([
    [50, 'Good conditions'],
    [100, 'Generally acceptable'],
    [150, 'Sensitive groups'],
    [200, 'Unhealthy'],
    [201, 'Very unhealthy'],
  ])('maps peak %i to the correct band', (peak, titlePrefix) => {
    expect(activityGuidance(peak).title.startsWith(titlePrefix)).toBe(true);
  });
});

describe('windDeg', () => {
  it.each([
    [0, 'N'],
    [350, 'N'],
    [180, 'S'],
    [360, 'N'],
  ])('maps %i degrees to %s', (deg, expected) => {
    expect(windDeg(deg)).toBe(expected);
  });
});
