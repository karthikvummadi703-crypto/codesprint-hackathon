import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppUser } from '../authService';
import type { HouseholdProfile, Json } from '../../types';

const dataMocks = vi.hoisted(() => ({
  getUser: vi.fn<(uid: string) => Promise<Json | null>>(),
  saveUser: vi.fn<(uid: string, data: Json) => Promise<void>>(),
}));

vi.mock('../dataService', () => dataMocks);

import { buildAdvice, driverNotes } from '../advice';
import {
  buildDailyRoutines,
  describeHousehold,
  hasSensitiveMembers,
  isWinterSmogSeason,
  routinesToPromptContext,
} from '../lifestyleService';
import {
  ANONYMOUS_NAME,
  ensureProfile,
  initialsFor,
  loadProfile,
  resolveDisplayName,
  saveProfileName,
} from '../profileService';

const user = (over: Partial<AppUser> = {}): AppUser => ({
  uid: 'uid-extra',
  name: null,
  email: null,
  photoURL: null,
  isDev: false,
  ...over,
});

const household: HouseholdProfile = {
  members: [
    { id: '1', name: 'Grandpa', kind: 'senior' },
    { id: '2', name: 'Meera', kind: 'respiratory' },
    { id: '3', name: 'Arjun', kind: 'adult' },
  ],
};

function routinesById(
  context: Parameters<typeof buildDailyRoutines>[0],
): Record<string, ReturnType<typeof buildDailyRoutines>[number]> {
  return Object.fromEntries(buildDailyRoutines(context).map((routine) => [routine.id, routine]));
}

describe('advice additional branches', () => {
  it('treats a NaN AQI as missing rather than formatting it', () => {
    const advice = buildAdvice({ airQuality: { aqi: Number.NaN, status: 'Good' } });

    expect(advice.headline).toContain('unavailable');
    expect(advice.actions).toEqual([]);
  });

  it('falls back to the first pollutant when the dominant id is unknown', () => {
    const advice = buildAdvice({
      airQuality: {
        aqi: 60,
        status: 'Moderate',
        dominantPollutant: 'missing-id',
        pollutants: [
          { id: 'pm10', name: 'PM10', value: 18 },
          { id: 'pm25', name: 'PM2.5', value: 9, unit: 'µg/m³' },
        ],
      },
    });

    expect(advice.pollutant).toContain('PM10');
    expect(advice.pollutant).toContain('18 µg/m³');
    expect(advice.pollutant).not.toContain('PM2.5 at');
  });

  it('labels a blank status as uncategorised and varies guidance at AQI boundaries', () => {
    const blank = buildAdvice({ airQuality: { aqi: 50, status: '   ' } });
    expect(blank.headline).toContain('Uncategorised');
    expect(blank.headline).toContain('(AQI 50)');
    expect(blank.headline).not.toContain('take care outdoors');

    const actionCounts = [50, 100, 150, 200, 201].map(
      (aqi) => buildAdvice({ airQuality: { aqi, status: 'Moderate' } }).actions.length,
    );
    expect(actionCounts).toEqual([1, 2, 3, 3, 4]);
    expect(buildAdvice({ airQuality: { aqi: 101, status: 'Moderate' } }).headline).toContain(
      'take care outdoors',
    );
  });

  it('adds source notes case-insensitively and ignores unknown sources', () => {
    const sources: Record<string, string> = {
      estimated: 'modelled estimate',
      OPENWEATHER: 'OpenWeather air quality feed',
      'Open-Meteo': 'Open-Meteo air quality feed',
      google: 'Google Air Quality sensor',
    };

    for (const [source, expected] of Object.entries(sources)) {
      const advice = buildAdvice({ airQuality: { aqi: 40, source } });
      expect(advice.notes.join(' ')).toContain(expected);
    }

    const unknown = buildAdvice({ airQuality: { aqi: 40, source: 'mystery' } });
    expect(unknown.notes).toEqual([]);
    expect(buildAdvice({ airQuality: { aqi: 40, source: null } }).notes).toEqual([]);
  });

  it('keeps weather notes even when the AQI itself is missing', () => {
    const advice = buildAdvice({
      airQuality: null,
      weather: { current: { windSpeed: 20, humidity: 85 } },
    });

    expect(advice.headline).toContain('unavailable');
    expect(advice.notes.join(' ')).toContain('strong');
    expect(advice.notes.join(' ')).toContain('humidity');
  });

  it('covers moderate wind, exact thresholds and non-numeric weather values', () => {
    const notes = driverNotes({
      airQuality: {
        aqi: 90,
        pollutants: [{ id: 'pm25', name: 'PM2.5', value: 12 }],
      },
      weather: {
        current: {
          windSpeed: 8,
          uvIndex: 6,
          humidity: 80,
          precipitationProbability: 60,
        },
      },
    });
    const text = notes.join(' ');

    expect(text).toContain('moderate');
    expect(text).toContain('UV');
    expect(text).toContain('humidity');
    expect(text).toContain('Rain is likely');
    expect(text).toContain('PM2.5 dominant');
    expect(notes).toHaveLength(5);

    expect(driverNotes({ weather: { current: null } })).toEqual([]);
    expect(
      driverNotes({
        airQuality: {
          aqi: 90,
          pollutants: [{ id: 'pm25', name: 'PM2.5', value: Number.NaN }],
        },
        weather: { current: { windSpeed: Number.NaN, uvIndex: Number.NaN, humidity: null } },
      }),
    ).toEqual([]);
  });

  it('does not add the PM2.5 note for another dominant pollutant', () => {
    const notes = driverNotes({
      airQuality: { aqi: 90, pollutants: [{ id: 'o3', name: 'O₃', value: 50 }] },
      weather: { current: { uvIndex: 8, windSpeed: 9 } },
    });

    expect(notes.join(' ')).toContain('ozone');
    expect(notes.join(' ')).not.toContain('PM2.5 dominant');
  });
});

