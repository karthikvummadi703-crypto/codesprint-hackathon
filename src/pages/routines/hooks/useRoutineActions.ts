import { useCallback, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import type { PlaceSuggestion } from '../../../services/backendService';
import { saveLifestyleSettings } from '../../../services/dataService';
import {
  buildDailyRoutines,
  hasSensitiveMembers,
  isWinterSmogSeason,
  routinesToPromptContext,
} from '../../../services/lifestyleService';
import { groupRoutines, newId } from '../modules/constants';
import { RoutineState } from './useRoutineParts';

type User = ReturnType<typeof useAuth>['user'];

export function useRoutineDerived(state: RoutineState) {
  const winter = isWinterSmogSeason();
  const sensitive = hasSensitiveMembers(state.household);
  const routines = useMemo(
    () => buildDailyRoutines({ aqi: state.aqi, status: state.status, household: state.household }),
    [state.aqi, state.status, state.household],
  );
  const grouped = useMemo(() => groupRoutines(routines), [routines]);
  const promptContext = useMemo(
    () => routinesToPromptContext(routines, state.household),
    [routines, state.household],
  );
  return {
    winter,
    sensitive,
    routines,
    grouped,
    promptContext,
    routineCount: routines.length,
  };
}

export type RoutineDerived = ReturnType<typeof useRoutineDerived>;

export function useSaveAction(user: User, state: RoutineState, derived: RoutineDerived) {
  const handleSave = useCallback(async () => {
    if (!user) return;
    state.setSaving(true);
    state.setError('');
    try {
      await saveLifestyleSettings(user.uid, {
        household: state.household,
        communityWatch: state.places,
        routines: derived.routines,
        routinePromptContext: derived.promptContext,
      });
      state.setSaved(true);
      setTimeout(() => state.setSaved(false), 2000);
    } catch (err) {
      state.setError(err instanceof Error ? err.message : String(err));
    } finally {
      state.setSaving(false);
    }
  }, [user, state, derived]);
  return handleSave;
}

export function useHouseholdActions(state: RoutineState) {
  const handleAddMember = useCallback(() => {
    const name = state.memberName.trim();
    if (!name) return;
    state.setHousehold(prev => ({
      ...prev,
      members: [...prev.members, { id: newId('member'), name, kind: state.memberKind }],
    }));
    state.setMemberName('');
  }, [state]);

  const removeMember = useCallback(
    (id: string) => {
      state.setHousehold(prev => ({
        ...prev,
        members: prev.members.filter(m => m.id !== id),
      }));
    },
    [state],
  );

  return { handleAddMember, removeMember };
}

export function usePlaceActions(state: RoutineState) {
  const handleAddPlace = useCallback(
    (place: PlaceSuggestion) => {
      state.setPlaces(prev => [
        ...prev,
        {
          id: newId('place'),
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
          label: place.label,
        },
      ]);
      state.setPlaceQuery('');
      state.setSuggestions([]);
    },
    [state],
  );

  const removePlace = useCallback(
    (id: string) => state.setPlaces(prev => prev.filter(p => p.id !== id)),
    [state],
  );

  return { handleAddPlace, removePlace };
}

export function useRoutineActions(user: User, state: RoutineState, derived: RoutineDerived) {
  const handleSave = useSaveAction(user, state, derived);
  const householdActions = useHouseholdActions(state);
  const placeActions = usePlaceActions(state);
  return { handleSave, ...householdActions, ...placeActions };
}
