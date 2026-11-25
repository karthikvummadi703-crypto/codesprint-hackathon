/**
 * Routines page hook for AQI-aware suggestions, location lookup, and persisted
 * household settings.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocation, toLocationParams } from '../../context/LocationContext';
import { fetchAQI, searchLocations, PlaceSuggestion } from '../../services/backendService';
import { getLifestyleSettings, saveLifestyleSettings } from '../../services/dataService';
import {
  buildDailyRoutines,
  hasSensitiveMembers,
  isWinterSmogSeason,
  routinesToPromptContext,
} from '../../services/lifestyleService';
import {
  AQIStatus,
  CommunityPlace,
  DailyRoutine,
  HouseholdMemberKind,
  HouseholdProfile,
  RoutineCategory,
} from '../../types';
import { newId } from './constants';

export function useRoutines() {
  const { user } = useAuth();
  const { location } = useLocation();
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

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    getLifestyleSettings(user.uid)
      .then((data) => {
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
  }, [user]);

  useEffect(() => {
    if (!location) return undefined;
    let cancelled = false;
    fetchAQI(toLocationParams(location))
      .then((data) => {
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
  }, [location]);

  useEffect(() => {
    let cancelled = false;
    if (places.length === 0) {
      setPlaceAqi({});
      return undefined;
    }
    void Promise.all(
      places.map(async (place) => {
        try {
          const data = await fetchAQI({ lat: place.latitude, lon: place.longitude });
          return [place.id, typeof data.aqi === 'number' ? data.aqi : Number(data.aqi) || null] as const;
        } catch {
          return [place.id, null] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setPlaceAqi(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [places]);

  useEffect(() => {
    const q = placeQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchLocations(q, 5)
        .then((results) => {
          if (!cancelled) setSuggestions(results);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placeQuery]);

  const winter = isWinterSmogSeason();
  const sensitive = hasSensitiveMembers(household);
  const routines = useMemo(() => buildDailyRoutines({ aqi, status, household }), [aqi, status, household]);
  const grouped = useMemo(() => {
    const map = new Map<RoutineCategory, DailyRoutine[]>();
    for (const routine of routines) {
      const list = map.get(routine.category) ?? [];
      list.push(routine);
      map.set(routine.category, list);
    }
    return Array.from(map.entries());
  }, [routines]);

  const promptContext = useMemo(() => routinesToPromptContext(routines, household), [routines, household]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      await saveLifestyleSettings(user.uid, {
        household,
        communityWatch: places,
        routines,
        routinePromptContext: promptContext,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = () => {
    const name = memberName.trim();
    if (!name) return;
    setHousehold((prev) => ({
      ...prev,
      members: [...prev.members, { id: newId('member'), name, kind: memberKind }],
    }));
    setMemberName('');
  };

  const handleAddPlace = (place: PlaceSuggestion) => {
    setPlaces((prev) => [
      ...prev,
      {
        id: newId('place'),
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        label: place.label,
      },
    ]);
    setPlaceQuery('');
    setSuggestions([]);
  };

  const routineCount = routines.length;

  return {
    location,
    aqi,
    status,
    household,
    setHousehold,
    places,
    setPlaces,
    placeAqi,
    memberName,
    setMemberName,
    memberKind,
    setMemberKind,
    placeQuery,
    setPlaceQuery,
    suggestions,
    saving,
    saved,
    error,
    winter,
    sensitive,
    grouped,
    promptContext,
    routineCount,
    handleSave,
    handleAddMember,
    handleAddPlace,
  };
}