describe('profileService additional branches', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dataMocks.getUser.mockResolvedValue(null);
    dataMocks.saveUser.mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('falls back through whitespace-heavy names to the email local part', () => {
    expect(resolveDisplayName(user({ email: '  @example.com' }), { name: '   ' })).toBe(ANONYMOUS_NAME);
    expect(resolveDisplayName(user({ email: 'pad@example.com' }), { name: '  Ana Lopez  ' })).toBe(
      'Ana Lopez',
    );
    expect(resolveDisplayName(user({ name: '   ', email: 'local@example.com' }), null)).toBe('local');
    expect(initialsFor('Ana_Maria.Lopez')).toBe('AL');
  });

  it('backfills an email only when the stored profile has neither name nor email', async () => {
    dataMocks.getUser.mockResolvedValueOnce({ location: 'Pune' });

    const profile = await ensureProfile(user({ email: 'new@example.com', name: 'Auth Name' }));

    expect(profile).toEqual({ location: 'Pune', email: 'new@example.com' });
    expect(dataMocks.saveUser).toHaveBeenCalledWith('uid-extra', { email: 'new@example.com' });
  });

  it('leaves an existing name or email untouched', async () => {
    dataMocks.getUser.mockResolvedValueOnce({ name: 'Saved Name' });
    await expect(ensureProfile(user({ email: 'new@example.com' }))).resolves.toEqual({ name: 'Saved Name' });
    expect(dataMocks.saveUser).not.toHaveBeenCalled();

    dataMocks.getUser.mockResolvedValueOnce({ email: 'saved@example.com' });
    await expect(ensureProfile(user({ email: 'new@example.com' }))).resolves.toEqual({
      email: 'saved@example.com',
    });
    expect(dataMocks.saveUser).not.toHaveBeenCalled();
  });

  it('seeds a new profile with defaults and no email-derived name', async () => {
    const seeded = await ensureProfile(
      user({ name: null, email: 'person@example.com', photoURL: 'https://example.com/p.png' }),
    );

    expect(seeded).toEqual({
      name: '',
      email: 'person@example.com',
      photoURL: 'https://example.com/p.png',
      location: '',
      preferences: { units: 'metric', notificationsEnabled: true, alertThreshold: 100 },
      createdAt: expect.any(String),
    });
    expect(dataMocks.saveUser).toHaveBeenCalledWith('uid-extra', seeded);
  });

  it('returns null and logs when profile reads or writes fail', async () => {
    dataMocks.getUser.mockRejectedValueOnce(new Error('read failed'));
    await expect(ensureProfile(user())).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith('Failed to load or create user profile', expect.any(Error));

    dataMocks.getUser.mockResolvedValueOnce(null);
    dataMocks.saveUser.mockRejectedValueOnce(new Error('write failed'));
    await expect(ensureProfile(user())).resolves.toBeNull();

    dataMocks.getUser.mockRejectedValueOnce(new Error('load failed'));
    await expect(loadProfile('uid-extra')).resolves.toBeNull();
  });

  it('loads an existing profile and saves trimmed names', async () => {
    dataMocks.getUser.mockResolvedValueOnce({ name: 'Stored' });
    await expect(loadProfile('uid-extra')).resolves.toEqual({ name: 'Stored' });
    expect(dataMocks.getUser).toHaveBeenCalledWith('uid-extra');

    await saveProfileName('uid-extra', '  Edited Name  ');
    expect(dataMocks.saveUser).toHaveBeenCalledWith('uid-extra', { name: 'Edited Name' });
  });
});

