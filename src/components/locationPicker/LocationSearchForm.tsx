import React from 'react';
import { Navigation, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { LocationSearchField } from './LocationSearchField';
import type { LocationPickerController } from './types';

export function LocationSearchForm({ controller }: { controller: LocationPickerController }) {
  const { suggestions, activeIndex, locating, error, pick, useMyLocation } = controller;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const chosen = activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0];
    if (chosen) pick(chosen);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <LocationSearchField search={controller} />
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
