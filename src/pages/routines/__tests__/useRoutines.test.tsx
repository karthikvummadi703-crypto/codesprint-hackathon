import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ActiveLocation } from '../../../context/LocationContext';
import type { AppUser } from '../../../services/authService';
import type { PlaceSuggestion } from '../../../services/backendService';
import type { RoutineContext } from '../../../services/lifestyleService';
import type {
  AqiApiResponse,
  AQIStatus,
  CommunityPlace,
  DailyRoutine,
  HouseholdProfile,
  Json,
} from '../../../types';
import { useRoutines } from '../useRoutines';

const mocks = vi.hoisted(() => ({
  user: null as AppUser | null,
  location: null as ActiveLocation | null,
  winter: false,
  sensitive: false,
  fetchAQI: vi.fn<(params: { lat?: number; lon?: number; city?: string }) => Promise<AqiApiResponse>>(),
  searchLocations: vi.fn<(query: string, limit: number) => Promise<PlaceSuggestion[]>>(),
  getLifestyleSettings: vi.fn<(uid: string) => Promise<Json | null>>(),
  saveLifestyleSettings: vi.fn<(uid: string, data: Json) => Promise<void>>(),
  buildDailyRoutines: vi.fn<(context: RoutineContext) => DailyRoutine[]>(),
  hasSensitiveMembers: vi.fn<(household: HouseholdProfile | null) => boolean>(),
  isWinterSmogSeason: vi.fn<() => boolean>(),
  routinesToPromptContext: vi.fn<(routines: DailyRoutine[], household: HouseholdProfile | null) => string>(),
  newId: vi.fn<(prefix: string) => string>(),
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock('../../../context/LocationContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../context/LocationContext')>();
  return { ...actual, useLocation: () => ({ location: mocks.location }) };
});

vi.mock('../../../services/backendService', () => ({
  fetchAQI: mocks.fetchAQI,
  searchLocations: mocks.searchLocations,
}));

vi.mock('../../../services/dataService', () => ({
  getLifestyleSettings: mocks.getLifestyleSettings,
  saveLifestyleSettings: mocks.saveLifestyleSettings,
}));

vi.mock('../../../services/lifestyleService', () => ({
  buildDailyRoutines: mocks.buildDailyRoutines,
  hasSensitiveMembers: mocks.hasSensitiveMembers,
  isWinterSmogSeason: mocks.isWinterSmogSeason,
  routinesToPromptContext: mocks.routinesToPromptContext,
}));

vi.mock('../constants', () => ({
  newId: mocks.newId,
}));

const user: AppUser = {
  uid: 'user-1',
  email: 'user@example.com',
  name: 'User',
  photoURL: null,
  isDev: false,
};

const routines: DailyRoutine[] = [
  {
    id: 'r1',
    title: 'Run a purifier',
    category: 'indoor-air',
    detail: 'Use a HEPA filter.',
    impact: 'Removes particles.',
    priority: 'high',
  },
  {
    id: 'r2',
    title: 'Agree a plan',
    category: 'household',
    detail: 'Share the plan.',
    impact: 'Removes delays.',
    priority: 'medium',
  },
];

const place: CommunityPlace = {
  id: 'place-fixed',
  name: 'School',
  latitude: 17.4,
  longitude: 78.4,
  label: 'School, Hyderabad',
};

function makeAqi(value: number | string, status: AQIStatus): AqiApiResponse {
  return {
    aqi: value,
    status,
    dominantPollutant: 'PM2.5',
    healthAdvisory: ' Advisory',
    pollutants: [],
  } as unknown as AqiApiResponse;
}

describe('useRoutines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = user;
    mocks.location = { name: 'Hyderabad', latitude: 17.4, longitude: 78.4 };
    mocks.winter = false;
    mocks.sensitive = false;
    mocks.getLifestyleSettings.mockResolvedValue(null);
    mocks.saveLifestyleSettings.mockResolvedValue(undefined);
    mocks.fetchAQI.mockResolvedValue(makeAqi(42, 'Good'));
    mocks.searchLocations.mockResolvedValue([]);
    mocks.buildDailyRoutines.mockReturnValue(routines);
    mocks.hasSensitiveMembers.mockReturnValue(false);
    mocks.isWinterSmogSeason.mockReturnValue(false);
    mocks.routinesToPromptContext.mockReturnValue('Routine context');
    mocks.newId.mockImplementation((prefix) => `${prefix}-fixed`);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hydrates household and community places from stored settings', async () => {
    const household: HouseholdProfile = {
      members: [{ id: 'm1', name: 'Child', kind: 'child' }],
    };
    mocks.getLifestyleSettings.mockResolvedValue({ household, communityWatch: [place] });

    const { result } = renderHook(() => useRoutines());
    await waitFor(() => expect(result.current.places).toEqual([place]));

    expect(result.current.household).toEqual(household);
    expect(mocks.fetchAQI).toHaveBeenCalledWith({ lat: 17.4, lon: 78.4 });
  });

  it('does not apply settings that resolve after unmount', async () => {
    let resolveSettings: (value: Json | null) => void = () => {};
    mocks.getLifestyleSettings.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSettings = resolve;
        }),
    );

    const { result, unmount } = renderHook(() => useRoutines());
    unmount();
    await act(async () => {
      resolveSettings({ household: { members: [{ id: 'm1', name: 'Late', kind: 'adult' }] } });
      await Promise.resolve();
    });

    expect(result.current.household).toEqual({ members: [] });
  });

  it('loads the pinned AQI and coerces numeric strings', async () => {
    mocks.fetchAQI.mockResolvedValue(makeAqi('87', 'Moderate'));
    const { result } = renderHook(() => useRoutines());
    await waitFor(() => expect(result.current.aqi).toBe(87));

    expect(mocks.fetchAQI).toHaveBeenCalledWith({ lat: 17.4, lon: 78.4 });
    expect(result.current.status).toBe('Moderate');
  });

  it('does not fetch an AQI without a pinned location', async () => {
    mocks.location = null;
    const { result } = renderHook(() => useRoutines());
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.fetchAQI).not.toHaveBeenCalled();
    expect(result.current.aqi).toBeNull();
    expect(result.current.status).toBeNull();
  });

  it('resets AQI values when the request fails', async () => {
    mocks.fetchAQI.mockRejectedValue(new Error('backend offline'));
    const { result } = renderHook(() => useRoutines());
    await waitFor(() => expect(mocks.fetchAQI).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.aqi).toBeNull());

    expect(result.current.status).toBeNull();
  });

  it('maps each community place to its AQI, using null for failures', async () => {
    mocks.getLifestyleSettings.mockResolvedValue({
      communityWatch: [place, { ...place, id: 'place-2', name: 'Office', latitude: 18 }],
    });
    mocks.fetchAQI.mockImplementation(async (params) => {
      if (params.lat === 18) throw new Error('no station');
      return makeAqi(55, 'Moderate');
    });

    const { result } = renderHook(() => useRoutines());
    await waitFor(() => expect(Object.keys(result.current.placeAqi)).toHaveLength(2));

    expect(result.current.placeAqi).toEqual({ 'place-fixed': 55, 'place-2': null });
    expect(mocks.fetchAQI).toHaveBeenCalledWith({ lat: 17.4, lon: 78.4 });
  });

  it('clears place readings once the last place is removed', async () => {
    mocks.getLifestyleSettings.mockResolvedValue({ communityWatch: [place] });
    const { result } = renderHook(() => useRoutines());
    await waitFor(() => expect(Object.keys(result.current.placeAqi)).toHaveLength(1));

    act(() => result.current.setPlaces([]));
    await waitFor(() => expect(result.current.placeAqi).toEqual({}));
  });

  it('debounces place search and ignores very short queries', async () => {
    vi.useFakeTimers();
    mocks.searchLocations.mockResolvedValue([
      { name: 'Delhi', latitude: 28.6, longitude: 77.2, label: 'Delhi, India' },
    ]);
    const { result } = renderHook(() => useRoutines());

    act(() => result.current.setPlaceQuery('D'));
    expect(result.current.suggestions).toEqual([]);
    expect(mocks.searchLocations).not.toHaveBeenCalled();

    act(() => result.current.setPlaceQuery('Del'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(mocks.searchLocations).toHaveBeenCalledWith('Del', 5);
    expect(result.current.suggestions).toEqual([
      { name: 'Delhi', latitude: 28.6, longitude: 77.2, label: 'Delhi, India' },
    ]);
  });

  it('clears stale suggestions when a search fails', async () => {
    vi.useFakeTimers();
    mocks.searchLocations.mockRejectedValue(new Error('no results'));
    const { result } = renderHook(() => useRoutines());

    act(() => result.current.setPlaceQuery('Del'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.suggestions).toEqual([]);
  });

  it('adds a household member using the selected kind and resets the name', () => {
    const { result } = renderHook(() => useRoutines());

    act(() => result.current.setMemberName('   '));
    act(() => result.current.handleAddMember());
    expect(result.current.household.members).toEqual([]);

    act(() => result.current.setMemberKind('senior'));
    act(() => result.current.setMemberName('  Grandpa  '));
    act(() => result.current.handleAddMember());

    expect(result.current.household.members).toEqual([
      { id: 'member-fixed', name: 'Grandpa', kind: 'senior' },
    ]);
    expect(result.current.memberName).toBe('');
  });

  it('adds a selected place and clears the search state', () => {
    const { result } = renderHook(() => useRoutines());
    const suggestion: PlaceSuggestion = {
      name: 'School',
      latitude: 17.4,
      longitude: 78.4,
      label: 'School, Hyderabad',
    };

    act(() => {
      result.current.setPlaceQuery('School');
      result.current.handleAddPlace(suggestion);
    });

    expect(result.current.places).toEqual([place]);
    expect(result.current.placeQuery).toBe('');
    expect(result.current.suggestions).toEqual([]);
  });

  it('saves the full lifestyle payload and resets the saved flag', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRoutines());
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(mocks.saveLifestyleSettings).toHaveBeenCalledWith('user-1', {
      household: { members: [] },
      communityWatch: [],
      routines,
      routinePromptContext: 'Routine context',
    });
    expect(result.current.saving).toBe(false);
    expect(result.current.saved).toBe(true);
    expect(result.current.error).toBe('');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.saved).toBe(false);
  });

  it('surfaces save errors and ignores saves while signed out', async () => {
    mocks.saveLifestyleSettings.mockRejectedValue(new Error('write denied'));
    const { result, rerender } = renderHook(() => useRoutines());
    await waitFor(() => expect(mocks.fetchAQI).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.handleSave();
    });
    expect(result.current.error).toBe('write denied');
    expect(result.current.saved).toBe(false);
    expect(result.current.saving).toBe(false);

    mocks.user = null;
    rerender();
    await act(async () => {
      await result.current.handleSave();
    });
    expect(mocks.saveLifestyleSettings).toHaveBeenCalledTimes(1);
  });

  it('exposes winter, sensitivity, grouped routines and prompt context', async () => {
    mocks.isWinterSmogSeason.mockReturnValue(true);
    mocks.hasSensitiveMembers.mockImplementation((household) => household?.members.length === 1);
    mocks.getLifestyleSettings.mockResolvedValue({
      household: { members: [{ id: 'm1', name: 'Child', kind: 'child' }] },
    });
    mocks.fetchAQI.mockResolvedValue(makeAqi(160, 'Unhealthy'));
    const { result } = renderHook(() => useRoutines());
    await waitFor(() => expect(result.current.aqi).toBe(160));
    await waitFor(() => expect(result.current.household.members).toHaveLength(1));

    expect(result.current.winter).toBe(true);
    expect(result.current.sensitive).toBe(true);
    expect(result.current.routineCount).toBe(2);
    expect(result.current.grouped).toEqual([
      ['indoor-air', [routines[0]]],
      ['household', [routines[1]]],
    ]);
    expect(result.current.promptContext).toBe('Routine context');
    expect(mocks.buildDailyRoutines).toHaveBeenLastCalledWith({
      aqi: 160,
      status: 'Unhealthy',
      household: { members: [{ id: 'm1', name: 'Child', kind: 'child' }] },
    });
    expect(mocks.routinesToPromptContext).toHaveBeenCalledWith(routines, {
      members: [{ id: 'm1', name: 'Child', kind: 'child' }],
    });
  });
});