describe('lifestyleService additional branches', () => {
  it('treats March and October as outside smog season', () => {
    expect(isWinterSmogSeason(new Date(2026, 2, 15))).toBe(false);
    expect(isWinterSmogSeason(new Date(2026, 9, 15))).toBe(false);
  });

  it('describes senior and respiratory members and an empty household', () => {
    expect(hasSensitiveMembers(household)).toBe(true);
    expect(describeHousehold(household)).toContain('Grandpa (older adult)');
    expect(describeHousehold(household)).toContain('Meera (member with a breathing condition)');
    expect(describeHousehold({ members: [{ id: '1', name: 'Arjun', kind: 'adult' }] })).toContain(
      'Arjun (adult)',
    );
    expect(hasSensitiveMembers({ members: [] })).toBe(false);
    expect(describeHousehold({ members: [] })).toBe('No household members recorded yet.');
  });

  it('infers severity from AQI when no status is available', () => {
    const moderate = routinesById({ aqi: 120, status: null, household: null });
    expect(moderate['indoor-windows']!.priority).toBe('high');
    expect(moderate['outdoor-timing']!.title).toContain('indoors');

    const severe = routinesById({ aqi: 180, status: null, household: null });
    expect(severe['low-emission-short-trips']!.priority).toBe('low');

    const missing = routinesById({ aqi: null, status: null, household: null });
    expect(missing['outdoor-timing']!.title).toContain('cleaner exercise window');
    expect(missing['low-emission-short-trips']!.priority).toBe('high');
  });

  it('raises winter priorities for still air, severe levels and sensitive members', () => {
    const routines = routinesById({
      aqi: 170,
      status: 'Unhealthy',
      household,
      weather: { windSpeed: 2, temperature: 8 },
      now: new Date(2026, 0, 15),
    });

    expect(routines['indoor-filter']!.priority).toBe('high');
    expect(routines['low-emission-short-trips']!.priority).toBe('low');
    expect(routines['low-emission-home']!.priority).toBe('high');
    expect(routines['outdoor-timing']!.priority).toBe('high');
    expect(routines['winter-solid-fuel']!.priority).toBe('high');
    expect(routines['winter-mask']!.priority).toBe('high');
    expect(routines['winter-warm-air']!.priority).toBe('medium');
    expect(routines['household-check']!.priority).toBe('high');
  });

  it('keeps winter guidance medium on windy days and omits cold-air advice without sensitive members', () => {
    const windy = routinesById({
      aqi: 90,
      status: 'Moderate',
      household: null,
      weather: { windSpeed: 12, temperature: 8 },
      now: new Date(2026, 0, 15),
    });
    expect(windy['winter-solid-fuel']!.priority).toBe('medium');
    expect(windy['winter-mask']!.priority).toBe('medium');
    expect(windy['winter-warm-air']).toBeUndefined();
    expect(windy['household-check']).toBeUndefined();
    expect(windy['indoor-filter']!.priority).toBe('medium');

    const summer = routinesById({
      aqi: 90,
      status: 'Moderate',
      household,
      weather: { temperature: 8 },
      now: new Date(2026, 5, 15),
    });
    expect(summer['winter-solid-fuel']).toBeUndefined();
    expect(summer['winter-warm-air']).toBeDefined();
    expect(summer['household-check']).toBeDefined();
  });

  it('adds humidity guidance above sixty percent only', () => {
    const boundary = routinesById({
      aqi: 40,
      status: 'Good',
      household: null,
      weather: { humidity: 60 },
      now: new Date(2026, 5, 15),
    });
    const humid = routinesById({
      aqi: 40,
      status: 'Good',
      household: null,
      weather: { humidity: 61 },
      now: new Date(2026, 5, 15),
    });

    expect(boundary['indoor-humidity']).toBeUndefined();
    expect(humid['indoor-humidity']).toBeDefined();
  });

  it('builds prompt context when only routines or only a household are available', () => {
    const routines = buildDailyRoutines({
      aqi: 40,
      status: 'Good',
      household: null,
      now: new Date(2026, 5, 15),
    });
    const withNoHousehold = routinesToPromptContext(routines, null);
    expect(withNoHousehold).toContain('user-provided; not measured');
    expect(withNoHousehold).toContain('Household: No household members recorded yet.');
    expect(withNoHousehold).toContain('- ');

    const householdOnly = routinesToPromptContext([], household);
    expect(householdOnly).toContain('Grandpa (older adult)');
    expect(householdOnly).not.toContain('- ');
  });
});
