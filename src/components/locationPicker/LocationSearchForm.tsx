/** Search form rendered by the location picker in both layouts. */
import { Loader2, MapPin, Navigation, Search } from 'lucide-react';

import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { useLocationPicker } from './useLocationPicker';

type Props = ReturnType<typeof useLocationPicker>;

export default function LocationSearchForm({
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
}: Props) {
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const chosen = activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0];
          if (chosen) pick(chosen);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
          <Input
            type="text"
            role="combobox"
            aria-label="Search for a city or place"
            aria-expanded={showSuggestions && (searching || suggestions.length > 0)}
            aria-controls={
              showSuggestions && (searching || suggestions.length > 0)
                ? 'location-picker-suggestions'
                : undefined
            }
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `location-picker-option-${activeIndex}` : undefined}
            placeholder="Search for a city or place..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
              setActiveIndex(-1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, -1));
              } else if (e.key === 'Escape') {
                setShowSuggestions(false);
                setActiveIndex(-1);
              } else if (e.key === 'Enter' && activeIndex >= 0 && suggestions[activeIndex]) {
                e.preventDefault();
                pick(suggestions[activeIndex]);
              }
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            className="pl-9 h-10 border-slate-200"
            autoComplete="off"
          />
          {showSuggestions && (searching || suggestions.length > 0) && (
            <ul
              id="location-picker-suggestions"
              role="listbox"
              aria-label="Location suggestions"
              className="absolute top-11 left-0 right-0 z-20 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
            >
              {searching && suggestions.length === 0 && (
                <li className="px-4 py-3 text-xs text-slate-400 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                </li>
              )}
              {suggestions.map((s, i) => (
                <li key={`${s.latitude}-${s.longitude}-${i}`} role="presentation">
                  <button
                    id={`location-picker-option-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === activeIndex}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(s)}
                    className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-start gap-2 ${
                      i === activeIndex ? 'bg-brand-50' : ''
                    }`}
                  >
                    <MapPin className="h-4 w-4 text-brand-600 mt-0.5 shrink-0" aria-hidden="true" />
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
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="h-10 px-4 shrink-0"
          disabled={suggestions.length === 0}
        >
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
          aria-label="Use my current location"
        >
          {locating ? (
            <Loader2 className="h-4 w-4 text-brand-700 animate-spin" aria-hidden="true" />
          ) : (
            <Navigation className="h-4 w-4 text-brand-700" aria-hidden="true" />
          )}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-[11px] text-red-600 mt-2">
          {error}
        </p>
      )}
    </>
  );
}
