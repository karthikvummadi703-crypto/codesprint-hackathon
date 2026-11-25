/**
 * Location search, pinning, and geolocation picker used across pages.
 */
import { MapPin } from 'lucide-react';

import type { ActiveLocation } from '../context/LocationContext';
import LocationSearchForm from './locationPicker/LocationSearchForm';
import { useLocationPicker } from './locationPicker/useLocationPicker';

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
  const picker = useLocationPicker({ onPicked });
  const body = <LocationSearchForm {...picker} />;

  if (compact) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 text-left">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Choose a location</h2>
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
          AirGuard reports air quality for a real place, so it needs a location before it can show anything.
          We do not pick one for you.
        </p>
        {body}
        <p className="text-[11px] text-slate-400 mt-5">You can change this at any time from the dashboard.</p>
      </div>
    </div>
  );
}
