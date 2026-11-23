import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchMock,
  firebaseState,
  firestore,
  flushAct,
  installRoutinesHarness,
  localStorageMock,
  location,
  network,
  PREFIX,
  readStored,
  store,
  UID,
} from './support';
import { toLocationParams } from '../../../../context/LocationContext';
import { useRoutines } from '../useRoutines';

installRoutinesHarness();

describe('useRoutines loading', () => {
  it('loads saved household and community watch, fetches both AQI readings and generates routines', async () => {
    store.set(
      `${PREFIX}${UID}_lifestyle`,
      JSON.stringify({
        household: { members: [{ id: 'm1', name: 'Riya', kind: 'child' }] },
        communityWatch: [
          { id: 'p1', name: 'School', latitude: 11.1, longitude: 22.2, label: 'School gate' },
        ],
      }),
    );

    const { result } = renderHook(() => useRoutines());
    await flushAct();

    expect(result.current.household.members).toEqual([{ id: 'm1', name: 'Riya', kind: 'child' }]);
    expect(result.current.places).toMatchObject([{ id: 'p1', label: 'School gate' }]);
    expect(result.current.aqi).toBe(88);
    expect(result.current.status).toBe('Moderate');
    expect(result.current.placeAqi).toEqual({ p1: 130 });
    expect(result.current.sensitive).toBe(true);
    expect(result.current.winter).toBe(false);
    expect(result.current.routineCount).toBeGreaterThan(0);
    expect(result.current.routines.map(r => r.title)).toContain('Time your window opening');
    expect(result.current.grouped.map(([category]) => category)).toContain('indoor-air');
    expect(toLocationParams).toHaveBeenCalledWith(location);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/aqi?city=Test'))).toBe(
      true,
    );
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/api/aqi?lat=11.1&lon=22.2')),
    ).toBe(true);
  });
});

describe('useRoutines place search', () => {
  it('debounces place search, adds the chosen place and loads its AQI', async () => {
    network.suggestions = [
      { name: 'City Library', latitude: 10.1, longitude: 20.2, label: 'City Library — Central' },
    ];
    network.placeAqi = 55;
    const { result } = renderHook(() => useRoutines());
    await flushAct();

    act(() => result.current.setPlaceQuery('libr'));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/geocode/search'))).toBe(
      false,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.suggestions).toEqual(network.suggestions);
    act(() => result.current.handleAddPlace(network.suggestions[0]!));

    expect(result.current.places).toMatchObject([
      { name: 'City Library', latitude: 10.1, longitude: 20.2, label: 'City Library — Central' },
    ]);
    expect(result.current.placeQuery).toBe('');
    expect(result.current.suggestions).toEqual([]);
    await flushAct();
    expect(Object.values(result.current.placeAqi)).toEqual([55]);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/api/aqi?lat=10.1&lon=20.2')),
    ).toBe(true);
  });
});

describe('useRoutines household', () => {
  it('adds and removes a sensitive member and regenerates the plan', async () => {
    const { result } = renderHook(() => useRoutines());
    await flushAct();
    const airFilter = () =>
      result.current.routines.find(r => r.title === 'Run a clean-air device in the main room');
    expect(airFilter()?.priority).toBe('medium');

    act(() => {
      result.current.setMemberName('  Arjun  ');
      result.current.setMemberKind('respiratory');
    });
    act(() => result.current.handleAddMember());

    expect(result.current.household.members).toMatchObject([
      { name: 'Arjun', kind: 'respiratory' },
    ]);
    expect(result.current.memberName).toBe('');
    expect(result.current.sensitive).toBe(true);
    expect(airFilter()?.priority).toBe('high');

    act(() => result.current.removeMember(result.current.household.members[0]!.id));

    expect(result.current.household.members).toEqual([]);
    expect(result.current.sensitive).toBe(false);
    expect(airFilter()?.priority).toBe('medium');
  });
});

describe('useRoutines persistence', () => {
  it('persists household, community watch and generated context, then clears the saved badge', async () => {
    const { result } = renderHook(() => useRoutines());
    await flushAct();

    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.saving).toBe(false);
    expect(result.current.saved).toBe(true);
    expect(result.current.error).toBe('');
    const saved = readStored<{
      household: { members: unknown[] };
      communityWatch: unknown[];
      routines: { title: string }[];
      routinePromptContext: string;
    }>('lifestyle');
    expect(saved.household).toEqual({ members: [] });
    expect(saved.communityWatch).toEqual([]);
    expect(saved.routines.map(r => r.title)).toEqual(result.current.routines.map(r => r.title));
    expect(saved.routinePromptContext).toContain('Time your window opening');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.saved).toBe(false);
  });
});

describe('useRoutines persistence errors', () => {
  it('surfaces a persistence error when Firestore and local storage both fail', async () => {
    firebaseState.isFirebaseConfigured = true;
    firebaseState.db = { fake: 'db' };
    firestore.setDoc.mockRejectedValue(new Error('Firestore denied'));
    localStorageMock.setItem.mockImplementation((key: string, value: string) => {
      if (key.endsWith('_lifestyle')) throw new Error('Local write denied');
      store.set(key, value);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useRoutines());
    await flushAct();

    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.error).toBe('Local write denied');
    expect(result.current.saved).toBe(false);
    expect(result.current.saving).toBe(false);
    expect(firestore.setDoc).toHaveBeenCalled();
  });
});
