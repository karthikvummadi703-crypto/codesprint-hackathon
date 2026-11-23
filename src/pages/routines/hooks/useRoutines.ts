import { useAuth } from '../../../context/AuthContext';
import { useLocation } from '../../../context/LocationContext';
import type {
  AQIStatus,
  CommunityPlace,
  DailyRoutine,
  HouseholdMemberKind,
  HouseholdProfile,
  RoutineCategory,
} from '../../../types';
import type { PlaceSuggestion } from '../../../services/backendService';
import type { Dispatch, SetStateAction } from 'react';
import { useRoutineActions, useRoutineDerived } from './useRoutineActions';
import {
  useLocationAqiEffect,
  usePlaceAqiEffect,
  usePlaceSearchEffect,
  useRoutineState,
  useSavedSettingsEffect,
} from './useRoutineParts';

export interface RoutineController {
  aqi: number | null;
  status: AQIStatus | null;
  household: HouseholdProfile;
  places: CommunityPlace[];
  placeAqi: Record<string, number | null>;
  memberName: string;
  memberKind: HouseholdMemberKind;
  placeQuery: string;
  suggestions: PlaceSuggestion[];
  saving: boolean;
  saved: boolean;
  error: string;
  winter: boolean;
  sensitive: boolean;
  routines: DailyRoutine[];
  grouped: [RoutineCategory, DailyRoutine[]][];
  routineCount: number;
  setMemberName: Dispatch<SetStateAction<string>>;
  setMemberKind: Dispatch<SetStateAction<HouseholdMemberKind>>;
  setPlaceQuery: Dispatch<SetStateAction<string>>;
  handleSave: () => Promise<void>;
  handleAddMember: () => void;
  handleAddPlace: (place: PlaceSuggestion) => void;
  removeMember: (id: string) => void;
  removePlace: (id: string) => void;
}

/** Builds the routines controller from profile data, location AQI, and place search. */
export function useRoutines(): RoutineController {
  const { user } = useAuth();
  const { location } = useLocation();
  const state = useRoutineState();

  useSavedSettingsEffect(user, state.setHousehold, state.setPlaces);
  useLocationAqiEffect(location, state.setAqi, state.setStatus);
  usePlaceAqiEffect(state.places, state.setPlaceAqi);
  usePlaceSearchEffect(state.placeQuery, state.setSuggestions);

  const derived = useRoutineDerived(state);
  const actions = useRoutineActions(user, state, derived);

  return { ...state, ...derived, ...actions };
}
