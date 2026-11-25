/** Dashboard data loading and location-search state. */
import { useCallback, useEffect, useState } from 'react';
import type React from 'react';

import type { AppUser } from '../../services/authService';
import { fetchAQI, reverseGeocode, searchLocations } from '../../services/backendService';
import type { PlaceSuggestion } from '../../services/backendService';
import { addAirQualityRecord } from '../../services/dataService';
import { useLocation } from '../../context/LocationContext';
import type { ActiveLocation } from '../../context/LocationContext';
import { toLocationParams } from '../../context/LocationContext';
import type { AirQualityData, HistoricalDataPoint } from '../../types';

interface Options {
  user: AppUser | null;
  activeLocation: ActiveLocation | null;
  setLocation: ReturnType<typeof useLocation>['setLocation'];
}

export function useDashboard({ user, activeLocation, setLocation }: Options) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searching, setSearching] = useState(false);
  const [currentLocation, setCurrentLocation] = useState('');
  // No seeded sample values: until the provider answers there is nothing to
  // show, and a placeholder reading is worse than an honest empty state.
  const [aqiData, setAqiData] = useState<AirQualityData | null>(null);
  const [history, setHistory] = useState<HistoricalDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isEstimated, setIsEstimated] = useState(false);

  const loadFromBackend = useCallback(
    async (params: { lat?: number; lon?: number; city?: string }, locationLabel: string, force = false) => {
      setLoading(true);
      setError('');
      setShowSuggestions(false);
      try {
        const data = await fetchAQI({ ...params, force });
        const aq: AirQualityData = {
          aqi: Number(data.aqi),
          status: data.status,
          dominantPollutant: data.dominantPollutant,
          healthAdvisory: data.healthAdvisory,
          location: {
            name: data.location?.name || locationLabel,
            latitude: Number(data.location?.latitude ?? params.lat ?? 0),
            longitude: Number(data.location?.longitude ?? params.lon ?? 0),
            region: data.location?.region,
            country: data.location?.country,
          },
          pollutants: Array.isArray(data.pollutants) ? data.pollutants : [],
          timestamp: data.timestamp || new Date().toISOString(),
          change24h: Number(data.change24h ?? 0),
        };
        setAqiData(aq);
        setCurrentLocation(aq.location.name);
        setIsEstimated(Boolean((data as { isEstimated?: boolean }).isEstimated));
        // Persist the resolved location so every other page uses it until changed.
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
          addAirQualityRecord(user.uid, {
            aqi: aq.aqi,
            status: aq.status,
            dominantPollutant: aq.dominantPollutant,
            location: aq.location.name,
            lat: aq.location.latitude,
            lon: aq.location.longitude,
            timestamp: aq.timestamp,
          }).catch(() => {});
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        // Drop the reading rather than leaving the previous location's numbers
        // on screen under the new location's name.
        setAqiData(null);
        setCurrentLocation(locationLabel);
      } finally {
        setLoading(false);
      }
    },
    [user, setLocation],
  );

  useEffect(() => {
    // App.tsx blocks rendering until a location exists, so this is only a
    // type-level guard rather than a real state the user can reach.
    if (!activeLocation) return;
    // Always load the pinned location; coordinates win over the name.
    loadFromBackend(toLocationParams(activeLocation), activeLocation.name).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFromBackend, activeLocation?.name, activeLocation?.latitude, activeLocation?.longitude]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSuggestions([]);
      setActiveSuggestion(-1);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchLocations(q, 5)
        .then((results) => {
          if (!cancelled) setSuggestions(results);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
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

  const handleLocationSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    const best = activeSuggestion >= 0 ? suggestions[activeSuggestion] : suggestions[0];
    if (best?.latitude) {
      selectSuggestion(best);
    } else {
      // Pin by city name only; coordinates resolve on the backend response.
      setLocation({ name: q });
      loadFromBackend({ city: q }, q).catch(() => {});
    }
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    setLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let label = 'My Location';
        try {
          const place = await reverseGeocode(latitude, longitude);
          label = [place.name, place.region, place.country].filter(Boolean).join(', ') || 'My Location';
        } catch {
          // keep generic label if reverse geocoding fails
        }
        setLocation({ name: label, latitude, longitude });
        loadFromBackend({ lat: latitude, lon: longitude }, label).catch(() => {});
      },
      (err) => {
        setLoading(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Enable location access or search manually.'
            : err.code === err.POSITION_UNAVAILABLE
              ? 'Location unavailable. Please search for a city instead.'
              : 'Unable to fetch your location. Please try again.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const retry = () => {
    if (!activeLocation) return;
    loadFromBackend(toLocationParams(activeLocation), activeLocation.name, true).catch(() => {});
  };

  return {
    searchQuery,
    setSearchQuery,
    suggestions,
    activeSuggestion,
    setActiveSuggestion,
    showSuggestions,
    setShowSuggestions,
    searching,
    currentLocation,
    aqiData,
    history,
    loading,
    error,
    isEstimated,
    loadFromBackend,
    handleLocationSearch,
    selectSuggestion,
    handleUseMyLocation,
    retry,
  };
}
