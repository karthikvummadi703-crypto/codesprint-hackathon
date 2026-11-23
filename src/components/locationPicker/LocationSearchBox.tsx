import React from 'react';
import { Input } from '../ui/Input';
import type { LocationSearchState } from './types';

export function LocationSearchBox({ search }: { search: LocationSearchState }) {
  const { query, setQuery, suggestions, searching, showSuggestions, activeIndex } = search;
  const { setShowSuggestions, setActiveIndex, pick } = search;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setActiveIndex(-1);
    } else if (e.key === 'Enter' && activeIndex >= 0 && suggestions[activeIndex]) {
      e.preventDefault();
      pick(suggestions[activeIndex]);
    }
  };

  return (
    <Input
      type="text"
      role="combobox"
      aria-label="Search for a city or place"
      aria-expanded={showSuggestions && (searching || suggestions.length > 0)}
      aria-controls="location-picker-suggestions"
      aria-autocomplete="list"
      aria-activedescendant={activeIndex >= 0 ? `location-picker-option-${activeIndex}` : undefined}
      placeholder="Search for a city or place..."
      value={query}
      onChange={e => {
        setQuery(e.target.value);
        setShowSuggestions(true);
        setActiveIndex(-1);
      }}
      onKeyDown={handleKeyDown}
      onFocus={() => setShowSuggestions(true)}
      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
      className="pl-9 h-10 border-slate-200"
      autoComplete="off"
    />
  );
}
