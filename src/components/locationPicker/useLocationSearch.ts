import { useEffect, useState } from 'react';
import type { ActiveLocation } from '../../context/LocationContext';
import { searchLocations, type PlaceSuggestion } from '../../services/backendService';
import { toActiveLocation } from './locationPickerUtils';
import type { LocationSearchState } from './types';

export function useLocationSearch(commit: (loc: ActiveLocation) => void): LocationSearchState {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      /* eslint-disable react-hooks/set-state-in-effect -- Clearing stale suggestions here preserves the existing query-change timing. */
      setSuggestions([]);
      setActiveIndex(-1);
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
  }, [query]);

  const pick = (s: PlaceSuggestion) => {
    setQuery(s.label || s.name);
    setShowSuggestions(false);
    commit(toActiveLocation(s));
  };

  return {
    query,
    setQuery,
    suggestions,
    searching,
    showSuggestions,
    setShowSuggestions,
    activeIndex,
    setActiveIndex,
    pick,
  };
}
