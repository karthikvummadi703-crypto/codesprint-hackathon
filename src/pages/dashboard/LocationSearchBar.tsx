/** Dashboard header location search form. */
import { MapPin, Navigation, Search } from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import type { useDashboard } from './useDashboard';

type Props = ReturnType<typeof useDashboard>;

export default function LocationSearchBar({
  searchQuery,
  setSearchQuery,
  suggestions,
  activeSuggestion,
  setActiveSuggestion,
  showSuggestions,
  setShowSuggestions,
  searching,
  handleLocationSearch,
  selectSuggestion,
  handleUseMyLocation,
}: Props) {
  return (
    <form onSubmit={handleLocationSearch} className="flex gap-2 w-full md:max-w-md relative">
      <div className="relative flex-1">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
          aria-hidden="true"
        />
        <Input
          type="text"
          role="combobox"
          aria-label="Search city or location"
          aria-expanded={showSuggestions && (searching || suggestions.length > 0)}
          aria-controls={
            showSuggestions && (searching || suggestions.length > 0)
              ? 'dashboard-location-suggestions'
              : undefined
          }
          aria-autocomplete="list"
          aria-activedescendant={
            activeSuggestion >= 0 ? `dashboard-location-option-${activeSuggestion}` : undefined
          }
          placeholder="Search city or location..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowSuggestions(true);
            setActiveSuggestion(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveSuggestion((i) => Math.max(i - 1, -1));
            } else if (e.key === 'Escape') {
              setShowSuggestions(false);
              setActiveSuggestion(-1);
            } else if (e.key === 'Enter' && activeSuggestion >= 0 && suggestions[activeSuggestion]) {
              e.preventDefault();
              selectSuggestion(suggestions[activeSuggestion]);
            }
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          className="pl-9 h-10 border-slate-200"
        />
        {showSuggestions && (searching || suggestions.length > 0) && (
          <ul
            id="dashboard-location-suggestions"
            role="listbox"
            aria-label="Location suggestions"
            className="absolute top-11 left-0 right-0 z-20 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
          >
            {searching && suggestions.length === 0 && (
              <li className="px-4 py-3 text-xs text-slate-400">Searching locations...</li>
            )}
            {suggestions.map((s, i) => (
              <li key={`${s.latitude}-${s.longitude}-${i}`} role="presentation">
                <button
                  id={`dashboard-location-option-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === activeSuggestion}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSuggestion(s)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-start gap-2 ${
                    i === activeSuggestion ? 'bg-brand-50' : ''
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
      <Button type="submit" variant="outline" size="sm" className="h-10 px-4">
        Search
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-10 px-3 shrink-0"
        onClick={handleUseMyLocation}
        title="Use my location"
        aria-label="Use my location"
      >
        <Navigation className="h-4 w-4 text-brand-700" aria-hidden="true" />
      </Button>
    </form>
  );
}
