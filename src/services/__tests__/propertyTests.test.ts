import * as fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildAdvice, driverNotes, type AdviceInput } from '../advice';
import { CO2_FACTORS, calculateCO2 } from '../carbonConstants';
import { buildDailyRoutines, isWinterSmogSeason } from '../lifestyleService';
import type { AQIStatus, HouseholdMemberKind, TravelMode } from '../../types';

const SEED = 20261123;
const statusValues: AQIStatus[] = [
  'Good',
  'Moderate',
  'Unhealthy for Sensitive Groups',
  'Unhealthy',
  'Very Unhealthy',
  'Hazardous',
];
const memberKinds: HouseholdMemberKind[] = ['adult', 'child', 'senior', 'respiratory'];
const travelModes = Object.keys(CO2_FACTORS) as TravelMode[];

const distanceArb = fc.integer({ min: 0, max: 1_000_000 }).map(raw => raw / 100);
const numberArb = fc.oneof(
  fc.integer({ min: -10, max: 500 }),
  fc.float({ min: 0, max: 500, noNaN: true }),
);
const nullableNumberArb = fc.option(numberArb, { nil: null });

const dateArb = fc
  .record({
    year: fc.integer({ min: 2025, max: 2027 }),
    month: fc.integer({ min: 0, max: 11 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ year, month, day }) => new Date(year, month, day, 12));

const householdArb = fc.option(
  fc.record({
    members: fc.array(
      fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 12 }),
        kind: fc.constantFrom(...memberKinds),
      }),
      { maxLength: 3 },
    ),
    updatedAt: fc.constant('2026-01-01T00:00:00.000Z'),
  }),
  { nil: null },
);

const weatherArb = fc.option(
  fc.record({
    temperature: fc.option(fc.integer({ min: -10, max: 40 }), { nil: null }),
    humidity: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
    windSpeed: fc.option(fc.integer({ min: 0, max: 30 }), { nil: null }),
    precipitationProbability: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
  }),
  { nil: null },
);

const routineContextArb = fc.record({
  aqi: fc.option(fc.integer({ min: 0, max: 500 }), { nil: null }),
  status: fc.option(fc.constantFrom(...statusValues), { nil: null }),
  household: householdArb,
  weather: weatherArb,
  now: dateArb,
});

const pollutantArb = fc.record({
  id: fc.constantFrom('pm25', 'pm10', 'o3', 'no2'),
  name: fc.constantFrom('PM2.5', 'PM10', 'O₃', 'NO₂'),
  value: nullableNumberArb,
  unit: fc.option(fc.constantFrom('µg/m³', 'ppb'), { nil: undefined }),
});

const airQualityArb = fc.option(
  fc.record({
    aqi: nullableNumberArb,
    status: fc.option(fc.string({ maxLength: 12 }), { nil: null }),
    dominantPollutant: fc.option(fc.constantFrom('pm25', 'pm10', 'o3', 'no2', 'not-present'), {
      nil: null,
    }),
    pollutants: fc.array(pollutantArb, { maxLength: 4 }),
    source: fc.option(
      fc.constantFrom('estimated', 'openweather', 'open-meteo', 'google', 'other'),
      {
        nil: null,
      },
    ),
  }),
  { nil: null },
);

const adviceWeatherArb = fc.option(
  fc.record({
    current: fc.option(
      fc.record({
        windSpeed: nullableNumberArb,
        uvIndex: nullableNumberArb,
        humidity: nullableNumberArb,
        precipitationProbability: nullableNumberArb,
        visibility: nullableNumberArb,
        condition: fc.option(fc.string({ maxLength: 10 }), { nil: null }),
      }),
      { nil: null },
    ),
  }),
  { nil: null },
);

const adviceInputArb: fc.Arbitrary<AdviceInput> = fc.record({
  airQuality: airQualityArb,
  weather: adviceWeatherArb,
});

beforeAll(() => {
  fc.configureGlobal({ seed: SEED, numRuns: 100 });
});

