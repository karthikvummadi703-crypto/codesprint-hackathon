import React, { useEffect, useState } from 'react';
import { MapPin, Navigation, Search, Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { searchLocations, reverseGeocode, PlaceSuggestion } from '../services/backendService';
import { useLocation, ActiveLocation } from '../context/LocationContext';

interface LocationPickerProps {
  /** Rendered inline inside a card rather than as a blocking first-run screen. */
  compact?: boolean;
  onPicked?: (loc: ActiveLocation) => void;
}

/**
 * Location chooser.
 *
 * There is deliberately no default location. A first-time visitor outside the
 * project author's city would otherwise see unrelated air quality data with no
 * indication that it was not theirs.
 */
export default function LocationPicker({ compact = false, onPicked }: LocationPickerProps) {
  const { setLocation } = useLocation();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
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
          const loc: ActiveLocation = { name: 'My location', latitude: pos.coords.latitude, longitude: pos.coords.longitude };
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
            : 'Could not determine your location. Search for a city instead.'
        );
      },
      { timeout: 10000 }
    );
  };

  const body = (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (suggestions[0]) pick(suggestions[0]);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Search for a city or place..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            className="pl-9 h-10 border-slate-200"
            autoComplete="off"
          />
          {showSuggestions && (searching || suggestions.length > 0) && (
            <ul className="absolute top-11 left-0 right-0 z-20 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {searching && suggestions.length === 0 && (
                <li className="px-4 py-3 text-xs text-slate-400 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                </li>
              )}
              {suggestions.map((s, i) => (
                <li key={`${s.latitude}-${s.longitude}-${i}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(s)}
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-start gap-2"
                  >
                    <MapPin className="h-4 w-4 text-brand-600 mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800 truncate">{s.name}</span>
                      <span className="block text-xs text-slate-400 truncate">
                        {[s.region, s.country].filter(Boolean).join(', ') || s.label}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-10 px-4 shrink-0" disabled={suggestions.length === 0}>
          Set
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-10 px-3 shrink-0"
          onClick={useMyLocation}
          disabled={locating}
          title="Use my current location"
        >
          {locating ? (
            <Loader2 className="h-4 w-4 text-brand-700 animate-spin" />
          ) : (
            <Navigation className="h-4 w-4 text-brand-700" />
          )}
        </Button>
      </form>
      {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
    </>
  );

  if (compact) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 text-left">
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Choose a location</h3>
        <p className="text-xs text-slate-500 mb-4">
          AirGuard has no readings until you tell it where to look. Nothing is guessed on your behalf.
        </p>
        {body}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
        <div className="p-3 bg-brand-50 rounded-xl text-brand-700 inline-flex mb-4">
          <MapPin className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Where should we measure?</h1>
        <p className="text-sm text-slate-500 mt-2 mb-6">
          AirGuard reports air quality for a real place, so it needs a location before it can show
          anything. We do not pick one for you.
        </p>
        {body}
        <p className="text-[11px] text-slate-400 mt-5">
          You can change this at any time from the dashboard.
        </p>
      </div>
    </div>
  );
}
