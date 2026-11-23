import { MapPin, Loader2 } from 'lucide-react';
import type { LocationSearchState } from './types';

export function LocationSuggestions({ search }: { search: LocationSearchState }) {
  const { suggestions, searching, activeIndex, pick } = search;

  return (
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
            onMouseDown={e => e.preventDefault()}
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
  );
}
