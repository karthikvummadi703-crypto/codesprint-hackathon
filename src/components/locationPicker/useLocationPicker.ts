/** Location search and geolocation state for the picker. */
import { useEffect, useState } from 'react';

import { useLocation } from '../../context/LocationContext';
import type { ActiveLocation } from '../../context/LocationContext';
import { reverseGeocode, searchLocations } from '../../services/backendService';
import type { PlaceSuggestion } from '../../services/backendService';

interface Options {
  onPicked?: (loc: ActiveLocation) => void;
}

export function useLocationPicker({ onPicked }: Options) {
  const { setLocation } = useLocation();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setActiveIndex(-1);
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
  }, [query]);

  const pick = (s: PlaceSuggestion) => {
    const loc: ActiveLocation = {
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      region: s.region,
      country: s.country,
    };
    setQuery(s.label || s.name);
    setShowSuggestions(false);
    setLocation(loc);
    onPicked?.(loc);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const place = await reverseGeocode(latitude, longitude);
          const loc: ActiveLocation = {
            name: [place.name, place.region, place.country].filter(Boolean).join(', ') || 'My location',
            latitude,
            longitude,
            region: place.region,
            country: place.country,
          };
          setQuery(loc.name);
          setLocation(loc);
          onPicked?.(loc);
        } catch {
          // A generic label is honest; fabricating a place name would not be.
          const loc: ActiveLocation = {
            name: 'My location',
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };
          setLocation(loc);
          onPicked?.(loc);
        } finally {
          setLocating(false);
        }
      },
      (e) => {
        setLocating(false);
        setError(
          e.code === e.PERMISSION_DENIED
            ? 'Location permission was denied. Search for a city instead.'
            : 'Could not determine your location. Search for a city instead.',
        );
      },
      { timeout: 10000 },
    );
  };

  return {
    query,
    setQuery,
    suggestions,
    searching,
    locating,
    error,
    showSuggestions,
    setShowSuggestions,
    activeIndex,
    setActiveIndex,
    pick,
    useMyLocation,
  };
}
