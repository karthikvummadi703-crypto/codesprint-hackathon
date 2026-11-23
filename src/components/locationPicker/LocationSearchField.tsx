import { Search } from 'lucide-react';
import { LocationSearchBox } from './LocationSearchBox';
import { LocationSuggestions } from './LocationSuggestions';
import type { LocationSearchState } from './types';

export function LocationSearchField({ search }: { search: LocationSearchState }) {
  const { showSuggestions, searching, suggestions } = search;

  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <LocationSearchBox search={search} />
      {showSuggestions && (searching || suggestions.length > 0) && (
        <LocationSuggestions search={search} />
      )}
    </div>
  );
}
