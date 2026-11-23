import type { Dispatch, SetStateAction } from 'react';
import type { ActiveLocation } from '../../context/LocationContext';
import type { PlaceSuggestion } from '../../services/backendService';

export interface LocationPickerProps {
  /** Rendered inline inside a card rather than as a blocking first-run screen. */
  compact?: boolean;
  onPicked?: (loc: ActiveLocation) => void;
}

export interface LocationSearchState {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  suggestions: PlaceSuggestion[];
  searching: boolean;
  showSuggestions: boolean;
  setShowSuggestions: Dispatch<SetStateAction<boolean>>;
  activeIndex: number;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  pick: (s: PlaceSuggestion) => void;
}

export interface GeolocationState {
  locating: boolean;
  error: string;
  useMyLocation: () => void;
}

export type LocationPickerController = LocationSearchState & GeolocationState;
