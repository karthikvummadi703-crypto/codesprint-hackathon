import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import {
  fetchAQI,
  searchLocations,
  reverseGeocode,
  type PlaceSuggestion,
} from '../../../services/backendService';
import { useAuth } from '../../../context/AuthContext';
import {
  useLocation,
  toLocationParams,
  type ActiveLocation,
} from '../../../context/LocationContext';
import { addAirQualityRecord } from '../../../services/dataService';
import type { AirQualityData, HistoricalDataPoint } from '../../../types';
import {
  toAirQuality,
  toAirQualityRecord,
  geolocationErrorMessage,
  type ReadingParams,
} from '../utils/dashboardData';

export interface DashboardController {
  searchQuery: string;
  suggestions: PlaceSuggestion[];
  activeSuggestion: number;
  showSuggestions: boolean;
  searching: boolean;
  currentLocation: string;
  aqiData: AirQualityData | null;
  history: HistoricalDataPoint[];
  loading: boolean;
  error: string;
  isEstimated: boolean;
  loadFromBackend: (params: ReadingParams, locationLabel: string, force?: boolean) => Promise<void>;
  handleLocationSearch: (e: FormEvent) => void;
  handleSearchChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleSearchKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  handleSearchFocus: () => void;
  handleSearchBlur: () => void;
  selectSuggestion: (s: PlaceSuggestion) => void;
  handleUseMyLocation: () => void;
}

export function useDashboardController(): DashboardController {
  const { user } = useAuth();
  const { location: activeLocation, setLocation } = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [currentLocation, setCurrentLocation] = useState('');
  const [aqiData, setAqiData] = useState<AirQualityData | null>(null);
  const [history, setHistory] = useState<HistoricalDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isEstimated, setIsEstimated] = useState(false);

  const loadFromBackend = useCallback(
    async (params: ReadingParams, locationLabel: string, force = false) => {
      setLoading(true);
      setError('');
      setShowSuggestions(false);
      try {
        const data = await fetchAQI({ ...params, force });
        const aq = toAirQuality(data, locationLabel, params);
        setAqiData(aq);
        setCurrentLocation(aq.location.name);
        setIsEstimated(Boolean((data as { isEstimated?: boolean }).isEstimated));
        setLocation({
          name: aq.location.name,
          latitude: aq.location.latitude,
          longitude: aq.location.longitude,
          region: aq.location.region,
          country: aq.location.country,
        });
        if (Array.isArray(data.historical) && data.historical.length > 0) {
          setHistory(data.historical);
        }
        if (user) {
          addAirQualityRecord(user.uid, toAirQualityRecord(aq)).catch(() => {});
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setAqiData(null);
        setCurrentLocation(locationLabel);
      } finally {
        setLoading(false);
      }
    },
    [user, setLocation],
  );

  useEffect(() => {
    if (!activeLocation) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Backend refresh is intentionally started from this location effect.
    loadFromBackend(toLocationParams(activeLocation), activeLocation.name).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFromBackend, activeLocation?.name, activeLocation?.latitude, activeLocation?.longitude]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      /* eslint-disable react-hooks/set-state-in-effect -- Clearing stale suggestions here preserves the existing query-change timing. */
      setSuggestions([]);
      setActiveSuggestion(-1);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      searchLocations(q, 5)
        .then(setSuggestions)
        .catch(() => setSuggestions([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const selectSuggestion = (s: PlaceSuggestion) => {
    setSearchQuery(s.label || s.name);
    setShowSuggestions(false);
    const pinned: ActiveLocation = {
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      region: s.region,
      country: s.country,
    };
    setLocation(pinned);
    loadFromBackend({ lat: s.latitude, lon: s.longitude }, s.name).catch(() => {});
  };

  const handleLocationSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    const best = activeSuggestion >= 0 ? suggestions[activeSuggestion] : suggestions[0];
    if (best?.latitude) {
      selectSuggestion(best);
    } else {
      setLocation({ name: q });
      loadFromBackend({ city: q }, q).catch(() => {});
    }
  };

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setShowSuggestions(true);
    setActiveSuggestion(-1);
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion(i => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setActiveSuggestion(-1);
    } else if (e.key === 'Enter' && activeSuggestion >= 0 && suggestions[activeSuggestion]) {
      e.preventDefault();
      selectSuggestion(suggestions[activeSuggestion]);
    }
  };

  const handleSearchFocus = () => setShowSuggestions(true);
  const handleSearchBlur = () => setTimeout(() => setShowSuggestions(false), 150);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    setLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        let label = 'My Location';
        try {
          const place = await reverseGeocode(latitude, longitude);
          label = [place.name, place.region, place.country].filter(Boolean).join(', ') || label;
        } catch {
          // keep generic label if reverse geocoding fails
        }
        setLocation({ name: label, latitude, longitude });
        loadFromBackend({ lat: latitude, lon: longitude }, label).catch(() => {});
      },
      err => {
        setLoading(false);
        setError(geolocationErrorMessage(err));
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return {
    searchQuery,
    suggestions,
    activeSuggestion,
    showSuggestions,
    searching,
    currentLocation,
    aqiData,
    history,
    loading,
    error,
    isEstimated,
    loadFromBackend,
    handleLocationSearch,
    handleSearchChange,
    handleSearchKeyDown,
    handleSearchFocus,
    handleSearchBlur,
    selectSuggestion,
    handleUseMyLocation,
  };
}