describe('calculateCO2 properties', () => {
  it('stays finite, non-negative, rounded, and monotone for every mode', () => {
    fc.assert(
      fc.property(fc.constantFrom(...travelModes), distanceArb, (mode, distance) => {
        const result = calculateCO2(distance, mode);

        expect(Number.isFinite(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBe(Math.round(result * 100) / 100);
        expect(Math.abs(result - distance * CO2_FACTORS[mode])).toBeLessThanOrEqual(0.0051);
        expect(calculateCO2(0, mode)).toBe(0);
        expect(calculateCO2(distance + 0.01, mode)).toBeGreaterThanOrEqual(result);
      }),
      { seed: SEED },
    );
  });

  it('always reports zero for zero-emission modes', () => {
    fc.assert(
      fc.property(fc.constantFrom('Walking', 'Bicycle'), distanceArb, (mode, distance) => {
        expect(calculateCO2(distance, mode)).toBe(0);
      }),
      { seed: SEED },
    );
  });

  it('orders the documented non-zero factors from Car down to Train', () => {
    expect(CO2_FACTORS.Car).toBeGreaterThan(CO2_FACTORS.Bike);
    expect(CO2_FACTORS.Bike).toBeGreaterThan(CO2_FACTORS.Bus);
    expect(CO2_FACTORS.Bus).toBeGreaterThan(CO2_FACTORS.EV);
    expect(CO2_FACTORS.EV).toBeGreaterThan(CO2_FACTORS.Train);

    const longDistanceArb = fc.integer({ min: 1_000, max: 1_000_000 }).map(raw => raw / 100);
    fc.assert(
      fc.property(longDistanceArb, distance => {
        expect(calculateCO2(distance, 'Car')).toBeGreaterThanOrEqual(
          calculateCO2(distance, 'Bike'),
        );
        expect(calculateCO2(distance, 'Bike')).toBeGreaterThanOrEqual(
          calculateCO2(distance, 'Bus'),
        );
        expect(calculateCO2(distance, 'Bus')).toBeGreaterThanOrEqual(calculateCO2(distance, 'EV'));
        expect(calculateCO2(distance, 'EV')).toBeGreaterThanOrEqual(
          calculateCO2(distance, 'Train'),
        );
      }),
      { seed: SEED },
    );
  });
});

describe('buildDailyRoutines properties', () => {
  it('returns unique, complete routines ordered by priority', () => {
    fc.assert(
      fc.property(routineContextArb, context => {
        const routines = buildDailyRoutines(context);
        const ranks = routines.map(routine => ({ high: 0, medium: 1, low: 2 })[routine.priority]);

        expect(routines.length).toBeGreaterThanOrEqual(7);
        expect(new Set(routines.map(routine => routine.id)).size).toBe(routines.length);
        for (const routine of routines) {
          expect(routine.title.length).toBeGreaterThan(0);
          expect(routine.detail.length).toBeGreaterThan(0);
          expect(routine.impact.length).toBeGreaterThan(20);
          expect([
            'indoor-air',
            'low-emission',
            'outdoor-timing',
            'winter-smog',
            'household',
          ]).toContain(routine.category);
        }
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      }),
      { seed: SEED },
    );
  });

  it('adds seasonal, humidity, and sensitive-household guidance only when warranted', () => {
    fc.assert(
      fc.property(routineContextArb, context => {
        const routines = buildDailyRoutines(context);
        const ids = new Set(routines.map(routine => routine.id));
        const winter = isWinterSmogSeason(context.now);
        const humid = context.weather?.humidity != null && context.weather.humidity > 60;
        const sensitive = Boolean(
          context.household?.members.some(
            member =>
              member.kind === 'child' || member.kind === 'senior' || member.kind === 'respiratory',
          ),
        );
        const cold = context.weather?.temperature != null && context.weather.temperature < 12;

        expect(ids.has('winter-solid-fuel')).toBe(winter);
        expect(ids.has('winter-mask')).toBe(winter);
        expect(ids.has('indoor-humidity')).toBe(humid);
        expect(ids.has('household-check')).toBe(sensitive);
        expect(ids.has('winter-warm-air')).toBe(cold && sensitive);
      }),
      { seed: SEED },
    );
  });

  it('escalates the same routines when the reported conditions are severe', () => {
    fc.assert(
      fc.property(routineContextArb, context => {
        const severity: Record<AQIStatus, number> = {
          Good: 0,
          Moderate: 1,
          'Unhealthy for Sensitive Groups': 2,
          Unhealthy: 3,
          'Very Unhealthy': 4,
          Hazardous: 5,
        };
        const severe = context.status ? severity[context.status] >= 2 : (context.aqi ?? 0) > 100;
        const byId = Object.fromEntries(
          buildDailyRoutines(context).map(routine => [routine.id, routine]),
        );

        expect(byId['indoor-windows']!.priority).toBe(severe ? 'high' : 'medium');
        expect(byId['low-emission-short-trips']!.priority).toBe(severe ? 'low' : 'high');
        expect(byId['outdoor-timing']!.title.includes('indoors')).toBe(severe);
      }),
      { seed: SEED },
    );
  });

  it('quotes the same deterministic 3 km car estimate in the short-trip routine', () => {
    const expected = calculateCO2(3, 'Car').toFixed(2);

    fc.assert(
      fc.property(routineContextArb, context => {
        const routine = buildDailyRoutines(context).find(
          candidate => candidate.id === 'low-emission-short-trips',
        );

        expect(routine?.impact).toContain(`Avoids about ${expected} kg CO2e`);
      }),
      { seed: SEED },
    );
  });
});

describe('advice helper properties', () => {
  it('never presents a missing AQI as a number or gives actions with it', () => {
    fc.assert(
      fc.property(adviceInputArb, input => {
        const advice = buildAdvice(input);
        const aqi = input.airQuality?.aqi;
        const usable = typeof aqi === 'number' && Number.isFinite(aqi);

        if (!usable) {
          expect(advice.headline.toLowerCase()).toContain('unavailable');
          expect(advice.pollutant.toLowerCase()).toContain('unavailable');
          expect(advice.pollutant).not.toMatch(/\d+\s*(µg\/m³|ppb)/);
          expect(advice.actions).toEqual([]);
        } else {
          expect(advice.headline).toContain(`AQI ${aqi}`);
          expect(advice.actions.length).toBeGreaterThan(0);
        }
        const sourceNotes: Record<string, string> = {
          estimated: 'This figure is a modelled estimate, not a measurement from a monitor.',
          openweather: 'Reported by the OpenWeather air quality feed.',
          'open-meteo': 'Reported by the Open-Meteo air quality feed.',
          google: 'Reported by a Google Air Quality sensor.',
        };
        const expectedNotes = driverNotes(input);
        const source = input.airQuality?.source?.toLowerCase();
        if (usable && source && sourceNotes[source]) expectedNotes.push(sourceNotes[source]);
        expect(advice.notes).toEqual(expectedNotes);
      }),
      { seed: SEED },
    );
  });

  it('grows the caution list monotonically across the AQI bands', () => {
    const counts = [10, 75, 120, 180, 300].map(
      aqi => buildAdvice({ airQuality: { aqi } }).actions.length,
    );

    expect(counts).toEqual([1, 2, 3, 3, 4]);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it('names a measured dominant pollutant value and no value when all are missing', () => {
    fc.assert(
      fc.property(nullableNumberArb, fc.constantFrom('µg/m³', 'ppb'), (value, unit) => {
        const measured = buildAdvice({
          airQuality: {
            aqi: 120,
            dominantPollutant: 'pm25',
            pollutants: [{ id: 'pm25', name: 'PM2.5', value, unit }],
          },
        });
        const missing = buildAdvice({
          airQuality: {
            aqi: 120,
            dominantPollutant: 'pm25',
            pollutants: [{ id: 'pm25', name: 'PM2.5', value: null, unit }],
          },
        });

        if (value !== null) {
          expect(measured.pollutant).toContain(`Main pollutant: PM2.5 at ${value} ${unit}.`);
        } else {
          expect(measured.pollutant).toContain('unavailable');
        }
        expect(missing.pollutant).toContain('unavailable');
        expect(missing.pollutant).not.toMatch(/\d+\s*(µg\/m³|ppb)/);
      }),
      { seed: SEED },
    );
  });

  it('adds source notes only for the known feeds', () => {
    fc.assert(
      fc.property(fc.constantFrom('estimated', 'openweather', 'open-meteo', 'google'), source => {
        const advice = buildAdvice({ airQuality: { aqi: 50, source } });

        expect(advice.notes.length).toBeGreaterThan(0);
        expect(advice.notes[0]).toMatch(/modelled estimate|OpenWeather|Open-Meteo|Google/);
        expect(buildAdvice({ airQuality: { aqi: 50, source: 'other' } }).notes).toEqual([]);
      }),
      { seed: SEED },
    );
  });

  it('attaches each weather note only to a real observation in its threshold', () => {
    fc.assert(
      fc.property(adviceInputArb, input => {
        const notes = driverNotes(input);
        const text = notes.join(' ').toLowerCase();
        const current = input.weather?.current ?? null;
        const wind = current?.windSpeed;
        const uv = current?.uvIndex;
        const humidity = current?.humidity;
        const rain = current?.precipitationProbability;

        if (!current) {
          expect(notes).toEqual([]);
          return;
        }

        expect(text).not.toContain('0 km/h');
        expect(text.includes('winds are light')).toBe(typeof wind === 'number' && wind < 3);
        expect(text.includes('winds are strong')).toBe(typeof wind === 'number' && wind > 15);
        expect(text.includes('winds are moderate')).toBe(
          typeof wind === 'number' && wind >= 3 && wind <= 15,
        );
        expect(text.includes('uv levels are high')).toBe(typeof uv === 'number' && uv >= 6);
        expect(text.includes('high humidity')).toBe(typeof humidity === 'number' && humidity >= 80);
        expect(text.includes('rain is likely')).toBe(typeof rain === 'number' && rain >= 60);
      }),
      { seed: SEED },
    );
  });
});
