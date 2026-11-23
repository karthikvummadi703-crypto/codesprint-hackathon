import { describe, expect, it } from 'vitest';

import {
  buildDailyRoutines,
  describeHousehold,
  hasSensitiveMembers,
  isWinterSmogSeason,
  routinesToPromptContext,
} from '../lifestyleService';
import { HouseholdProfile } from '../../types';

const family: HouseholdProfile = {
  members: [
    { id: '1', name: 'Riya', kind: 'child' },
    { id: '2', name: 'Arjun', kind: 'adult' },
  ],
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('isWinterSmogSeason', () => {
  it('covers November through February', () => {
    expect(isWinterSmogSeason(new Date(2026, 0, 15))).toBe(true);
    expect(isWinterSmogSeason(new Date(2026, 10, 15))).toBe(true);
    expect(isWinterSmogSeason(new Date(2026, 11, 15))).toBe(true);
    expect(isWinterSmogSeason(new Date(2026, 1, 15))).toBe(true);
  });

  it('excludes monsoon and summer months', () => {
    expect(isWinterSmogSeason(new Date(2026, 5, 15))).toBe(false);
    expect(isWinterSmogSeason(new Date(2026, 7, 15))).toBe(false);
  });
});

describe('household helpers', () => {
  it('detects sensitive members and describes them in plain language', () => {
    expect(hasSensitiveMembers(family)).toBe(true);
    expect(describeHousehold(family)).toContain('Riya (child)');
    expect(describeHousehold(family)).toContain('Arjun (adult)');
  });

  it('is honest when no household is recorded', () => {
    expect(hasSensitiveMembers(null)).toBe(false);
    expect(describeHousehold(null)).toContain('No household members');
  });
});

describe('buildDailyRoutines', () => {
  it('produces only routines that explain their direct impact', () => {
    const routines = buildDailyRoutines({
      aqi: 80,
      status: 'Moderate',
      household: family,
      now: new Date(2026, 5, 15),
    });

    expect(routines.length).toBeGreaterThan(5);
    for (const routine of routines) {
      expect(routine.id).toBeTruthy();
      expect(routine.title).toBeTruthy();
      expect(routine.impact.length).toBeGreaterThan(20);
      expect(['high', 'medium', 'low']).toContain(routine.priority);
    }
  });

  it('prioritises indoor safety and check-ins on severe smog days', () => {
    const routines = buildDailyRoutines({
      aqi: 220,
      status: 'Very Unhealthy',
      household: family,
      now: new Date(2026, 0, 15),
    });
    const byId = Object.fromEntries(routines.map(r => [r.id, r]));

    expect(byId['indoor-windows']!.priority).toBe('high');
    expect(byId['outdoor-timing']!.title).toContain('indoors');
    expect(byId['household-check']!.priority).toBe('high');
    expect(byId['low-emission-short-trips']!.priority).toBe('low');
  });

  it('adds winter-smog-specific guidance only in smog season', () => {
    const winter = buildDailyRoutines({
      aqi: 60,
      status: 'Moderate',
      household: null,
      now: new Date(2026, 0, 15),
    });
    const summer = buildDailyRoutines({
      aqi: 60,
      status: 'Moderate',
      household: null,
      now: new Date(2026, 5, 15),
    });

    expect(winter.some(r => r.id === 'winter-solid-fuel')).toBe(true);
    expect(summer.some(r => r.id === 'winter-solid-fuel')).toBe(false);
  });

  it('adds humidity guidance only when the air is humid', () => {
    const humid = buildDailyRoutines({
      aqi: 40,
      status: 'Good',
      household: null,
      weather: { humidity: 78 },
      now: new Date(2026, 5, 15),
    });
    expect(humid.some(r => r.id === 'indoor-humidity')).toBe(true);
  });

  it('sorts high-priority routines first', () => {
    const routines = buildDailyRoutines({
      aqi: 190,
      status: 'Unhealthy',
      household: family,
      now: new Date(2026, 0, 15),
    });
    const order = { high: 0, medium: 1, low: 2 };
    const ranks = routines.map(r => order[r.priority]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

describe('routinesToPromptContext', () => {
  it('labels the plan as user-provided rather than measured', () => {
    const text = routinesToPromptContext(
      buildDailyRoutines({
        aqi: 180,
        status: 'Unhealthy',
        household: family,
        now: new Date(2026, 0, 15),
      }),
      family,
    );

    expect(text.toLowerCase()).toContain('not measured');
    expect(text).toContain('Riya (child)');
    expect(text).toContain('Impact:');
  });

  it('returns an empty string when there is nothing to share', () => {
    expect(routinesToPromptContext([], null)).toBe('');
  });
});
