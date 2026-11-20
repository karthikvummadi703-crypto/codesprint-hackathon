import { describe, expect, it } from 'vitest';

import { toLocationParams, type ActiveLocation } from '../LocationContext';

describe('toLocationParams', () => {
  it('prefers coordinates over a city name', () => {
    const loc: ActiveLocation = { name: 'Hyderabad', latitude: 17.385, longitude: 78.4867 };
    expect(toLocationParams(loc)).toEqual({ lat: 17.385, lon: 78.4867 });
  });

  it('falls back to the name when a coordinate is missing', () => {
    const loc: ActiveLocation = { name: 'Delhi', latitude: 28.61 };
    expect(toLocationParams(loc)).toEqual({ city: 'Delhi' });
  });
});
