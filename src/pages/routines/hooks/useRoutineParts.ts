import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useAuth } from '../../../context/AuthContext';
import type { ActiveLocation } from '../../../context/LocationContext';
import { toLocationParams } from '../../../context/LocationContext';
import { fetchAQI, searchLocations, PlaceSuggestion } from '../../../services/backendService';
import { getLifestyleSettings } from '../../../services/dataService';
import type {
  AQIStatus,
  CommunityPlace,
  HouseholdMemberKind,
  HouseholdProfile,
} from '../../../types';

type User = ReturnType<typeof useAuth>['user'];

export function useRoutineState() {
  const [aqi, setAqi] = useState<number | null>(null);
  const [status, setStatus] = useState<AQIStatus | null>(null);
  const [household, setHousehold] = useState<HouseholdProfile>({ members: [] });
  const [places, setPlaces] = useState<CommunityPlace[]>([]);
  const [placeAqi, setPlaceAqi] = useState<Record<string, number | null>>({});
  const [memberName, setMemberName] = useState('');
  const [memberKind, setMemberKind] = useState<HouseholdMemberKind>('adult');
  const [placeQuery, setPlaceQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  return {
    aqi,
    setAqi,
    status,
    setStatus,
    household,
    setHousehold,
    places,
    setPlaces,
    placeAqi,
    setPlaceAqi,
    memberName,
    setMemberName,
    memberKind,
    setMemberKind,
    placeQuery,
    setPlaceQuery,
    suggestions,
    setSuggestions,
    saving,
    setSaving,
    saved,
    setSaved,
    error,
    setError,
  };
}

export type RoutineState = ReturnType<typeof useRoutineState>;

export function useSavedSettingsEffect(
  user: User,
  setHousehold: Dispatch<SetStateAction<HouseholdProfile>>,
  setPlaces: Dispatch<SetStateAction<CommunityPlace[]>>,
) {
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getLifestyleSettings(user.uid)
      .then(data => {
        if (cancelled || !data) return;
        if (data.household && typeof data.household === 'object') {
          setHousehold(data.household as HouseholdProfile);
        }
        if (Array.isArray(data.communityWatch)) {
          setPlaces(data.communityWatch as CommunityPlace[]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, setHousehold, setPlaces]);
}

export function useLocationAqiEffect(
  location: ActiveLocation | null,
  setAqi: Dispatch<SetStateAction<number | null>>,
  setStatus: Dispatch<SetStateAction<AQIStatus | null>>,
) {
  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    fetchAQI(toLocationParams(location))
      .then(data => {
        if (cancelled) return;
        setAqi(typeof data.aqi === 'number' ? data.aqi : Number(data.aqi) || null);
        setStatus((data.status as AQIStatus) ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setAqi(null);
          setStatus(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [location, setAqi, setStatus]);
}

export function usePlaceAqiEffect(
  places: CommunityPlace[],
  setPlaceAqi: Dispatch<SetStateAction<Record<string, number | null>>>,
) {
  useEffect(() => {
    let cancelled = false;
    if (places.length === 0) {
      setPlaceAqi({});
      return;
    }
    void Promise.all(
      places.map(async place => {
        try {
          const data = await fetchAQI({ lat: place.latitude, lon: place.longitude });
          return [
            place.id,
            typeof data.aqi === 'number' ? data.aqi : Number(data.aqi) || null,
          ] as const;
        } catch {
          return [place.id, null] as const;
        }
      }),
    ).then(entries => {
      if (!cancelled) setPlaceAqi(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [places, setPlaceAqi]);
}

export function usePlaceSearchEffect(
  placeQuery: string,
  setSuggestions: Dispatch<SetStateAction<PlaceSuggestion[]>>,
) {
  useEffect(() => {
    const q = placeQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      searchLocations(q, 5)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [placeQuery, setSuggestions]);
}
